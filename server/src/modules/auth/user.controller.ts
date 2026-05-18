import { Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { resolveUnitId } from '../../shared/middlewares/rbac.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new UserService();

export async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, id: ownerId } = req.user!;

    if (role === 'owner') {
      const { UnitService } = await import('../units/unit.service');
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const mongoose = await import('mongoose');

      const unitSvc = new UnitService();
      const ownUnits = await unitSvc.findByOwner(ownerId);
      const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(ownerId) });

      const allUnitIds = new Set(ownUnits.map(u => u._id.toString()));
      (franchise?.units ?? []).forEach(u => allUnitIds.add(u.toString()));

      const users = await service.listByUnitIds([...allUnitIds]);
      ok(res, users);
      return;
    }

    // Non-owners: locked to their own unitId
    const filterUnitId = resolveUnitId(req) ?? undefined;
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
      unitId: unitId || req.user!.unitId
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
