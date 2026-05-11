import { Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
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

export async function registerUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user!.role !== 'owner') throw new AppError('Only owners can register users', 403);
    const unitId = req.body.unitId || req.user!.unitId;
    const { name, email, phone, password, role, allowedApps } = req.body;

    if (!email && !phone) throw new AppError('É necessário informar um e-mail ou telefone para cadastrar o usuário.', 422);
    if (!password) throw new AppError('A senha é obrigatória.', 422);
    if (!name) throw new AppError('O nome é obrigatório.', 422);

    const userData: Record<string, any> = { name, password, role, allowedApps, unitId };
    if (email) userData.email = email.toLowerCase().trim();
    if (phone) userData.phone = phone.replace(/\D/g, '');

    const user = await service.create(userData);
    created(res, user);
  } catch (e) { next(e); }
}

export async function updateAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUserId = req.params.id;
    const authenticatedUserId = req.user!.id;
    const isSelf = authenticatedUserId.toString() === targetUserId.toString();
    const isOwner = req.user!.role === 'owner';

    // If not owner and not self, forbidden
    if (!isOwner && !isSelf) {
      throw new AppError(`Não autorizado: sua conta (${authenticatedUserId}) não tem permissão para editar este perfil (${targetUserId})`, 403);
    }

    // If self but not owner, limit fields they can update (e.g. only theme)
    if (!isOwner && isSelf) {
      const allowedSelfFields = ['theme', 'name', 'phone', 'avatar'];
      const bodyKeys = Object.keys(req.body);
      const invalidKeys = bodyKeys.filter(k => !allowedSelfFields.includes(k));
      
      if (invalidKeys.length > 0) {
        throw new AppError(`Usuários comuns não podem alterar: ${invalidKeys.join(', ')}`, 403);
      }
    }

    const user = await service.updateAccount(targetUserId, req.body);
    ok(res, user);
  } catch (e) { next(e); }
}
