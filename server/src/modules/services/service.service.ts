import { ServiceModel, IService } from './service.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class ServiceService {
  async findByUnit(unitId: string): Promise<IService[]> {
    return ServiceModel.find({ unitId, isActive: true }).sort({ name: 1 });
  }

  async findById(id: string): Promise<IService> {
    const svc = await ServiceModel.findById(id);
    if (!svc) throw new NotFoundError('Service');
    return svc;
  }

  async create(data: Partial<IService>): Promise<IService> {
    return ServiceModel.create(data);
  }

  async update(id: string, data: Partial<IService>): Promise<IService> {
    const svc = await ServiceModel.findByIdAndUpdate(id, data, { new: true });
    if (!svc) throw new NotFoundError('Service');
    return svc;
  }

  async toggleActive(id: string): Promise<IService> {
    const svc = await ServiceModel.findById(id);
    if (!svc) throw new NotFoundError('Service');
    svc.isActive = !svc.isActive;
    return svc.save();
  }
}
