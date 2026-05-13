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

    // If a unit is requested (via query, body, or params), it MUST match the user's unit
    const requestedUnit = req.query.unitId || req.body.unitId || req.params.unitId || req.params.id;

    if (requestedUnit && requestedUnit.toString() !== unitId.toString()) {
      next(new ForbiddenError('Acesso negado: Esta unidade não pertence ao seu perfil.'));
      return;
    }

    next();
  };
}
