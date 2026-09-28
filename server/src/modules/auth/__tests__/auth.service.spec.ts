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
    create: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
    distinct: vi.fn(),
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

  const newUser = {
    _id: { toString: () => 'client-1' },
    name: 'Cliente Novo',
    phone: '11988887777',
    role: 'client',
    tokenVersion: 0,
    isActive: true,
    toObject: () => ({ role: 'client' }),
  };

  it('logs in a brand-new customer on the first attempt without creating a unit-less client record', async () => {
    const service = new AuthService();
    (UserModel.findOne as any).mockResolvedValue(null);
    (UserModel.create as any).mockResolvedValue(newUser);
    (ClientModel.distinct as any).mockResolvedValue([]);

    const result = await service.bookingLogin('Cliente Novo', '(11) 98888-7777');

    expect(result.accessToken).toBeTruthy();
    expect(ClientModel.create).not.toHaveBeenCalled();
    expect(ClientModel.updateMany).toHaveBeenCalledWith(
      { phone: '11988887777', userId: { $nin: [] } },
      { $set: { userId: newUser._id } },
    );
  });

  it('relinks client records left pointing at a deleted account, but not ones owned by a live account', async () => {
    const service = new AuthService();
    (UserModel.findOne as any).mockResolvedValue(null);
    (UserModel.create as any).mockResolvedValue(newUser);
    (ClientModel.distinct as any).mockResolvedValue(['deleted-user', 'live-user']);
    (UserModel.distinct as any).mockResolvedValue(['live-user']);

    await service.bookingLogin('Cliente Novo', '(11) 98888-7777');

    expect(UserModel.distinct).toHaveBeenCalledWith('_id', { _id: { $in: ['deleted-user', 'live-user'] } });
    expect(ClientModel.updateMany).toHaveBeenCalledWith(
      { phone: '11988887777', userId: { $nin: ['live-user'] } },
      { $set: { userId: newUser._id } },
    );
  });
});
