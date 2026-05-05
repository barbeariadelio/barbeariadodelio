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
    if (req.user!.role === 'owner') {
      units = await service.findByOwner(req.user!.id);
    } else if (req.user!.unitId) {
      units = [await service.findById(req.user!.unitId)];
    } else {
      units = [];
    }
    ok(res, units);
  } catch (e) { next(e); }
}

export async function getUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await service.findById(req.params.id);
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
    const unit = await service.update(req.params.id, req.body);
    ok(res, unit);
  } catch (e) { next(e); }
}
