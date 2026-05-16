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

    if (role === 'owner') {
      const ownUnits = await service.findByOwner(id);
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
    } else if (role === 'cashier') {
      units = await resolveCashierUnits(id, unitId);
    } else if (unitId) {
      units = [await service.findById(unitId)];
    } else {
      units = [];
    }

    ok(res, units);
  } catch (e) { next(e); }
}

async function resolveCashierUnits(userId: string, primaryUnitId?: string): Promise<IUnit[]> {
  const { UserModel } = await import('../auth/auth.model');
  const { FranchiseModel } = await import('../franchise/franchise.model');
  const { default: mongoose } = await import('mongoose');

  const userDoc = await UserModel.findById(userId).select('unitId allowedApps');
  const allowedApps: string[] = userDoc?.allowedApps || [];
  const effectiveUnitId = primaryUnitId || userDoc?.unitId?.toString();

  if (allowedApps.length === 0) {
    return effectiveUnitId ? [await service.findById(effectiveUnitId)] : [];
  }

  const primaryUnit = effectiveUnitId ? await service.findById(effectiveUnitId).catch(() => null) : null;
  const ownerId = primaryUnit?.ownerId;

  const resolved: IUnit[] = [];
  const seen = new Set<string>();

  const add = (u: IUnit) => { const key = u._id.toString(); if (!seen.has(key)) { seen.add(key); resolved.push(u); } };

  if (ownerId && allowedApps.includes('admin')) {
    const adminUnits = await service.findByOwner(ownerId.toString());
    adminUnits.forEach(add);
  }

  if (allowedApps.includes('franchise') && ownerId) {
    const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(ownerId.toString()) });
    if (franchise?.units.length) {
      const franchiseUnits = await service.findByIds(franchise.units.map(u => u.toString()));
      franchiseUnits.forEach(add);
    }
  }

  return resolved.length > 0 ? resolved : (primaryUnit ? [primaryUnit] : []);
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
