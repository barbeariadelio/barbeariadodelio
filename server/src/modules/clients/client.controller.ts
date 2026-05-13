import { Response, NextFunction } from 'express';
import { ClientService } from './client.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new ClientService();

export async function listClients(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.user!.role === 'owner'
      ? ((req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    
    const q = req.query.q as string | undefined;
    const { page, limit, skip } = (await import('../../shared/utils/pagination')).parsePagination(req.query as any);
    
    const clients = q
      ? await service.search(unitId, q, { skip, limit })
      : await service.findByUnit(unitId, { skip, limit });
    ok(res, clients);
  } catch (e) { next(e); }
}

export async function getClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.findById(req.params.id);
    
    // Security check: must belong to the unit
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && client.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    ok(res, client);
  } catch (e) { next(e); }
}

export async function createClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && unitId !== req.user!.unitId?.toString()) {
      throw new AppError('Cannot create client for another unit', 403);
    }

    const client = await service.create({ ...req.body, unitId });
    created(res, client);
  } catch (e) { next(e); }
}

export async function updateClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.findById(req.params.id);
    
    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && client.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const updated = await service.update(req.params.id, req.body);
    ok(res, updated);
  } catch (e) { next(e); }
}

export async function assignPackage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.findById(req.params.id);
    
    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && client.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const result = await service.assignPackage(req.params.id, req.body.packageId);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function removePackage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.findById(req.params.id);
    
    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && client.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const result = await service.removePackage(req.params.id, req.params.packageId);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function updatePackageItemLimit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, packageId, serviceId } = req.params;
    const { quantity } = req.body;

    const client = await service.findById(id);
    
    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && client.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const result = await service.updatePackageItemLimit(id, packageId, serviceId, quantity);
    ok(res, result);
  } catch (e) { next(e); }
}
