import { ClientModel, IClient } from './client.model';
import { NotFoundError } from '../../shared/errors/AppError';

const populateOptions = {
  path: 'packages.packageId',
  populate: { path: 'packageItems.serviceId', select: 'name' }
};

export class ClientService {
  async findByUnit(unitId: string): Promise<IClient[]> {
    return ClientModel.find({ unitId }).populate(populateOptions).sort({ name: 1 });
  }

  async search(unitId: string, query: string): Promise<IClient[]> {
    return ClientModel.find({
      unitId,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
      ],
    }).populate(populateOptions).sort({ name: 1 });
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
    const client = await ClientModel.findByIdAndUpdate(id, data, { new: true });
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

  async updatePackageItemLimit(id: string, packageId: string, serviceId: string, quantity: number | null): Promise<IClient> {
    const client = await ClientModel.findById(id);
    if (!client) throw new NotFoundError('Client');
    
    if (client.packages) {
      const sub = client.packages.find(p => p.packageId.toString() === packageId && p.active);
      if (sub) {
        if (!sub.itemLimits) sub.itemLimits = [];
        
        if (quantity === null || quantity < 0) {
          sub.itemLimits = sub.itemLimits.filter(l => l.serviceId.toString() !== serviceId);
        } else {
          const limit = sub.itemLimits.find(l => l.serviceId.toString() === serviceId);
          if (limit) limit.quantity = quantity;
          else sub.itemLimits.push({ serviceId: serviceId as any, quantity });
        }
        await client.save();
      }
    }
    return this.findById(id);
  }
}
