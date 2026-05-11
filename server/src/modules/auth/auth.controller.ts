import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new AuthService();

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { identifier, email, password, appId } = req.body;
    // Support both 'identifier' and legacy 'email' field names
    const loginId = identifier || email;
    if (!loginId || !password) {
      next(new AppError('Informe seu e-mail/telefone e senha.', 400));
      return;
    }
    const tokens = await service.login(loginId, password, appId);
    ok(res, tokens);
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokens = await service.refresh(req.body.refreshToken);
    ok(res, tokens);
  } catch (e) {
    next(e);
  }
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
