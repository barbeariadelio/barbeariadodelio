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

    if (role === 'owner') {
      next();
      return;
    }

    if (!unitId) {
      next(new ForbiddenError('Usuário sem unidade vinculada.'));
      return;
    }

    next();
  };
}

/**
 * Soul540-style tenant resolution.
 *
 * Rule 1: If the JWT carries a unitId (any role, including owner),
 *         the user is ALWAYS locked to that unit — no override possible.
 *         → Franchise owner accounts have unitId set, so they can never
 *           see data from other units, regardless of which app they use.
 *
 * Rule 2: Owners whose JWT has NO unitId (the global admin owner) can
 *         scope a request via:
 *           - X-Unit-ID header  (sent by franchise app on every request)
 *           - ?unitId= query param  (sent by admin app interceptor)
 *         Returns null = "see all units" if neither is present.
 *
 * Rule 3: Non-owners without unitId cannot see any data (returns null).
 */
export function resolveUnitId(req: AuthRequest): string | null {
  const { role, unitId: jwtUnitId } = req.user!;

  // Rule 1 — JWT unitId always wins, regardless of role.
  if (jwtUnitId) {
    return jwtUnitId;
  }

  // Rule 2 — global admin owner can scope via header or query param.
  if (role === 'owner') {
    const headerUnit = req.headers['x-unit-id'] as string | undefined;
    const queryUnit  = req.query.unitId as string | undefined;
    return headerUnit || queryUnit || null;
  }

  // Rule 3 — non-owners without unitId see nothing.
  return null;
}
