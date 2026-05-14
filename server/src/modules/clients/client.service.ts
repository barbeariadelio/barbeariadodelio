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
    
    if (!client.packages) client.packages = [];
    const alreadyHas = client.packages.some(p => p.packageId.toString() === packageId && p.active);
    if (!alreadyHas) {
      client.packages.push({
        packageId: packageId as any,
        startDate: new Date(),
        active: true
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
