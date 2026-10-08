import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  clientFind: vi.fn(),
  canUserAccessClient: vi.fn(),
}));

vi.mock('../appointment.service', () => ({
  AppointmentService: class {
    findById = mocks.findById;
  },
}));
vi.mock('../appointment.model', () => ({ AppointmentModel: {} }));
vi.mock('../../clients/client.model', () => ({ ClientModel: { find: mocks.clientFind } }));
vi.mock('../../clients/client-ownership.service', () => ({
  ClientOwnershipService: class {
    canUserAccessClient = mocks.canUserAccessClient;
  },
}));
vi.mock('../../auth/auth.model', () => ({ UserModel: {} }));

import { getAppointment } from '../appointment.controller';

function response() {
  return { json: vi.fn(), status: vi.fn() };
}

describe('appointment controller client ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({
      _id: { toString: () => 'appointment-1' },
      clientId: { toString: () => 'client-stale' },
      unitId: { toString: () => 'unit-1' },
    });
    mocks.clientFind.mockResolvedValue([]);
    mocks.canUserAccessClient.mockResolvedValue(true);
  });

  it('allows a client to read an appointment from an eligible stale client record', async () => {
    const next = vi.fn();
    const res = response();

    await getAppointment({
      params: { id: 'appointment-1' },
      user: { id: 'user-current', role: 'client' },
    } as any, res as any, next);

    expect(mocks.canUserAccessClient).toHaveBeenCalledWith('user-current', 'client-stale');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});