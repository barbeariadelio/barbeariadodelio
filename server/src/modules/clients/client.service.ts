import mongoose from 'mongoose';
import { ClientModel, IClient } from './client.model';
import { NotFoundError, ForbiddenError, AppError } from '../../shared/errors/AppError';
import { getPhoneVariants, normalizePhone } from '../../shared/utils/phone';
import { ClientOwnershipService } from './client-ownership.service';
import { UserModel } from '../auth/auth.model';
import { escapeRegex } from '../../shared/utils/regex';

// Reassigning a client to a different unit, or re-linking it to a different
// login account, moves the record (and its full history) across the unit
// boundary — only the owner (full administrative access) may do that.
const OWNER_ONLY_CLIENT_FIELDS = ['unitId', 'userId'];

const clientOwnershipService = new ClientOwnershipService();

const populateOptions = {
  path: 'packages.packageId',
  populate: { path: 'packageItems.serviceId', select: 'name' }
};

export class ClientService {
  async findByUnit(unitId: string, pagination?: { skip: number, limit: number }): Promise<IClient[]> {
    // _id tiebreaker keeps skip/limit pages stable when names repeat.
    let query = ClientModel.find({ unitId }).populate(populateOptions).sort({ name: 1, _id: 1 });
    if (pagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }
    return query;
  }

  async search(unitId: string, query: string, pagination?: { skip: number, limit: number }): Promise<IClient[]> {
    const safeQuery = escapeRegex(query);
    const orConditions: Record<string, unknown>[] = [
      { name: { $regex: safeQuery, $options: 'i' } },
      { phone: { $regex: safeQuery, $options: 'i' } },
    ];

    // Phones are always stored digits-only (see ClientForm/AppointmentForm),
    // but staff naturally type/search with the masked format the UI displays
    // back to them, e.g. "(11) 99999-8888". Also match against the
    // digits-only version of the query so a masked phone still finds the
    // client instead of silently returning nothing.
    const digitsOnly = query.replace(/\D/g, '');
    if (digitsOnly && digitsOnly !== safeQuery) {
      orConditions.push({ phone: { $regex: escapeRegex(digitsOnly), $options: 'i' } });
    }

    let q = ClientModel.find({
      unitId,
      $or: orConditions,
    }).populate(populateOptions).sort({ name: 1, _id: 1 });

    if (pagination) {
      q = q.skip(pagination.skip).limit(pagination.limit);
    }

    return q;
  }

  async findById(id: string): Promise<IClient> {
    const client = await ClientModel.findById(id).populate(populateOptions);
    if (!client) throw new NotFoundError('Client');
    return client;
  }

  async create(data: Partial<IClient>): Promise<IClient> {
    const phoneDigits = normalizePhone(data.phone);
    const phoneVariants = getPhoneVariants(data.phone);

    if (phoneVariants.length && data.unitId) {
      const existing = await ClientModel.findOne({ unitId: data.unitId, phone: { $in: phoneVariants } });
      if (existing) {
        throw new AppError('Este telefone já está cadastrado.', 409, 'DUPLICATE_RESOURCE', { phone: 'Este telefone já está cadastrado.' });
      }
    }

    const clientData: Partial<IClient> = phoneDigits ? { ...data, phone: phoneDigits } : data;
    if (!clientData.userId && phoneDigits) {
      const matchingUser = await clientOwnershipService.findActiveClientUserByPhone(phoneDigits);
      if (matchingUser) clientData.userId = matchingUser._id;
    }

    return ClientModel.create(clientData);
  }

  async findOrCreateForUserAndUnit(userId: string, unitId: string): Promise<IClient> {
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError('User');

    const existingByUser = await ClientModel.findOne({ userId, unitId });
    if (existingByUser) return existingByUser;

    const phoneVariants = getPhoneVariants(user.phone);
    if (phoneVariants.length) {
      const existingByPhone = await ClientModel.findOne({ unitId, phone: { $in: phoneVariants } });
      if (existingByPhone) {
        if (existingByPhone.userId && existingByPhone.userId.toString() !== userId) {
          throw new AppError('Este telefone já está vinculado a outra conta de cliente.', 409);
        }
        existingByPhone.userId = user._id;
        await existingByPhone.save();
        return existingByPhone;
      }
    }

    return this.create({
      name: user.name,
      email: user.email || `user_${user._id}@delio.internal`,
      phone: normalizePhone(user.phone),
      userId: user._id,
      unitId: unitId as unknown as IClient['unitId'],
    });
  }

