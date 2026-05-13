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

    // Privileged roles can access any unit
    if (role === 'owner' || role === 'franchisor' || role === 'admin') {
      next();
      return;
    }

    // For unit-level roles, we MUST have a unitId
    if (!unitId) {
      next(new ForbiddenError('Usuário sem unidade vinculada.'));
      return;
    }

    // Unit-scoped roles are permitted — controllers scope data to req.query.unitId
    // (sent by the app's VITE_UNIT_ID) or fall back to req.user.unitId.
    // We do not reject mismatches here because each front-end app is intentionally
    // configured with its own VITE_UNIT_ID that may differ from the JWT's unitId
    // (e.g. a cashier whose JWT unitId is the franchise unit logging into the admin app).
    next();
  };
}
