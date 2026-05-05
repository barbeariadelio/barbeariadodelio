import { Response, NextFunction } from 'express';
import { ProductService } from './product.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new ProductService();

export async function listProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.query.unitId as string || req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const products = await service.findByUnit(unitId);
    ok(res, products);
  } catch (e) { next(e); }
}

export async function createProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;
    const product = await service.create({ ...req.body, unitId });
    created(res, product);
  } catch (e) { next(e); }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await service.update(req.params.id, req.body);
    ok(res, product);
  } catch (e) { next(e); }
}

export async function deleteProduct(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id);
    ok(res, { message: 'Product deleted' });
  } catch (e) { next(e); }
}
