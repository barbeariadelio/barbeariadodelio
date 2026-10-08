import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service';
import { UserModel } from '../auth.model';
import { ClientModel } from '../../clients/client.model';

vi.mock('../auth.model', () => ({
  UserModel: {
    findOne: vi.fn(),
    create: vi.fn(),
    distinct: vi.fn(),
  },
}));
vi.mock('../../clients/client.model', () => ({
  ClientModel: {
    distinct: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn(() => 'signed-token') },
}));

describe('AuthService.bookingLogin phone variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a client account when login uses the country-code phone variant', async () => {
    const user = {
      _id: { toString: () => 'client-1' },
      name: 'Cliente',
      email: 'cliente@example.com',
      phone: '19983350939',
      role: 'client',
      isActive: true,
      tokenVersion: 0,
      toObject: () => ({ createdAt: new Date() }),
      save: vi.fn(),
    };
    (UserModel.findOne as any).mockResolvedValue(user);
    (ClientModel.distinct as any).mockResolvedValue([]);

    await new AuthService().bookingLogin('Cliente', '5519983350939');

    expect(UserModel.findOne).toHaveBeenCalledWith({
      phone: { $in: ['19983350939', '5519983350939'] },
      role: 'client',
    });
    expect(ClientModel.distinct).toHaveBeenCalledWith('userId', {
      phone: { $in: ['19983350939', '5519983350939'] },
    });
  });
});