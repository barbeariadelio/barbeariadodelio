import { Request, Response, NextFunction } from 'express';
import type { IUnit } from './unit.model';
import { UnitService } from './unit.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { AppError } from '../../shared/errors/AppError';

const service = new UnitService();

export async function listPublicUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const units = await service.findAll();
    ok(res, units);
  } catch (e) { next(e); }
}

export async function getPublicUnit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await service.findById(req.params.id);
    ok(res, unit);
  } catch (e) { next(e); }
}

export async function listUnits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let units: IUnit[];
    const { role, id, unitId } = req.user!;

    if (role === 'owner') {
      const appScope = req.headers['x-app-scope'] as string | undefined;
      const ownUnits = await service.findByOwner(id);
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const { default: mongoose } = await import('mongoose');
      const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(id) });

      if (appScope === 'admin') {
        const franchiseUnitIds = new Set((franchise?.units ?? []).map(u => u.toString()));
        units = ownUnits.filter(u => !franchiseUnitIds.has(u._id.toString()));
      } else if (appScope === 'franchise') {
        if (franchise && franchise.units.length > 0) {
          units = await service.findByIds(franchise.units.map(u => u.toString()));
        } else {
          // Franchise owner that owns units directly (no FranchiseModel entry) — show their owned units.
          units = ownUnits;
        }
      } else if (franchise && franchise.units.length > 0) {
        const franchiseUnits = await service.findByIds(franchise.units.map(u => u.toString()));
        const ownIds = new Set(ownUnits.map(u => u._id.toString()));
        units = [...ownUnits, ...franchiseUnits.filter(u => !ownIds.has(u._id.toString()))];
      } else {
        units = ownUnits;
      }
    } else if (role === 'cashier') {
      units = await resolveCashierUnits(id, unitId);
    } else if (unitId) {
      units = [await service.findById(unitId)];
    } else {
      units = [];
    }

    ok(res, units);
  } catch (e) { next(e); }
}

// A unit belongs to an owner directly (unit.ownerId), because it is the unit
// the caller's own token is scoped to, or via a franchise they are a
// franchisor of.
//
// The token check is not redundant. In production both units carry the *same*
// ownerId, so the second owner account — whose token is scoped to the unit it
// actually runs — satisfied neither of the other two rules and could not edit
// its own unit. Repointing ownerId would instead have dropped that unit out of
// the first owner's listUnits(), and there is no franchise document to bridge
// them. resolveUnitId() in the RBAC layer already treats the token's unitId as
// the authoritative scope; this mirrors it. Setting a user's unitId is itself
// owner-only, so this grants nothing an owner could not already reach.
async function ownerCanManageUnit(ownerId: string, unit: IUnit, jwtUnitId?: string): Promise<boolean> {
  if (unit.ownerId?.toString() === ownerId) return true;
  if (jwtUnitId && jwtUnitId === unit._id.toString()) return true;
  const { FranchiseModel } = await import('../franchise/franchise.model');
  const { default: mongoose } = await import('mongoose');
  const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(ownerId) });
  return Boolean(franchise?.units.some(u => u.toString() === unit._id.toString()));
}

async function resolveCashierUnits(userId: string, primaryUnitId?: string): Promise<IUnit[]> {
  const { UserModel } = await import('../auth/auth.model');
  const { FranchiseModel } = await import('../franchise/franchise.model');
  const { default: mongoose } = await import('mongoose');

  const userDoc = await UserModel.findById(userId).select('unitId allowedApps');
  const allowedApps: string[] = userDoc?.allowedApps || [];
  const effectiveUnitId = primaryUnitId || userDoc?.unitId?.toString();

  if (allowedApps.length === 0) {
    return effectiveUnitId ? [await service.findById(effectiveUnitId)] : [];
  }

  const primaryUnit = effectiveUnitId ? await service.findById(effectiveUnitId).catch(() => null) : null;
  const ownerId = primaryUnit?.ownerId;

  const resolved: IUnit[] = [];
  const seen = new Set<string>();

  const add = (u: IUnit) => { const key = u._id.toString(); if (!seen.has(key)) { seen.add(key); resolved.push(u); } };

  if (ownerId && allowedApps.includes('admin')) {
    const adminUnits = await service.findByOwner(ownerId.toString());
    adminUnits.forEach(add);
  }

  if (allowedApps.includes('franchise') && ownerId) {
    const franchise = await FranchiseModel.findOne({ franchisors: new mongoose.Types.ObjectId(ownerId.toString()) });
    if (franchise?.units.length) {
      const franchiseUnits = await service.findByIds(franchise.units.map(u => u.toString()));
      franchiseUnits.forEach(add);
    }
  }

  return resolved.length > 0 ? resolved : (primaryUnit ? [primaryUnit] : []);
}

export async function getUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.unitId || req.params.id;
    const { role, id: userId, unitId: jwtUnitId } = req.user!;

    // requireSameUnit() only checks that the caller HAS a unit — it never
    // compares it to the resource being fetched. Do that here: an owner can
    // view any unit, a cashier only the units resolveCashierUnits() actually
    // authorizes them for (which may be more than one), and an employee only
    // their own JWT unit.
    if (role === 'cashier') {
      const authorizedUnits = await resolveCashierUnits(userId, jwtUnitId);
      if (!authorizedUnits.some(u => u._id.toString() === id)) {
        throw new AppError('Acesso negado para esta unidade.', 403);
      }
    } else if (role !== 'owner' && id !== jwtUnitId) {
      throw new AppError('Acesso negado para esta unidade.', 403);
    }

    const unit = await service.findById(id);
    ok(res, unit);
  } catch (e) { next(e); }
}

export async function createUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unit = await service.create({ ...req.body, ownerId: req.user!.id });
    created(res, unit);
  } catch (e) { next(e); }
}

export async function updateUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.unitId || req.params.id;

    // requireRoles('owner') alone isn't enough — there is more than one
    // real owner account, one per unit, and requireSameUnit() doesn't check
    // that this owner actually owns *this* unit.
    const existing = await service.findById(id);
    if (!(await ownerCanManageUnit(req.user!.id, existing, req.user!.unitId))) {
      throw new AppError('Acesso negado para esta unidade.', 403);
    }

    const unit = await service.update(id, req.body);
    ok(res, unit);
  } catch (e) { next(e); }
}
