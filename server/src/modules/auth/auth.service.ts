import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { UserModel, type IUser } from './auth.model';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import type { AuthTokens, UserRole, LoginResponse } from '@barber/types';
import { getPhoneVariants, normalizePhone } from '../../shared/utils/phone';

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
      const allowed = user.allowedApps && user.allowedApps.length > 0
        ? user.allowedApps
        : ['admin'];

      // allowedApps may contain app names ('franchise', 'admin') or unitIds (legacy bug).
      // Accept unitId match for both apps so existing employees aren't locked out.
      const hasAccess = allowed.includes(appId) ||
        (user.unitId && allowed.includes(user.unitId.toString()));

      if (!hasAccess) {
        const systemName = appId === 'admin' ? 'Administrativo' : 'Franquia';
        throw new AppError(`Acesso negado: Usuários com o papel de ${user.role} não têm permissão para acessar o sistema ${systemName}.`, 403);
      }
    }

    const tokens = this.generateTokens(
      user._id.toString(),
      user.role,
      user.tokenVersion,
      user.unitId?.toString(),
      user.role !== 'client',
    );

    return { ...tokens, user: this.toLoginUser(user) };
  }

  private async linkClientRecordsByPhone(userId: mongoose.Types.ObjectId, cleanPhone: string): Promise<void> {
    const { ClientModel } = await import('../clients/client.model');
    const phoneVariants = getPhoneVariants(cleanPhone);
    const linkedUserIds = await ClientModel.distinct('userId', { phone: { $in: phoneVariants } });
    const activeMatchingClientUserIds = linkedUserIds.length
      ? await UserModel.distinct('_id', {
          _id: { $in: linkedUserIds },
          role: 'client',
          isActive: true,
          phone: { $in: phoneVariants },
        })
      : [];

    await ClientModel.updateMany(
      {
        phone: { $in: phoneVariants },
        userId: { $nin: activeMatchingClientUserIds },
      },
      { $set: { userId } },
    );
  }

  async bookingLogin(name: string, phone: string): Promise<LoginResponse> {
    try {
      const cleanPhone = normalizePhone(phone);
      const phoneVariants = getPhoneVariants(phone);
      if (!name || cleanPhone.length < 10) {
        throw new AppError('Informe seu nome e um telefone válido.', 400);
      }

      // Exact match on the normalized (digits-only) phone — phones are always
      // stored digits-only, so this is safe. (Previously used an unanchored
      // regex built from the digits with `.*` between each one, which matched
      // ANY phone containing those digits in order — e.g. "12345" would match
      // "11923415678" — letting a caller land a token for someone else's
      // account. Never loosen this back to a subsequence/regex match.)
      // Only a client account may be used by the public booking flow.
      let user = await UserModel.findOne({ phone: { $in: phoneVariants }, role: 'client' });

      if (!user) {
        const internalAccount = await UserModel.findOne({ phone: { $in: phoneVariants } });
        if (internalAccount) {
          throw new AppError('Este telefone estÃ¡ vinculado a uma conta interna. Use outro telefone para o agendamento pÃºblico.', 409);
        }
      }

      if (!user) {
        // Auto-create account for new customers
        const passwordHash = await bcrypt.hash(cleanPhone.slice(-4), 10);
        const guestEmail = `guest_${cleanPhone}_booking@delio.guest`;
        
        user = await UserModel.create({
          name,
          email: guestEmail,
          phone: cleanPhone,
          passwordHash,
          role: 'client',
          isActive: true,
          allowedApps: ['booking'],
        });

        await this.linkClientRecordsByPhone(user._id, cleanPhone);
      } else {
        // Ensure user is active
        if (!user.isActive) {
          throw new AppError('Esta conta está inativa. Entre em contato com a barbearia.', 403);
        }

        // Update name if it changed
        if (user.name !== name) {
          user.name = name;
          await user.save();
        }

        await this.linkClientRecordsByPhone(user._id, cleanPhone);
      }

      const tokens = this.generateTokens(
        user._id.toString(),
        user.role,
        user.tokenVersion,
        user.unitId?.toString(),
      );

      return { ...tokens, user: this.toLoginUser(user) };
    } catch (e) {
      console.error('[bookingLogin Error]:', e);
      throw e;
    }
  }

  async refresh(refreshToken: string): Promise<Pick<AuthTokens, 'accessToken'>> {
    try {
      const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as {
        id: string;
        role: UserRole;
        tokenVersion: number;
        unitId?: string;
        persistentSession?: boolean;
      };
      
      const user = await UserModel.findById(payload.id);
      if (!user || !user.isActive) {
        throw new AppError('Usuário inativo ou não encontrado.', 401);
      }

      if (user.tokenVersion !== payload.tokenVersion) {
        throw new AppError('Sessão expirada. Faça login novamente.', 401);
      }

      const accessToken = this.signAccess(
        payload.id,
        payload.role,
        payload.unitId,
        payload.tokenVersion,
        payload.persistentSession === true,
      );
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

  private toLoginUser(user: IUser): LoginResponse['user'] {
    const userObj = user.toObject();
    const createdAt =
      'createdAt' in userObj && userObj.createdAt instanceof Date
        ? userObj.createdAt.toISOString()
        : '';

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      ...(user.unitId ? { unitId: user.unitId.toString() } : {}),
      phone: user.phone,
      ...(user.avatar ? { avatar: user.avatar } : {}),
      isActive: user.isActive,
      ...(user.allowedApps ? { allowedApps: user.allowedApps } : {}),
      ...(user.theme ? { theme: user.theme } : {}),
      createdAt,
    };
  }
  private generateTokens(id: string, role: UserRole, tokenVersion: number, unitId?: string, persistentSession = false): AuthTokens {
    const accessToken = this.signAccess(id, role, unitId, tokenVersion, persistentSession);
    const refreshPayload = { id, role, unitId, tokenVersion, persistentSession: persistentSession || undefined };
    const refreshToken = persistentSession
      ? jwt.sign(refreshPayload, env.jwtRefreshSecret)
      : jwt.sign(refreshPayload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn as SignOptions['expiresIn'] });
    return { accessToken, refreshToken };
  }

  private signAccess(id: string, role: UserRole, unitId?: string, tokenVersion?: number, persistentSession = false): string {
    const accessPayload = { id, role, unitId, tokenVersion, persistentSession: persistentSession || undefined };
    return persistentSession
      ? jwt.sign(accessPayload, env.jwtSecret)
      : jwt.sign(accessPayload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] });
  }
}
