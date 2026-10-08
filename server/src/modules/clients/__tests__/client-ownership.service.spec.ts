import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientModel } from '../client.model';
import { UserModel } from '../../auth/auth.model';
import { ClientOwnershipService } from '../client-ownership.service';

vi.mock('../client.model', () => ({
  ClientModel: {
    find: vi.fn(),
  },
}));

vi.mock('../../auth/auth.model', () => ({
  UserModel: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
  },
}));

function query<T>(value: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function objectId(value: string) {
  return { toString: () => value };
}

describe('ClientOwnershipService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves direct, orphaned and stale incompatible client records but not an ambiguous active owner', async () => {
    const service = new ClientOwnershipService();
    const currentUser = { phone: '5519983350939', role: 'client', isActive: true };
    const direct = { _id: objectId('direct'), phone: '19983350939', userId: objectId('current') };
    const orphan = { _id: objectId('orphan'), phone: '5519983350939' };
    const stale = { _id: objectId('stale'), phone: '19983350939', userId: objectId('old') };
    const ambiguous = { _id: objectId('ambiguous'), phone: '19983350939', userId: objectId('same-phone-owner') };

    (UserModel.findById as any).mockReturnValue(query(currentUser));
    (ClientModel.find as any)
      .mockReturnValueOnce(query([direct]))
      .mockReturnValueOnce(query([direct, orphan, stale, ambiguous]));
    (UserModel.find as any).mockReturnValue(query([
      { _id: objectId('old'), phone: '11999999999', role: 'client', isActive: true },
      { _id: objectId('same-phone-owner'), phone: '19983350939', role: 'client', isActive: true },
    ]));

    const ids = await service.findClientIdsForUser('current');

    expect(ids.map(id => id.toString())).toEqual(['direct', 'orphan', 'stale']);
  });

  it('finds only active client accounts by equivalent phone', async () => {
    const service = new ClientOwnershipService();
    const activeClient = { _id: objectId('client'), role: 'client', isActive: true };
    (UserModel.findOne as any).mockResolvedValue(activeClient);

    const result = await service.findActiveClientUserByPhone('(19) 98335-0939');

    expect(UserModel.findOne).toHaveBeenCalledWith({
      phone: { $in: ['19983350939', '5519983350939'] },
      role: 'client',
      isActive: true,
    });
    expect(result).toBe(activeClient);
  });
});