import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientModel } from '../client.model';
import { UserModel } from '../../auth/auth.model';
import { ClientService } from '../client.service';
import { AppointmentModel } from '../../appointments/appointment.model';

const mocks = vi.hoisted(() => ({
  clientFindById: vi.fn(),
  clientFindByIdAndDelete: vi.fn(),
  appointmentUpdateMany: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock('../client.model', () => ({
  ClientModel: {
    findById: mocks.clientFindById,
    findByIdAndDelete: mocks.clientFindByIdAndDelete,
  },
}));
vi.mock('../../appointments/appointment.model', () => ({
  AppointmentModel: { updateMany: mocks.appointmentUpdateMany },
}));
vi.mock('../../auth/auth.model', () => ({ UserModel: { find: mocks.userFind } }));

describe('ClientService.mergeClients ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects merging two records owned by different active client accounts before moving history', async () => {
    const source = {
      _id: { toString: () => 'source' },
      userId: { toString: () => 'user-source' },
      unitId: { toString: () => 'unit-1' },
      packages: [],
    };
    const target = {
      _id: { toString: () => 'target' },
      userId: { toString: () => 'user-target' },
      unitId: { toString: () => 'unit-1' },
      packages: [],
      save: vi.fn(),
    };
    mocks.clientFindById.mockReturnValue({ populate: vi.fn().mockResolvedValue(target) });
    mocks.clientFindByIdAndDelete.mockResolvedValue({});
    mocks.clientFindById.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
    mocks.userFind.mockResolvedValue([
      { _id: 'user-source', role: 'client', isActive: true },
      { _id: 'user-target', role: 'client', isActive: true },
    ]);

    await expect(new ClientService().mergeClients('source', 'target', {}))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.appointmentUpdateMany).not.toHaveBeenCalled();
    expect(target.save).not.toHaveBeenCalled();
    expect(mocks.clientFindByIdAndDelete).not.toHaveBeenCalled();
  });
});