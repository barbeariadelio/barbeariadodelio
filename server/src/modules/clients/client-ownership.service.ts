import mongoose from 'mongoose';
import { ClientModel } from './client.model';
import { UserModel, type IUser } from '../auth/auth.model';
import { getPhoneVariants, normalizePhone } from '../../shared/utils/phone';

type ClientOwnershipRecord = {
  _id: mongoose.Types.ObjectId;
  phone?: string;
  userId?: mongoose.Types.ObjectId;
};

type ClientOwnerRecord = Pick<IUser, '_id' | 'phone' | 'role' | 'isActive'>;

export class ClientOwnershipService {
  async findClientIdsForUser(userId: string): Promise<mongoose.Types.ObjectId[]> {
    const user = await UserModel.findById(userId).select('phone role isActive').lean();
    if (!user || user.role !== 'client' || user.isActive !== true) return [];

    const directClients = await ClientModel.find({ userId })
      .select('_id phone userId')
      .lean<ClientOwnershipRecord[]>();
    const phoneVariants = getPhoneVariants(user.phone);
    const phoneClients = phoneVariants.length
      ? await ClientModel.find({ phone: { $in: phoneVariants } })
          .select('_id phone userId')
          .lean<ClientOwnershipRecord[]>()
      : [];

    const candidates = new Map<string, ClientOwnershipRecord>();
    for (const client of [...directClients, ...phoneClients]) {
      candidates.set(client._id.toString(), client);
    }

    const ownerIds = [...candidates.values()]
      .map(client => client.userId?.toString())
      .filter((id): id is string => Boolean(id && id !== userId));
    const owners = ownerIds.length
      ? await UserModel.find({ _id: { $in: [...new Set(ownerIds)] } })
          .select('_id phone role isActive')
          .lean<ClientOwnerRecord[]>()
      : [];
    const ownersById = new Map(owners.map(owner => [owner._id.toString(), owner]));
    const targetPhone = normalizePhone(user.phone);
    const clientIds: mongoose.Types.ObjectId[] = [];

    for (const client of candidates.values()) {
      if (client.userId?.toString() === userId) {
        clientIds.push(client._id);
        continue;
      }

      if (!targetPhone || normalizePhone(client.phone) !== targetPhone) continue;

      const linkedOwner = client.userId
        ? ownersById.get(client.userId.toString())
        : undefined;
      const hasCompatibleActiveOwner = linkedOwner
        && linkedOwner.role === 'client'
        && linkedOwner.isActive === true
        && normalizePhone(linkedOwner.phone) === targetPhone;

      if (!hasCompatibleActiveOwner) clientIds.push(client._id);
    }

    return clientIds;
  }

  async canUserAccessClient(userId: string, clientId: string): Promise<boolean> {
    const clientIds = await this.findClientIdsForUser(userId);
    return clientIds.some(id => id.toString() === clientId);
  }

  async findActiveClientUserByPhone(phone: string): Promise<IUser | null> {
    const variants = getPhoneVariants(phone);
    if (!variants.length) return null;

    return UserModel.findOne({
      phone: { $in: variants },
      role: 'client',
      isActive: true,
    });
  }
}