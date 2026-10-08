import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findClientIdsForUser: vi.fn(),
  appointmentFind: vi.fn(),
}));

vi.mock('../appointment.model', () => ({
  AppointmentModel: { find: mocks.appointmentFind },
}));
vi.mock('../../clients/client.model', () => ({ ClientModel: { find: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../auth/auth.model', () => ({ UserModel: { findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ phone: '19983350939' }) }) }) } }));
vi.mock('../../clients/client-ownership.service', () => ({
  ClientOwnershipService: class {
    findClientIdsForUser = mocks.findClientIdsForUser;
  },
}));

import { AppointmentService } from '../appointment.service';

describe('AppointmentService client ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads appointments for every client record resolved for the authenticated user', async () => {
    const service = new AppointmentService();
    const populate = vi.fn().mockReturnThis();
    const sort = vi.fn().mockResolvedValue([]);
    mocks.findClientIdsForUser.mockResolvedValue(['client-direct', 'client-stale']);
    mocks.appointmentFind.mockReturnValue({ populate, sort });

    await service.findByUserId('507f1f77bcf86cd799439011');

    expect(mocks.findClientIdsForUser).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(mocks.appointmentFind).toHaveBeenCalledWith({
      clientId: { $in: ['client-direct', 'client-stale'] },
    });
  });
});