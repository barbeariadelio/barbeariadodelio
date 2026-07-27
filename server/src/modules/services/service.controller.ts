import { Response, NextFunction } from 'express';
import { ServiceService } from './service.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { resolveUnitId } from '../../shared/middlewares/rbac.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new ServiceService();

export async function listServices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Soul540-style: non-owners are locked to their JWT unitId.
    // listServices is also called unauthenticated (booking flow), so fall back
    // to query param when there is no authenticated user.
    const onlineOnly = req.query.online === 'true';
    const queryUnitId = (req.query.unitId as string | undefined) || null;
    const unitId = onlineOnly && queryUnitId
      ? queryUnitId
      : req.user
        ? resolveUnitId(req)
        : queryUnitId;
    if (!unitId) { ok(res, []); return; }
    const services = await service.findByUnit(unitId, onlineOnly);
    ok(res, services);
  } catch (e) { next(e); }
}

export async function createService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Non-owners (and unit-locked owners) always create within their own
    // unit; only the unscoped global owner may target an arbitrary unit via body.
    const unitId = resolveUnitId(req) || (req.user?.role === 'owner' ? req.body.unitId : undefined);
    if (!unitId) throw new AppError('Unidade é obrigatória.', 400);
    const svc = await service.create({ ...req.body, unitId });
    created(res, svc);
  } catch (e) { next(e); }
}

export async function updateService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await service.findById(req.params.id);
    const scopedUnitId = resolveUnitId(req);
    if (scopedUnitId && existing.unitId?.toString() !== scopedUnitId) {
      throw new AppError('Access denied to this unit', 403);
    }
    const svc = await service.update(req.params.id, req.body);
    ok(res, svc);
  } catch (e) { next(e); }
}

export async function toggleService(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await service.findById(req.params.id);
    const scopedUnitId = resolveUnitId(req);
    if (scopedUnitId && existing.unitId?.toString() !== scopedUnitId) {
      throw new AppError('Access denied to this unit', 403);
    }
    const svc = await service.toggleActive(req.params.id);
    ok(res, svc);
  } catch (e) { next(e); }
}
