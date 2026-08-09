import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appointmentCreate: vi.fn(),
  appointmentFindOne: vi.fn(),
  serviceFindById: vi.fn(),
  clientFindById: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock('../appointment.model', () => ({ AppointmentModel: { create: mocks.appointmentCreate, findOne: mocks.appointmentFindOne } }));
vi.mock('../../services/service.model', () => ({ ServiceModel: { findById: mocks.serviceFindById } }));
vi.mock('../../clients/client.model', () => ({ ClientModel: { findById: mocks.clientFindById } }));
vi.mock('../../auth/auth.model', () => ({ UserModel: { findById: mocks.userFindById } }));
vi.mock('../../units/unit.model', () => ({ UnitModel: {} }));

import { AppointmentService } from '../appointment.service';

describe('AppointmentService.create package sale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appointmentFindOne.mockResolvedValue(null);
    mocks.userFindById.mockReturnValue({ select: vi.fn().mockResolvedValue({}) });
    mocks.serviceFindById.mockResolvedValue({
      _id: { toString: () => 'package-1' },
      type: 'package',
      price: 200,
      durationMinutes: 30,
      packageItems: [{ serviceId: 'service-1', quantity: 4 }],
    });
    mocks.appointmentCreate.mockResolvedValue({
      _id: { toString: () => 'appointment-1' },
      unitId: { toString: () => 'unit-1' },
    });
  });

  it('does not activate a package before the appointment sale is billed', async () => {
    const service = new AppointmentService();

    await service.create({
      status: 'blocked',
      unitId: 'unit-1' as any,
      clientId: 'client-1' as any,
      serviceId: 'package-1' as any,
      employeeId: 'employee-1' as any,
      date: '2026-08-10',
      startTime: '10:00',
    });

    expect(mocks.clientFindById).not.toHaveBeenCalled();
  });
});
