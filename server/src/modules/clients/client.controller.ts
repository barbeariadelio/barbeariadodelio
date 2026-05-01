import { Response, NextFunction } from 'express';
import { ClientService } from './client.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new ClientService();

export async function listClients(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = (req.query.unitId as string) || req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const q = req.query.q as string | undefined;
    const clients = q
      ? await service.search(unitId, q)
      : await service.findByUnit(unitId);
    ok(res, clients);
  } catch (e) { next(e); }
}

export async function getClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.findById(req.params.id);
    ok(res, client);
  } catch (e) { next(e); }
}

export async function createClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;
    const client = await service.create({ ...req.body, unitId });
    created(res, client);
  } catch (e) { next(e); }
}

export async function updateClient(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await service.update(req.params.id, req.body);
    ok(res, client);
  } catch (e) { next(e); }
}
