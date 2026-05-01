import { Request, Response, NextFunction } from 'express';
import { ServiceService } from './service.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new ServiceService();

export async function listServices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.query.unitId as string;
    if (!unitId) { ok(res, []); return; }
    const services = await service.findByUnit(unitId);
    ok(res, services);
  } catch (e) { next(e); }
}

export async function createService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const svc = await service.create(req.body);
    created(res, svc);
  } catch (e) { next(e); }
}

export async function updateService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const svc = await service.update(req.params.id, req.body);
    ok(res, svc);
  } catch (e) { next(e); }
}

export async function toggleService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const svc = await service.toggleActive(req.params.id);
    ok(res, svc);
  } catch (e) { next(e); }
}
