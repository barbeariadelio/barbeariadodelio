import mongoose from 'mongoose';
import { UnitModel, IUnit } from './unit.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';

export class UnitService {
  async findByOwner(ownerId: string): Promise<IUnit[]> {
    const id = new mongoose.Types.ObjectId(ownerId);
    return UnitModel.find({ ownerId: id, isActive: true });
  }

  async findByIds(ids: string[]): Promise<IUnit[]> {
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
    return UnitModel.find({ _id: { $in: objectIds }, isActive: true });
  }

  async findAll(): Promise<IUnit[]> {
    const cacheKey = 'units:all';
    const cached = sharedCache.get<IUnit[]>(cacheKey);
    if (cached) return cached;

    const units = await UnitModel.find({ isActive: true });
    sharedCache.set(cacheKey, units, 60);
    return units;
  }

  async findById(id: string): Promise<IUnit> {
    const cacheKey = `unit:${id}`;
    const cached = sharedCache.get<IUnit>(cacheKey);
    if (cached) return cached;

    const unit = await UnitModel.findById(id).lean() as unknown as IUnit | null;
    if (!unit) throw new NotFoundError('Unit');

    sharedCache.set(cacheKey, unit, 60);
    return unit;
  }

  async create(data: Partial<IUnit>): Promise<IUnit> {
    const unit = await UnitModel.create(data);
    sharedCache.delete('units:all');
    return unit;
  }

  async update(id: string, data: Partial<IUnit>): Promise<IUnit> {
    const unit = await UnitModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!unit) throw new NotFoundError('Unit');
    
    sharedCache.delete('units:all');
    sharedCache.delete(`unit:${id}`);
    return unit;
  }
}
