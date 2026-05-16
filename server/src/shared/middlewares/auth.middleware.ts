import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import type { UserRole } from '@barber/types';

export interface AuthRequest extends Request {
  user?: { id: string; role: UserRole; unitId?: string };
}

export function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : undefined;
  
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as {
        id: string;
        role: UserRole;
        unitId?: string;
      };
      req.user = payload;
    } catch {
      // Invalid token — continue unauthenticated
    }
  }
  next();
}

export function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
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
    const payload = jwt.verify(token, env.jwtSecret) as {
      id: string;
      role: UserRole;
      unitId?: string;
    };
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
