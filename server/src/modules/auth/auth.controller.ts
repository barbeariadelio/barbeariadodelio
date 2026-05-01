import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok } from '../../shared/utils/responseHelper';

const service = new AuthService();

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokens = await service.login(req.body.email, req.body.password);
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
