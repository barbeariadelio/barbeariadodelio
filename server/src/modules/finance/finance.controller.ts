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
    const rawQueryUnitId = Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string);
    const unitId = canSelectUnit
      ? (rawQueryUnitId || 'all')
      : (req.user!.unitId || rawQueryUnitId);
    const periodRaw = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period;
    const period = (periodRaw as 'day' | 'month' | 'week' | 'year') || 'month';
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const allTime = req.query.allTime === 'true';
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const jwtUnitId = req.user!.unitId;
    const summary = await service.getSummary(req.user!.id, req.user!.role, unitId, period, appScope, jwtUnitId, start, end, allTime);
    ok(res, summary);
  } catch (e) { next(e); }
}

export async function listTransactions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const canSelectUnit = role === 'owner' || role === 'cashier';
    const rawQueryUnitId = Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string);
    const unitId = canSelectUnit
      ? (rawQueryUnitId || 'all')
      : ((req.user!.unitId as string) || rawQueryUnitId);
    if (!unitId) { ok(res, { data: [], total: 0 }); return; }
    const { page, limit } = parsePagination(req.query);
    const employeeId = req.query.employeeId as string;
    const category = req.query.category as string;
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const jwtUnitId = req.user!.unitId;
    const result = await service.getTransactions(req.user!.id, req.user!.role, unitId, page, limit, { employeeId, category, start, end }, appScope, jwtUnitId);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function listRemunerations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const rawQueryUnitId = Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string);
    const unitId = rawQueryUnitId || (req.user!.unitId as string) || 'all';
    const employeeId = (role === 'employee') ? req.user!.id : (req.query.employeeId as string);
    if (!employeeId) { ok(res, []); return; }
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const jwtUnitId = req.user!.unitId;
    const result = await service.listRemunerations(req.user!.id, role, unitId, employeeId, appScope, jwtUnitId, start, end);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getRemunerationsSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const rawQueryUnitId = Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string);
    const unitId = rawQueryUnitId || (req.user!.unitId as string) || 'all';
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const jwtUnitId = req.user!.unitId;
    const result = await service.getRemunerationsSummary(req.user!.id, role, unitId, appScope, jwtUnitId, start, end);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function registerPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = req.user!;
    const { employeeId, commissionIds, amount, description, date, unitId: bodyUnitId } = req.body;
    const rawQueryUnitId = Array.isArray(req.query.unitId) ? (req.query.unitId[0] as string) : (req.query.unitId as string);
    const unitId = bodyUnitId || rawQueryUnitId || (req.user!.unitId as string);
    if (!employeeId || !commissionIds?.length || !amount || !date) {
      res.status(400).json({ message: 'Campos obrigatórios: employeeId, commissionIds, amount, date.' });
      return;
    }
    const appScope = req.headers['x-app-scope'] as string | undefined;
    const jwtUnitId = req.user!.unitId;
    const desc = description || `Pagamento de comissões (${commissionIds.length} atend.)`;
    const payment = await service.registerPayment(req.user!.id, role, unitId, employeeId, commissionIds, amount, desc, date, appScope, jwtUnitId);
    created(res, payment);
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
