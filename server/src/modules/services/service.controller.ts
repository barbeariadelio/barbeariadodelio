import { Response, NextFunction } from 'express';
import { ServiceService } from './service.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { resolveUnitId } from '../../shared/middlewares/rbac.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new ServiceService();

export async function listServices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Soul540-style: non-owners are locked to their JWT unitId.
    // listServices is also called unauthenticated (booking flow), so fall back
    // to query param when there is no authenticated user.
    const unitId = req.user
      ? resolveUnitId(req)
      : (req.query.unitId as string | undefined) || null;
    if (!unitId) { ok(res, []); return; }
    const services = await service.findByUnit(unitId);
    ok(res, services);
  } catch (e) { next(e); }
}

export async function createService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user?.unitId;
    const svc = await service.create({ ...req.body, unitId });
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