  async update(id: string, data: Partial<IClient>, requesterRole?: string): Promise<IClient> {
    if (requesterRole !== 'owner') {
      const forbiddenField = OWNER_ONLY_CLIENT_FIELDS.find(field => (data as Record<string, unknown>)[field] !== undefined);
      if (forbiddenField) {
        throw new ForbiddenError(`Somente o dono pode alterar o campo "${forbiddenField}".`);
      }
    }

    const updateData: Partial<IClient> = { ...data };
    if (data.phone !== undefined) {
      updateData.phone = normalizePhone(data.phone);
      const current = await ClientModel.findById(id);
      if (current?.userId) {
        const linkedUser = await UserModel.findById(current.userId);
        if (!linkedUser || normalizePhone(linkedUser.phone) !== updateData.phone) {
          const client = await ClientModel.findByIdAndUpdate(
            id,
            { ...updateData, $unset: { userId: 1 } },
            { new: true, runValidators: true },
          );
          if (!client) throw new NotFoundError('Client');
          return client;
        }
      }
    }

    const client = await ClientModel.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!client) throw new NotFoundError('Client');
    return client;
  }

  async assignPackage(id: string, packageId: string): Promise<IClient> {
    const client = await ClientModel.findById(id);
    if (!client) throw new NotFoundError('Client');

    const { ServiceModel } = await import('../services/service.model');
    const pkg = await ServiceModel.findById(packageId);

    if (!client.packages) client.packages = [];
    const alreadyHas = client.packages.some(p => p.packageId.toString() === packageId && p.active);
    if (!alreadyHas) {
      let expiresAt: Date | undefined;
      const validity = pkg?.packageValidity;
      if (validity && validity.type && validity.type !== 'none' && validity.value) {
        const exp = new Date();
        if (validity.type === 'days')   exp.setDate(exp.getDate() + validity.value);
        if (validity.type === 'weeks')  exp.setDate(exp.getDate() + validity.value * 7);
        if (validity.type === 'months') exp.setMonth(exp.getMonth() + validity.value);
        if (validity.type === 'years')  exp.setFullYear(exp.getFullYear() + validity.value);
        expiresAt = exp;
      }

      client.packages.push({
        packageId: packageId as any,
        startDate: new Date(),
        active: true,
        expiresAt,
        itemLimits: pkg?.packageItems?.map(pi => ({
          serviceId: pi.serviceId,
          quantity: pi.quantity,
          used: 0,
        })) || [],
      });
      await client.save();
    }
    return this.findById(id);
  }

  async removePackage(id: string, packageId: string): Promise<IClient> {
    const client = await ClientModel.findById(id);
    if (!client) throw new NotFoundError('Client');
    
    if (client.packages) {
      client.packages = client.packages.filter(p => p.packageId.toString() !== packageId);
      await client.save();
    }
    return this.findById(id);
  }

  async mergeClients(
    sourceId: string,
    targetId: string,
    keepFields: { name?: boolean; phone?: boolean; email?: boolean; notes?: boolean },
  ): Promise<IClient> {
    const [source, target] = await Promise.all([
      ClientModel.findById(sourceId),
      ClientModel.findById(targetId),
    ]);
    if (!source) throw new NotFoundError('Client');
    if (!target) throw new NotFoundError('Client');

    const linkedUserIds = [source.userId, target.userId]
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      .map(id => id.toString());
    const linkedUsers = linkedUserIds.length
      ? await UserModel.find({ _id: { $in: [...new Set(linkedUserIds)] } })
      : [];
    const activeClientOwners = linkedUsers.filter(user => user.role === 'client' && user.isActive === true);
    if (new Set(activeClientOwners.map(user => user._id.toString())).size > 1) {
      throw new AppError('NÃ£o Ã© possÃ­vel mesclar registros vinculados a contas de clientes ativas diferentes.', 409);
    }

    const { AppointmentModel } = await import('../appointments/appointment.model');
    await AppointmentModel.updateMany({ clientId: sourceId }, { $set: { clientId: targetId } });

    if (source.packages && source.packages.length > 0) {
      if (!target.packages) target.packages = [];
      for (const pkg of source.packages) {
        target.packages.push(pkg as any);
      }
    }

    if (keepFields.name && source.name) target.name = source.name;
    if (keepFields.phone && source.phone) target.phone = source.phone;
    if (keepFields.email && source.email) target.email = source.email;
    if (keepFields.notes && source.notes) target.notes = source.notes;

    // Carry over the user-account link if the surviving record doesn't have
    // one yet, otherwise appointments merged from `source` above would still
    // be invisible in the client's own account after the merge.
    if (!target.userId && source.userId) target.userId = source.userId;

    await target.save();
    await ClientModel.findByIdAndDelete(sourceId);

    return this.findById(targetId);
  }

  async updatePackageItemLimit(id: string, packageId: string, serviceId: string, quantity?: number | null, used?: number): Promise<IClient> {
    const client = await ClientModel.findById(id);
    if (!client) throw new NotFoundError('Client');

    if (client.packages) {
      // Allow editing active OR inactive packages (e.g. to correct session counts)
      const sub = client.packages.find(p => p.packageId.toString() === packageId);
      if (sub) {
        if (!sub.itemLimits) sub.itemLimits = [];

        if (quantity === null || (quantity !== undefined && quantity < 0)) {
          sub.itemLimits = sub.itemLimits.filter(l => l.serviceId.toString() !== serviceId);
        } else {
          const limit = sub.itemLimits.find(l => l.serviceId.toString() === serviceId);
          if (limit) {
            if (quantity !== undefined && quantity !== null) limit.quantity = quantity;
            if (used !== undefined) limit.used = Math.max(0, used);
          } else {
            sub.itemLimits.push({
              serviceId: serviceId as any,
              quantity: quantity ?? 0,
              used: used !== undefined ? Math.max(0, used) : 0,
            });
          }
        }
        await client.save();
      }
    }
    return this.findById(id);
  }
}
