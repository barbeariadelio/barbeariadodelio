import { ClientModel, IClient } from './client.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { escapeRegex } from '../../shared/utils/regex';

const populateOptions = {
  path: 'packages.packageId',
  populate: { path: 'packageItems.serviceId', select: 'name' }
};

export class ClientService {
  async findByUnit(unitId: string, pagination?: { skip: number, limit: number }): Promise<IClient[]> {
    let query = ClientModel.find({ unitId }).populate(populateOptions).sort({ name: 1 });
    if (pagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }
    return query;
  }

  async search(unitId: string, query: string, pagination?: { skip: number, limit: number }): Promise<IClient[]> {
    const safeQuery = escapeRegex(query);
    let q = ClientModel.find({
      unitId,
      $or: [
        { name: { $regex: safeQuery, $options: 'i' } },
        { phone: { $regex: safeQuery, $options: 'i' } },
      ],
    }).populate(populateOptions).sort({ name: 1 });

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
    return ClientModel.create(data);
  }

  async update(id: string, data: Partial<IClient>): Promise<IClient> {
    const client = await ClientModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
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
