import { Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new UserService();

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Owners can list all users in their unit or all if super admin
    const unitId = req.query.unitId as string || req.user!.unitId;
    const users = await service.listAll(req.user!.role === 'owner' ? unitId : undefined);
    ok(res, users);
  } catch (e) { next(e); }
}

export async function updateUserRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user!.role !== 'owner') throw new AppError('Only owners can change permissions', 403);
    const { role, isActive } = req.body;
    const user = await service.updateRole(req.params.id, role, isActive);
    ok(res, user);
  } catch (e) { next(e); }
}
