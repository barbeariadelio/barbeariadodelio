import { Response, NextFunction } from 'express';
import { FinanceService } from './finance.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { parsePagination } from '../../shared/utils/pagination';

const service = new FinanceService();

export async function getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.user!.role === 'owner'
      ? (Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    const periodRaw = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period;
    const period = (periodRaw as 'month' | 'week' | 'year') || 'month';
    const summary = await service.getSummary(req.user!.id, req.user!.role, unitId, period);
    ok(res, summary);
  } catch (e) { next(e); }
}

export async function listTransactions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.user!.role === 'owner'
      ? (Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string) || req.user!.unitId)
      : (req.user!.unitId as string);
    if (!unitId) { ok(res, { data: [], total: 0 }); return; }
    const { page, limit } = parsePagination(req.query);
    const result = await service.getTransactions(unitId, page, limit);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function createTransaction(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;
    const transaction = await service.create({ ...req.body, unitId, createdBy: req.user!.id });
    created(res, transaction);
  } catch (e) { next(e); }
}
