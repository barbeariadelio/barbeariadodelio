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

// IMPORTANT: despite the name, this middleware does NOT verify that the
// resource being accessed belongs to the caller's unit — it only checks that
// a non-owner HAS a unit assigned. Route handlers must still scope every
// query/mutation themselves using `resolveUnitId(req)` (list/create) and, for
// update/delete-by-id, by fetching the resource first and comparing its
// `unitId` to `resolveUnitId(req)` before mutating (see product.controller.ts
// / service.controller.ts / client.controller.ts for the pattern). Relying on
// this middleware alone previously allowed a non-owner to read/write another
// unit's products and services just by passing a different `unitId`.
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
 * Rule 1: Non-owners are ALWAYS locked to their JWT unitId — no override
 *         possible. Without a unitId they see nothing (returns null).
 *
 * Rule 2: Owners can see across units regardless of whether their JWT
 *         carries a "home" unitId (e.g. a unit manager seeded with
 *         role 'owner' + unitId still manages other units in the same
 *         franchise). They scope a request via:
 *           - X-Unit-ID header  (sent by franchise app on every request)
 *           - ?unitId= query param  (sent by admin app interceptor)
 *         Returns null = "see all units" if neither is present.
 */
export function resolveUnitId(req: AuthRequest): string | null {
  const { role, unitId: jwtUnitId } = req.user!;

  // Rule 1 — non-owners are always locked to their own unit.
  if (role !== 'owner') {
    return jwtUnitId ?? null;
  }

  // Rule 2 — any owner can scope via header or query param, or see all units.
  const headerUnit = req.headers['x-unit-id'] as string | undefined;
  const queryUnit  = req.query.unitId as string | undefined;
  return headerUnit || queryUnit || null;
}
