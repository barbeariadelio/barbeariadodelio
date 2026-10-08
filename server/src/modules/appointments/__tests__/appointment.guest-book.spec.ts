import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serviceFindById: vi.fn(),
  clientFindOne: vi.fn(),
  userFindOne: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock('../appointment.model', () => ({ AppointmentModel: {} }));
vi.mock('../../services/service.model', () => ({ ServiceModel: { findById: mocks.serviceFindById } }));
vi.mock('../../clients/client.model', () => ({ ClientModel: { findOne: mocks.clientFindOne } }));
vi.mock('../../units/unit.model', () => ({ UnitModel: {} }));
vi.mock('../../auth/auth.model', () => ({
  UserModel: {
    findOne: mocks.userFindOne,
    findById: mocks.userFindById,
  },
}));

import { AppointmentService } from '../appointment.service';

describe('AppointmentService.guestBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceFindById.mockResolvedValue({
      _id: { toString: () => 'service-1' },
      unitId: { toString: () => 'unit-1' },
      isActive: true,
      isOnline: true,
      durationMinutes: 30,
      price: 50,
      type: 'single',
    });
    mocks.clientFindOne.mockResolvedValue(null);
    mocks.userFindOne.mockImplementation((filter: { phone?: string }) =>
      Promise.resolve(filter.phone ? { _id: 'staff-1', role: 'employee' } : null),
    );
    mocks.userFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          unitId: { toString: () => 'unit-1' },
          role: 'employee',
          isActive: true,
          allowOnlineBooking: true,
        }),
      }),
    });
  });

  it('rejects public booking with a phone number owned by an internal account', async () => {
    const service = new AppointmentService();

    await expect(service.guestBook({
      unitId: 'unit-1',
      serviceId: 'service-1',
      employeeId: 'employee-1',
      date: '2099-08-10',
      startTime: '10:00',
      price: 0,
      guestName: 'Cliente Teste',
      guestPhone: '11999999999',
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.clientFindOne).toHaveBeenCalledWith({
      phone: { $in: ['11999999999', '5511999999999'] },
      unitId: 'unit-1',
    });
    expect(mocks.userFindOne).toHaveBeenCalledWith({
      phone: { $in: ['11999999999', '5511999999999'] },
    });
  });

  it('rejects a public booking outside the employee available slots', async () => {
    mocks.userFindOne.mockResolvedValue(null);
    const service = new AppointmentService();
    vi.spyOn(service, 'getAvailableSlots').mockResolvedValue([]);

    await expect(service.guestBook({
      unitId: 'unit-1',
      serviceId: 'service-1',
      employeeId: 'employee-1',
      date: '2099-08-10',
      startTime: '10:00',
      price: 0,
      guestName: 'Cliente Teste',
      guestPhone: '11999999999',
    })).rejects.toMatchObject({ statusCode: 400 });

    expect(service.getAvailableSlots).toHaveBeenCalledWith('unit-1', 'employee-1', '2099-08-10', 30, 30);
  });
});
