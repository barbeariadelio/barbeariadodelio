import { ServiceModel, IService } from './service.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';

export class ServiceService {
  async findByUnit(unitId: string, onlineOnly = false): Promise<IService[]> {
    const cacheKey = `services:${unitId}:${onlineOnly}`;
    const cached = sharedCache.get<IService[]>(cacheKey);
    if (cached) return cached;

    const filter: Record<string, unknown> = { unitId, isActive: true };
    if (onlineOnly) filter.isOnline = true;

    const services = await ServiceModel.find(filter).sort({ name: 1 }).lean() as unknown as IService[];
    const payload = (onlineOnly
      ? services.map((svc) => ({
          ...svc,
          image: typeof svc.image === 'string' && /^https?:\/\//i.test(svc.image) ? svc.image : undefined,
        }))
      : services) as unknown as IService[];
    sharedCache.set(cacheKey, payload, 60);
    return payload;
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
    sharedCache.delete(`services:${data.unitId}:false`);
    sharedCache.delete(`services:${data.unitId}:true`);
    return svc;
  }

  async update(id: string, data: Partial<IService>): Promise<IService> {
    const svc = await ServiceModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!svc) throw new NotFoundError('Service');
    sharedCache.delete(`services:${svc.unitId}:false`);
    sharedCache.delete(`services:${svc.unitId}:true`);
    return svc;
  }

  async toggleActive(id: string): Promise<IService> {
    const svc = await ServiceModel.findById(id);
    if (!svc) throw new NotFoundError('Service');
    svc.isActive = !svc.isActive;
    await svc.save();
    sharedCache.delete(`services:${svc.unitId}:false`);
    sharedCache.delete(`services:${svc.unitId}:true`);
    return svc;
  }
}
