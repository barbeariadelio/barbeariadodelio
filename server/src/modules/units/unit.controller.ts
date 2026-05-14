import { Request, Response, NextFunction } from 'express';
import type { IUnit } from './unit.model';
import { UnitService } from './unit.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new UnitService();

export async function listPublicUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const units = await service.findAll();
    ok(res, units);
  } catch (e) { next(e); }
}

export async function getPublicUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await service.findById(req.params.id);
    ok(res, unit);
  } catch (e) { next(e); }
}

export async function listUnits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let units: IUnit[];
    const { role, id, unitId } = req.user!;

    if (role === 'admin' || role === 'franchisor') {
      units = await service.findAll();
    } else if (role === 'owner') {
      const ownUnits = await service.findByOwner(id);
      // Also include franchise units where this owner is listed as a franchisor
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const { default: mongoose } = await import('mongoose');
      const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(id) });
      
      if (franchise && franchise.units.length > 0) {
        const franchiseUnits = await service.findByIds(franchise.units.map(u => u.toString()));
        const ownIds = new Set(ownUnits.map(u => u._id.toString()));
        units = [...ownUnits, ...franchiseUnits.filter(u => !ownIds.has(u._id.toString()))];
      } else {
        units = ownUnits;
      }
    } else if (unitId) {
      units = [await service.findById(unitId)];
    } else {
      units = [];
    }
    
    ok(res, units);
  } catch (e) { next(e); }
}

export async function getUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.unitId || req.params.id;
    const unit = await service.findById(id);
    ok(res, unit);
  } catch (e) { next(e); }
}

export async function createUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await service.create({ ...req.body, ownerId: req.user!.id });
    created(res, unit);
  } catch (e) { next(e); }
}

export async function updateUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.unitId || req.params.id;
    const unit = await service.update(id, req.body);
    ok(res, unit);
  } catch (e) { next(e); }
}
