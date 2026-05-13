import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from './auth.model';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import type { AuthTokens, UserRole, LoginResponse } from '@barber/types';

export class AuthService {
  async login(identifier: string, password: string, appId?: string): Promise<LoginResponse> {
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

    const tokens = this.generateTokens(
      user._id.toString(),
      user.role,
      user.tokenVersion,
      user.unitId?.toString(),
    );

    const userObj = user.toObject();
    delete (userObj as any).passwordHash;
    delete (userObj as any).passwordPlain;

    return { ...tokens, user: userObj as any };
  }

  async refresh(refreshToken: string): Promise<Pick<AuthTokens, 'accessToken'>> {
    try {
      const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as {
        id: string;
        role: UserRole;
        tokenVersion: number;
        unitId?: string;
      };
      
      const user = await UserModel.findById(payload.id);
      if (!user || !user.isActive) {
        throw new AppError('Usuário inativo ou não encontrado.', 401);
      }

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new AppError('Sessão expirada. Faça login novamente.', 401);
      }

      const accessToken = this.signAccess(payload.id, payload.role, payload.unitId);
      return { accessToken };
    } catch (e) {
      if (e instanceof AppError) throw e;
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
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return user;
  }

  async updateTheme(userId: string, theme: 'light' | 'dark') {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { theme } },
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return user;
  }

  async logout(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) throw new AppError('Usuário não encontrado', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Senha atual incorreta.', 400);

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordPlain = undefined;
    await user.save();
  }

  async forgotPassword(identifier: string): Promise<{ resetToken: string }> {
    const isEmail = identifier.includes('@');
    const query = isEmail
      ? { email: identifier.toLowerCase() }
      : { phone: identifier.replace(/\D/g, '') };

    const user = await UserModel.findOne({ ...query, isActive: true });
    if (!user) {
      // Don't reveal whether user exists — always return success
      return { resetToken: '' };
    }

    // Short-lived token (15 min) for password reset
    const resetToken = jwt.sign(
      { id: user._id.toString(), purpose: 'password-reset' },
      env.jwtSecret,
      { expiresIn: '15m' },
    );

    // TODO: Send resetToken via email/SMS (e.g. SendGrid, Twilio, WhatsApp API)
    // For now, return token directly (dev/staging only)
    return { resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as {
        id: string;
        purpose?: string;
      };

      if (payload.purpose !== 'password-reset') {
        throw new AppError('Token inválido.', 400);
      }

      const user = await UserModel.findById(payload.id);
      if (!user) throw new AppError('Usuário não encontrado.', 404);

      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.passwordPlain = undefined;
      await user.save();
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('Token expirado ou inválido.', 400);
    }
  }

  private generateTokens(id: string, role: UserRole, tokenVersion: number, unitId?: string): AuthTokens {
    const accessToken = this.signAccess(id, role, unitId);
    const refreshToken = jwt.sign(
      { id, role, unitId, tokenVersion },
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
