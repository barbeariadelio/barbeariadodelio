import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service';
import { UserModel } from '../auth.model';

vi.mock('../auth.model', () => ({
  UserModel: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../clients/client.model', () => ({
  ClientModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'signed-token'),
    verify: vi.fn(),
  },
}));

describe('AuthService.bookingLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a phone linked only to an internal account instead of issuing a privileged booking token', async () => {
    const service = new AuthService();
    const internalUser = {
      _id: { toString: () => 'employee-1' },
      name: 'Profissional',
      phone: '11999999999',
      role: 'employee',
      tokenVersion: 0,
      isActive: true,
      toObject: () => ({ role: 'employee' }),
      save: vi.fn(),
    };

    (UserModel.findOne as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(internalUser);

    await expect(service.bookingLogin('Cliente', '11 99999-9999'))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
