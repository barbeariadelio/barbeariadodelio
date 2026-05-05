import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors/AppError';
import type { UserRole } from '@barber/types';

export interface AuthRequest extends Request {
  user?: { id: string; role: UserRole; unitId?: string };
}

export function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
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
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError());
    return;
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, env.jwtSecret) as {
      id: string;
      role: UserRole;
      unitId?: string;
    };
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
