import { Request, Response, NextFunction } from 'express';
import { EmployeeService } from './employee.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new EmployeeService();

export async function listPublicEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.query.unitId as string;
    if (!unitId) { ok(res, []); return; }
    const employees = await service.findByUnit(unitId);
    ok(res, employees);
  } catch (e) { next(e); }
}

export async function listEmployees(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isSuperUser = ['owner', 'franchisor', 'admin'].includes(req.user!.role);
    const unitId = isSuperUser
      ? ((req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const employees = await service.findAdminByUnit(unitId);
    ok(res, employees);
  } catch (e) { next(e); }
}

export async function getEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.findById(req.params.id);

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && emp.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    ok(res, emp);
  } catch (e) { next(e); }
}

export async function createEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && unitId !== req.user!.unitId?.toString()) {
      throw new AppError('Cannot create employee for another unit', 403);
    }

    const emp = await service.create({ ...req.body, unitId });
    created(res, emp);
  } catch (e) { next(e); }
}

export async function updateEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.findById(req.params.id);

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && emp.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const updated = await service.update(req.params.id, req.body);
    ok(res, updated);
  } catch (e) { next(e); }
}

export async function deactivateEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.findById(req.params.id);

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner' || req.user!.role === 'franchisor';
    if (!isOwnerOrFranchisor && emp.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const result = await service.deactivate(req.params.id);
    ok(res, result);
  } catch (e) { next(e); }
}
