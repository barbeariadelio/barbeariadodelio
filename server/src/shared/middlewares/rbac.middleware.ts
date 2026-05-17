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
    if (role === 'owner') {
      next();
      return;
    }

    // For unit-level roles, we MUST have a unitId
    if (!unitId) {
      next(new ForbiddenError('Usuário sem unidade vinculada.'));
      return;
    }

    // Unit-scoped roles are permitted.
    // Data scoping is enforced by resolveUnitId() inside each controller.
    next();
  };
}

/**
 * Soul540-style tenant resolution.
 *
 * Non-owners are ALWAYS locked to the unitId stored in their JWT —
 * they cannot override it via query params.
 *
 * Owners can scope a request to a specific unit via:
 *   1. X-Unit-ID request header  (preferred — sent by the franchise app)
 *   2. ?unitId= query param       (fallback — legacy / admin app)
 *   3. Their own JWT unitId       (last resort, usually null for owners)
 *
 * Returns null only for owners with no unit context (meaning "all units").
 */
export function resolveUnitId(req: AuthRequest): string | null {
  const { role, unitId: jwtUnitId } = req.user!;

  if (role !== 'owner') {
    // Non-owners are hard-locked to their JWT unit — no override allowed.
    return jwtUnitId || null;
  }

  // Owners: respect the header first, then the query param, then their own JWT unitId.
  const headerUnit = req.headers['x-unit-id'] as string | undefined;
  const queryUnit  = req.query.unitId as string | undefined;
  return headerUnit || queryUnit || jwtUnitId || null;
}
