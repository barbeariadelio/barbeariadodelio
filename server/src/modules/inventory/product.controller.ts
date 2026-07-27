import { Response, NextFunction } from 'express';
import { ProductService } from './product.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { resolveUnitId } from '../../shared/middlewares/rbac.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new ProductService();

export async function listProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Soul540-style: non-owners (and franchise owners, who carry a jwt unitId)
    // are locked to their own unit — a caller can no longer read another
    // unit's catalog just by passing ?unitId=<otherUnit>.
    const unitId = resolveUnitId(req);
    if (!unitId) { ok(res, []); return; }

    const { page, limit, skip } = (await import('../../shared/utils/pagination')).parsePagination(req.query as any);

    const products = await service.findByUnit(unitId, { skip, limit });
    ok(res, products);
  } catch (e) { next(e); }
}

export async function createProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Non-owners (and unit-locked owners) always create within their own
    // unit; only the unscoped global owner may target an arbitrary unit via body.
    const unitId = resolveUnitId(req) || (req.user!.role === 'owner' ? req.body.unitId : undefined);
    if (!unitId) throw new AppError('Unidade é obrigatória.', 400);
    const product = await service.create({ ...req.body, unitId });
    created(res, product);
  } catch (e) { next(e); }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await service.findById(req.params.id);
    const scopedUnitId = resolveUnitId(req);
    if (scopedUnitId && existing.unitId?.toString() !== scopedUnitId) {
      throw new AppError('Access denied to this unit', 403);
    }
    const product = await service.update(req.params.id, req.body);
    ok(res, product);
  } catch (e) { next(e); }
}

export async function deleteProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await service.findById(req.params.id);
    const scopedUnitId = resolveUnitId(req);
    if (scopedUnitId && existing.unitId?.toString() !== scopedUnitId) {
      throw new AppError('Access denied to this unit', 403);
    }
    await service.delete(req.params.id);
    ok(res, { message: 'Product deleted' });
  } catch (e) { next(e); }
}
