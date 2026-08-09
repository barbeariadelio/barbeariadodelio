import mongoose from 'mongoose';
import { FranchiseModel, IFranchise } from './franchise.model';
import { UnitModel } from '../units/unit.model';
import { NotFoundError, ForbiddenError } from '../../shared/errors/AppError';

export class FranchiseService {
  async findByFranchisor(userId: string): Promise<IFranchise | null> {
    return FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(userId) });
  }

  // Every mutation/read below operates on a franchise picked by ID from the
  // URL — without this, any owner could read or edit a franchise they aren't
  // a franchisor of just by guessing/enumerating its ID.
  private async assertFranchisor(franchiseId: string, userId: string): Promise<IFranchise> {
    const franchise = await FranchiseModel.findById(franchiseId);
    if (!franchise) throw new NotFoundError('Franchise');
    if (!franchise.franchisors.some(f => f.toString() === userId)) {
      throw new ForbiddenError('Acesso negado para esta franquia.');
    }
    return franchise;
  }

  async getUnits(franchiseId: string, userId: string) {
    const franchise = await this.assertFranchisor(franchiseId, userId);
    return UnitModel.find({ _id: { $in: franchise.units }, isActive: true });
  }

  async addUnit(franchiseId: string, unitId: string, userId: string): Promise<IFranchise> {
    await this.assertFranchisor(franchiseId, userId);
    const franchise = await FranchiseModel.findByIdAndUpdate(
      franchiseId,
      { $addToSet: { units: unitId } },
      { new: true, runValidators: true },
    );
    if (!franchise) throw new NotFoundError('Franchise');
    return franchise;
  }

  async create(data: Partial<IFranchise>): Promise<IFranchise> {
    return FranchiseModel.create(data);
  }

  async update(id: string, data: Partial<IFranchise>, userId: string): Promise<IFranchise> {
    await this.assertFranchisor(id, userId);
    const franchise = await FranchiseModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!franchise) throw new NotFoundError('Franchise');
    return franchise;
  }
}
