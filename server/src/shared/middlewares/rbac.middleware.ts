import { Response, NextFunction } from 'express';
import type { UserRole } from '@barber/types';
import { AuthRequest } from './auth.middleware';
import { ForbiddenError } from '../errors/AppError';

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

export function requireSameUnit() {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ForbiddenError());
      return;
    }
    const { role, unitId } = req.user;
    const requestedUnit = req.query.unitId as string | undefined;

    if (role === 'owner' || role === 'franchisor') {
      next();
      return;
    }

    if (requestedUnit && requestedUnit !== unitId) {
      next(new ForbiddenError('Access to this unit is not allowed'));
      return;
    }

    next();
  };
}
