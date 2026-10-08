import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientModel } from '../client.model';
import { UserModel } from '../../auth/auth.model';
import { ClientService } from '../client.service';

const mocks = vi.hoisted(() => ({
  clientFindOne: vi.fn(),
  clientCreate: vi.fn(),
  clientFindByIdAndUpdate: vi.fn(),
  clientFindById: vi.fn(),
  userFindOne: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock('../client.model', () => ({
  ClientModel: {
    findOne: mocks.clientFindOne,
    create: mocks.clientCreate,
    findByIdAndUpdate: mocks.clientFindByIdAndUpdate,
    findById: mocks.clientFindById,
  },
}));
vi.mock('../../auth/auth.model', () => ({
  UserModel: {
    findOne: mocks.userFindOne,
    findById: mocks.userFindById,
  },
}));

describe('ClientService phone ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses a client in the same unit when the phone has a country-code variant', async () => {
    const existing = { _id: 'client-1', phone: '19983350939', unitId: 'unit-1' };
    mocks.clientFindOne.mockResolvedValue(existing);
    const service = new ClientService();

    const result = await service.create({
      name: 'Marina Torres',
      phone: '5519983350939',
      unitId: 'unit-1' as any,
    });

    expect(mocks.clientFindOne).toHaveBeenCalledWith({
      unitId: 'unit-1',
      phone: { $in: ['19983350939', '5519983350939'] },
    });
    expect(result).toBe(existing);
    expect(mocks.clientCreate).not.toHaveBeenCalled();
  });

  it('never auto-links a client record to an internal account', async () => {
    mocks.clientFindOne.mockResolvedValue(null);
    mocks.userFindOne.mockResolvedValue(null);
    mocks.clientCreate.mockResolvedValue({ _id: 'client-1' });
    const service = new ClientService();

    await service.create({ name: 'Cliente', phone: '(19) 98335-0939', unitId: 'unit-1' as any });

    expect(mocks.userFindOne).toHaveBeenCalledWith({
      phone: { $in: ['19983350939', '5519983350939'] },
      role: 'client',
      isActive: true,
    });
    expect(mocks.clientCreate).toHaveBeenCalledWith({
      name: 'Cliente',
      phone: '19983350939',
      unitId: 'unit-1',
    });
  });

  it('normalizes a phone before updating a client record', async () => {
    mocks.clientFindByIdAndUpdate.mockResolvedValue({ _id: 'client-1', phone: '19983350939' });
    const service = new ClientService();

    await service.update('client-1', { phone: '55 (19) 98335-0939' });

    expect(mocks.clientFindByIdAndUpdate).toHaveBeenCalledWith(
      'client-1',
      { phone: '19983350939' },
      { new: true, runValidators: true },
    );
  });

  it('finds or creates the authenticated user client for a unit', async () => {
    const user = { _id: 'user-1', name: 'Cliente', email: 'cliente@example.com', phone: '5519983350939' };
    const client = { _id: 'client-1', userId: 'user-1', unitId: 'unit-1' };
    mocks.userFindById.mockResolvedValue(user);
    mocks.clientFindOne.mockResolvedValue(client);
    const service = new ClientService();

    const result = await service.findOrCreateForUserAndUnit('user-1', 'unit-1');

    expect(mocks.clientFindOne).toHaveBeenCalledWith({ userId: 'user-1', unitId: 'unit-1' });
    expect(result).toBe(client);
    expect(mocks.clientCreate).not.toHaveBeenCalled();
  });
});