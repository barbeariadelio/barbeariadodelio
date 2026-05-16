import { Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new UserService();

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, unitId: userUnitId } = req.user!;
    const requestedUnitId = req.query.unitId as string;
    
    // Determine the effective unitId to filter by
    // We prioritize the requestedUnitId from the app (VITE_UNIT_ID)
    // but fall back to the user's own unitId if not provided.
    const filterUnitId = requestedUnitId || userUnitId;
    
    // Clear cache to ensure immediate visibility of new users
    const { sharedCache } = await import('../../shared/utils/cache');
    sharedCache.delete(`users:list:${filterUnitId || 'all'}`);
    sharedCache.delete('users:list:all');

    const users = await service.listAll(filterUnitId);
    ok(res, users);
  } catch (e) { next(e); }
}

export async function registerUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role: requesterRole } = req.user!;
    const isPrivileged = requesterRole === 'owner';

    if (!isPrivileged) {
      throw new AppError('Apenas o proprietário pode registrar usuários', 403);
    }
    const unitId = req.body.unitId || req.user!.unitId;
    const { name, email, phone, password, role, allowedApps } = req.body;

    if (!email && !phone) throw new AppError('É necessário informar um e-mail ou telefone para cadastrar o usuário.', 422);
    if (!password) throw new AppError('A senha é obrigatória.', 422);
    if (!name) throw new AppError('O nome é obrigatório.', 422);

    const userData: any = { 
      name, 
      password, 
      role, 
      allowedApps, 
      unitId: unitId || (allowedApps && allowedApps.length > 0 ? allowedApps[0] : req.user!.unitId)
    };
    
    if (email && email.trim() !== '') {
      userData.email = email.toLowerCase().trim();
    } else {
      delete userData.email;
    }

    if (phone && phone.trim() !== '') {
      userData.phone = phone.replace(/\D/g, '');
    } else {
      delete userData.phone;
    }

    const user = await service.create(userData);
    created(res, user);
  } catch (e) { next(e); }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUserId = req.params.id;
    const authenticatedUserId = req.user!.id;

    if (targetUserId === authenticatedUserId) {
      throw new AppError('Você não pode excluir sua própria conta.', 403);
    }

    await service.deleteAccount(targetUserId);
    ok(res, { success: true });
  } catch (e) { next(e); }
}

export async function updateAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUserId = req.params.id;
    const authenticatedUserId = req.user!.id;
    const requesterRole = req.user!.role;
    const isSelf = targetUserId === authenticatedUserId;
    
    // Role/Status Escalation Prevention
    const restrictedFields = ['role', 'isActive', 'unitId'];
    const bodyKeys = Object.keys(req.body);
    const hasRestrictedFields = bodyKeys.some(k => restrictedFields.includes(k));

    const isPrivileged = requesterRole === 'owner';

    if (hasRestrictedFields && !isPrivileged) {
      throw new AppError(`Não autorizado: apenas administradores podem alterar campos de privilégio (${restrictedFields.join(', ')})`, 403);
    }

    // If self but not privileged, limit fields they can update
    if (!isPrivileged && isSelf) {
      const allowedSelfFields = ['theme', 'name', 'phone', 'avatar'];
      const invalidKeys = bodyKeys.filter(k => !allowedSelfFields.includes(k));
      
      if (invalidKeys.length > 0) {
        throw new AppError(`Usuários comuns não podem alterar: ${invalidKeys.join(', ')}`, 403);
      }
    }

    const user = await service.updateAccount(targetUserId, req.body);
    ok(res, user);
  } catch (e) { next(e); }
}
