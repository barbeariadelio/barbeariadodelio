import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  franchiseFindOne: vi.fn(),
}));

vi.mock('../unit.service', () => ({
  UnitService: class {
    findById = mocks.findById;
    update = mocks.update;
  },
}));

vi.mock('../../franchise/franchise.model', () => ({
  FranchiseModel: { findOne: mocks.franchiseFindOne },
}));

import { updateUnit } from '../unit.controller';

// Mirrors the real production shape: two units, two owner accounts, and both
// units carrying the FIRST owner's id. The second owner is the ownerId of no
// unit at all, and no franchise document exists to bridge them.
const OWNER_PRIMARY = '69fa463b8515601b848e7631';
const OWNER_SECOND = '6a09aaeea8f8c48f57cddb97';
const UNIT_SECOND_RUNS = '69fa463aa078044937f70250';
const UNIT_OTHER = '69fa463aa078044937f7024e';

function buildReq(userId: string, jwtUnitId?: string) {
  return {
    params: { id: UNIT_SECOND_RUNS },
    body: { name: 'Nome novo' },
    user: { id: userId, role: 'owner', unitId: jwtUnitId },
    headers: {},
  } as never;
}

function buildRes() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as never;
}

describe('updateUnit — who may edit a unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({ _id: UNIT_SECOND_RUNS, ownerId: OWNER_PRIMARY });
    mocks.update.mockResolvedValue({ _id: UNIT_SECOND_RUNS, name: 'Nome novo' });
    mocks.franchiseFindOne.mockResolvedValue(null);
  });

  it('allows the owner whose id is stored on the unit', async () => {
    const next = vi.fn();
    await updateUnit(buildReq(OWNER_PRIMARY, UNIT_OTHER), buildRes(), next);

    expect(mocks.update).toHaveBeenCalledWith(UNIT_SECOND_RUNS, { name: 'Nome novo' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the second owner to edit the unit their token is scoped to', async () => {
    // Regression: this 403'd before, locking that account out of its own unit.
    const next = vi.fn();
    await updateUnit(buildReq(OWNER_SECOND, UNIT_SECOND_RUNS), buildRes(), next);

    expect(mocks.update).toHaveBeenCalledWith(UNIT_SECOND_RUNS, { name: 'Nome novo' });
    expect(next).not.toHaveBeenCalled();
  });

  it('still denies an owner with no claim to the unit', async () => {
    const next = vi.fn();
    await updateUnit(buildReq(OWNER_SECOND, UNIT_OTHER), buildRes(), next);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('still denies an owner whose token carries no unit at all', async () => {
    const next = vi.fn();
    await updateUnit(buildReq(OWNER_SECOND, undefined), buildRes(), next);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('allows an owner reached through a franchise they are a franchisor of', async () => {
    mocks.franchiseFindOne.mockResolvedValue({ units: [UNIT_SECOND_RUNS] });
    const next = vi.fn();
    await updateUnit(buildReq(OWNER_SECOND, UNIT_OTHER), buildRes(), next);

    expect(mocks.update).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
