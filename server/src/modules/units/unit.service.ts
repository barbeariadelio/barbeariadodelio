import { UnitModel, IUnit } from './unit.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class UnitService {
  async findByOwner(ownerId: string): Promise<IUnit[]> {
    return UnitModel.find({ ownerId, isActive: true });
  }

  async findAll(): Promise<IUnit[]> {
    return UnitModel.find({ isActive: true });
  }

  async findById(id: string): Promise<IUnit> {
    const unit = await UnitModel.findById(id);
    if (!unit) throw new NotFoundError('Unit');
    return unit;
  }

  async create(data: Partial<IUnit>): Promise<IUnit> {
    return UnitModel.create(data);
  }

  async update(id: string, data: Partial<IUnit>): Promise<IUnit> {
    const unit = await UnitModel.findByIdAndUpdate(id, data, { new: true });
    if (!unit) throw new NotFoundError('Unit');
    return unit;
  }
}
