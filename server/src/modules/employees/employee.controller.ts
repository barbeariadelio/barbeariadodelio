import { Response, NextFunction } from 'express';
import { EmployeeService } from './employee.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new EmployeeService();

export async function listEmployees(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = (req.query.unitId as string) || req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const employees = await service.findByUnit(unitId);
    ok(res, employees);
  } catch (e) { next(e); }
}

export async function getEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.findById(req.params.id);
    ok(res, emp);
  } catch (e) { next(e); }
}

export async function createEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.body.unitId || req.user!.unitId;
    const emp = await service.create({ ...req.body, unitId });
    created(res, emp);
  } catch (e) { next(e); }
}

export async function updateEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.update(req.params.id, req.body);
    ok(res, emp);
  } catch (e) { next(e); }
}

export async function deactivateEmployee(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const emp = await service.deactivate(req.params.id);
    ok(res, emp);
  } catch (e) { next(e); }
}
