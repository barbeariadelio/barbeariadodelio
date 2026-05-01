import { Response, NextFunction } from 'express';
import { FranchiseService } from './franchise.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new FranchiseService();

export async function getFranchise(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const franchise = await service.findByFranchisor(req.user!.id);
    ok(res, franchise);
  } catch (e) { next(e); }
}

export async function getFranchiseUnits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const franchiseId = req.params.id;
    const units = await service.getUnits(franchiseId);
    ok(res, units);
  } catch (e) { next(e); }
}

export async function addUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const franchise = await service.addUnit(req.params.id, req.body.unitId);
    ok(res, franchise);
  } catch (e) { next(e); }
}

export async function createFranchise(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const franchise = await service.create({
      ...req.body,
      franchisors: [req.user!.id],
    });
    created(res, franchise);
  } catch (e) { next(e); }
}

export async function updateFranchise(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const franchise = await service.update(req.params.id, req.body);
    ok(res, franchise);
  } catch (e) { next(e); }
}
