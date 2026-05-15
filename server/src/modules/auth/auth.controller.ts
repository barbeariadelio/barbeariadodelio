import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new AuthService();

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { identifier, email, password, appId } = req.body;
    const loginId = identifier || email;
    if (!loginId || !password) {
      next(new AppError('Informe seu e-mail/telefone e senha.', 400));
      return;
    }
    const { user, ...tokens } = await service.login(loginId, password, appId);

    const isProd = process.env.NODE_ENV === 'production';
    
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 min
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    ok(res, { ...tokens, user });
  } catch (e) {
    next(e);
  }
}

export async function bookingLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, phone } = req.body;
    const { user, ...tokens } = await service.bookingLogin(name, phone);

    const isProd = process.env.NODE_ENV === 'production';
    
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    ok(res, { ...tokens, user });
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) throw new AppError('Refresh token missing', 401);

    const result = await service.refresh(refreshToken);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    ok(res, result);
  } catch (e) {
    next(e);
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  if (req.user?.id) {
    await service.logout(req.user.id);
  }
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  ok(res, { success: true });
}

export async function me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.me(req.user!.id);
    ok(res, user);
  } catch (e) {
    next(e);
  }
}

export async function updateMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.updateMe(req.user!.id, req.body);
    ok(res, user);
  } catch (e) {
    next(e);
  }
}

export async function updateTheme(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.updateTheme(req.user!.id, req.body.theme);
    ok(res, user);
  } catch (e) {
    next(e);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    // Clear tokens so the user must re-login with new password
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    ok(res, { message: 'Senha alterada com sucesso. Faça login novamente.' });
  } catch (e) {
    next(e);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.forgotPassword(req.body.identifier);
    // In production, NEVER return the token in the response — send via email/SMS
    if (process.env.NODE_ENV === 'production') {
      ok(res, { message: 'Se a conta existir, um link de redefinição será enviado.' });
    } else {
      ok(res, { message: 'Token gerado (dev only).', resetToken: result.resetToken });
    }
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.resetPassword(req.body.token, req.body.newPassword);
    ok(res, { message: 'Senha redefinida com sucesso.' });
  } catch (e) {
    next(e);
  }
}
