import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { UserModel } from '../../modules/auth/auth.model';
import type { UserRole } from '@barber/types';

export interface AuthRequest extends Request {
  user?: { id: string; role: UserRole; unitId?: string };
}

interface AccessTokenPayload {
  id: string;
  role: UserRole;
  unitId?: string;
  tokenVersion?: number;
  persistentSession?: boolean;
}

async function isActivePersistentSession(payload: AccessTokenPayload): Promise<boolean> {
  if (payload.persistentSession !== true) return true;
  const user = await UserModel.findById(payload.id).select('tokenVersion isActive').lean();
  return Boolean(user?.isActive && user.tokenVersion === payload.tokenVersion);
}

export async function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : undefined;
  
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
      if (await isActivePersistentSession(payload)) {
        req.user = payload;
      }
    } catch {
      // Invalid token — continue unauthenticated
    }
  }
  next();
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  let token: string | undefined = undefined;
  
  if (req.headers.authorization?.startsWith('Bearer ')) {
    const headerToken = req.headers.authorization.split(' ')[1];
    if (headerToken && headerToken !== 'null' && headerToken !== 'undefined') {
      token = headerToken;
    }
  }
  
  if (!token) {
    next(new UnauthorizedError('Token de autenticação ausente ou inválido'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    if (!await isActivePersistentSession(payload)) {
      next(new UnauthorizedError('Sessão encerrada. Faça login novamente'));
      return;
    }
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Token de autenticação inválido ou expirado'));
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Você não tem permissão para realizar esta ação.'));
      return;
    }
    next();
  };
}
