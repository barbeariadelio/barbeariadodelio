import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from './auth.model';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import type { AuthTokens, UserRole } from '@barber/types';

export class AuthService {
  async login(identifier: string, password: string, appId?: string): Promise<AuthTokens> {
    const isEmail = identifier.includes('@');
    const query = isEmail 
      ? { email: identifier.toLowerCase() }
      : { phone: identifier.replace(/\D/g, '') };

    const user = await UserModel.findOne({ ...query, isActive: true });
    if (!user) throw new AppError('As credenciais informadas são inválidas.', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('As credenciais informadas são inválidas.', 401);

    // Restriction Logic
    if (user.role !== 'owner' && appId) {
      // Use allowedApps if defined, otherwise fallback to role-based defaults
      const allowed = user.allowedApps && user.allowedApps.length > 0 
        ? user.allowedApps 
        : (user.role === 'franchisor' || user.role === 'franchisee' ? ['franchise'] : ['admin']);

      if (!allowed.includes(appId)) {
        const systemName = appId === 'admin' ? 'Administrativo' : 'Franquia';
        throw new AppError(`Acesso negado: Usuários com o papel de ${user.role} não têm permissão para acessar o sistema ${systemName}.`, 403);
      }
    }

    return this.generateTokens(
      user._id.toString(),
      user.role,
      user.unitId?.toString(),
    );
  }

  async refresh(refreshToken: string): Promise<Pick<AuthTokens, 'accessToken'>> {
    try {
      const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as {
        id: string;
        role: UserRole;
        unitId?: string;
      };
      const accessToken = this.signAccess(payload.id, payload.role, payload.unitId);
      return { accessToken };
    } catch {
      throw new AppError('Token de atualização inválido ou expirado.', 401);
    }
  }

  async me(userId: string) {
    const user = await UserModel.findById(userId).select('-passwordHash');
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return user;
  }

  async updateMe(userId: string, data: { name?: string; email?: string; phone?: string }) {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return user;
  }

  async updateTheme(userId: string, theme: 'light' | 'dark') {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { theme } },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return user;
  }

  private generateTokens(id: string, role: UserRole, unitId?: string): AuthTokens {
    const accessToken = this.signAccess(id, role, unitId);
    const refreshToken = jwt.sign(
      { id, role, unitId },
      env.jwtRefreshSecret,
      { expiresIn: env.jwtRefreshExpiresIn as any },
    );
    return { accessToken, refreshToken };
  }

  private signAccess(id: string, role: UserRole, unitId?: string): string {
    return jwt.sign(
      { id, role, unitId },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn as any },
    );
  }
}
