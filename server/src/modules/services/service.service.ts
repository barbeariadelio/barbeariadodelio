import { ServiceModel, IService } from './service.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';

export class ServiceService {
  async findByUnit(unitId: string): Promise<IService[]> {
    const cacheKey = `services:${unitId}`;
    const cached = sharedCache.get<IService[]>(cacheKey);
    if (cached) return cached;

    const services = await ServiceModel.find({ unitId, isActive: true }).sort({ name: 1 });
    sharedCache.set(cacheKey, services, 60); // 1 minute cache
    return services;
  }

  async findById(id: string): Promise<IService> {
    const svc = await ServiceModel.findById(id);
    if (!svc) throw new NotFoundError('Service');
    return svc;
  }

  async create(data: Partial<IService>): Promise<IService> {
    if (data.unitId && data.name) {
      await ServiceModel.updateMany(
        { unitId: data.unitId, name: data.name, isActive: false },
        { $set: { name: `${data.name}_removed_${Date.now()}` } },
      );
    }
    const svc = await ServiceModel.create(data);
    sharedCache.delete(`services:${data.unitId}`);
    return svc;
  }

  async update(id: string, data: Partial<IService>): Promise<IService> {
    const svc = await ServiceModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!svc) throw new NotFoundError('Service');
    sharedCache.delete(`services:${svc.unitId}`);
    return svc;
  }

  async toggleActive(id: string): Promise<IService> {
    const svc = await ServiceModel.findById(id);
    if (!svc) throw new NotFoundError('Service');
    svc.isActive = !svc.isActive;
    await svc.save();
    sharedCache.delete(`services:${svc.unitId}`);
    return svc;
  }
}
