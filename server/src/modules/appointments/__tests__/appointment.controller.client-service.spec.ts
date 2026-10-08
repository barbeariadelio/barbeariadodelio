import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientFindOne: vi.fn(),
  clientCreate: vi.fn(),
  clientFindById: vi.fn(),
  userFindById: vi.fn(),
  findOrCreateForUserAndUnit: vi.fn(),
  appointmentCreate: vi.fn(),
  appointmentFindById: vi.fn(),
  notify: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../appointment.service', () => ({
  AppointmentService: class {
    create = mocks.appointmentCreate;
    findById = mocks.appointmentFindById;
  },
}));
vi.mock('../../clients/client.service', () => ({
  ClientService: class {
    findOrCreateForUserAndUnit = mocks.findOrCreateForUserAndUnit;
  },
}));
vi.mock('../appointment.model', () => ({ AppointmentModel: {} }));
vi.mock('../../clients/client.model', () => ({
  ClientModel: {
    findOne: mocks.clientFindOne,
    create: mocks.clientCreate,
    findById: mocks.clientFindById,
  },
}));
vi.mock('../../auth/auth.model', () => ({ UserModel: { findById: mocks.userFindById } }));
vi.mock('../../clients/client-ownership.service', () => ({ ClientOwnershipService: class {} }));
vi.mock('../../notifications/notification.service', () => ({ notificationService: { notify: mocks.notify } }));
vi.mock('../../events/sse.service', () => ({ sseService: { emit: mocks.emit } }));

import { createAppointment } from '../appointment.controller';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe('createAppointment client record resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientFindOne.mockResolvedValue(null);
    mocks.clientCreate.mockResolvedValue({ _id: 'legacy-client' });
    mocks.userFindById.mockResolvedValue({ _id: 'user-1', name: 'Cliente', phone: '19983350939' });
    mocks.findOrCreateForUserAndUnit.mockResolvedValue({ _id: 'client-1' });
    mocks.appointmentCreate.mockResolvedValue({ _id: { toString: () => 'appointment-1' }, unitId: { toString: () => 'unit-1' } });
    mocks.appointmentFindById.mockResolvedValue({
      _id: { toString: () => 'appointment-1' },
      clientId: { toString: () => 'client-1' },
      unitId: { toString: () => 'unit-1' },
    });
    mocks.clientFindById.mockResolvedValue({ name: 'Cliente' });
    mocks.notify.mockResolvedValue(undefined);
  });

  it('resolves the authenticated client through ClientService before creating an appointment', async () => {
    const next = vi.fn();

    await createAppointment({
      body: {
        unitId: 'unit-1',
        serviceId: 'service-1',
        employeeId: 'employee-1',
        date: '2099-08-10',
        startTime: '10:00',
      },
      user: { id: 'user-1', role: 'client', unitId: 'unit-1' },
    } as any, response() as any, next);

    expect(mocks.findOrCreateForUserAndUnit).toHaveBeenCalledWith('user-1', 'unit-1');
    expect(mocks.clientCreate).not.toHaveBeenCalled();
    expect(mocks.appointmentCreate).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1' }));
    expect(next).not.toHaveBeenCalled();
  });
});