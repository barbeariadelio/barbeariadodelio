import { Response, NextFunction } from 'express';
import { FinanceService } from './finance.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { parsePagination } from '../../shared/utils/pagination';

const service = new FinanceService();

export async function getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const canSelectUnit = role === 'owner' || role === 'cashier';
    const unitId = canSelectUnit
      ? (Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string) || 'all')
      : req.user!.unitId;
    const periodRaw = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period;
    const period = (periodRaw as 'day' | 'month' | 'week' | 'year') || 'month';
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const summary = await service.getSummary(req.user!.id, req.user!.role, unitId, period, appScope);
    ok(res, summary);
  } catch (e) { next(e); }
}

export async function listTransactions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const canSelectUnit = role === 'owner' || role === 'cashier';
    const unitId = canSelectUnit
      ? (Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string) || 'all')
      : (req.user!.unitId as string);
    if (!unitId) { ok(res, { data: [], total: 0 }); return; }
    const { page, limit } = parsePagination(req.query);
    const employeeId = req.query.employeeId as string;
    const category = req.query.category as string;
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const result = await service.getTransactions(req.user!.id, req.user!.role, unitId, page, limit, { employeeId, category }, appScope);
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

export async function updateTransaction(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const transaction = await service.update(req.params.id, req.body);
    ok(res, transaction);
  } catch (e) { next(e); }
}

export async function deleteTransaction(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
}
