import { FranchiseModel, IFranchise } from './franchise.model';
import { UnitModel } from '../units/unit.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class FranchiseService {
  async findByFranchisor(userId: string): Promise<IFranchise | null> {
    return FranchiseModel.findOne({ franchisors: userId });
  }

  async getUnits(franchiseId: string) {
    const franchise = await FranchiseModel.findById(franchiseId);
    if (!franchise) throw new NotFoundError('Franchise');
    return UnitModel.find({ _id: { $in: franchise.units }, isActive: true });
  }

  async addUnit(franchiseId: string, unitId: string): Promise<IFranchise> {
    const franchise = await FranchiseModel.findByIdAndUpdate(
      franchiseId,
      { $addToSet: { units: unitId } },
      { new: true },
    );
    if (!franchise) throw new NotFoundError('Franchise');
    return franchise;
  }

  async create(data: Partial<IFranchise>): Promise<IFranchise> {
    return FranchiseModel.create(data);
  }

  async update(id: string, data: Partial<IFranchise>): Promise<IFranchise> {
    const franchise = await FranchiseModel.findByIdAndUpdate(id, data, { new: true });
    if (!franchise) throw new NotFoundError('Franchise');
    return franchise;
  }
}
