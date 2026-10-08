import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  appointmentFindById: vi.fn(),
  clientFind: vi.fn(),
  clientFindById: vi.fn(),
  notify: vi.fn(),
  emit: vi.fn(),
  canUserAccessClient: vi.fn(),
}));

vi.mock('../appointment.service', () => ({
  AppointmentService: class {
    create = mocks.create;
    findById = mocks.findById;
    update = mocks.update;
  },
}));

vi.mock('../appointment.model', () => ({
  AppointmentModel: { findById: mocks.appointmentFindById },
}));

vi.mock('../../clients/client.model', () => ({
  ClientModel: {
    find: mocks.clientFind,
    findById: mocks.clientFindById,
  },
}));

vi.mock('../../auth/auth.model', () => ({ UserModel: {} }));
vi.mock('../../clients/client-ownership.service', () => ({
  ClientOwnershipService: class {
    canUserAccessClient = mocks.canUserAccessClient;
  },
}));
vi.mock('../../notifications/notification.service', () => ({ notificationService: { notify: mocks.notify } }));
vi.mock('../../events/sse.service', () => ({ sseService: { emit: mocks.emit } }));

import { createAppointment, updateAppointment } from '../appointment.controller';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function ownedAppointment() {
  return {
    _id: { toString: () => 'appointment-1' },
    clientId: { toString: () => 'client-1' },
    unitId: { toString: () => 'unit-1' },
    serviceId: { name: 'Corte' },
  };
}

describe('appointment client permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ _id: { toString: () => 'appointment-1' }, unitId: { toString: () => 'unit-1' } });
    mocks.findById.mockResolvedValue(ownedAppointment());
    mocks.update.mockResolvedValue({ unitId: { toString: () => 'unit-1' } });
    mocks.appointmentFindById.mockResolvedValue(ownedAppointment());
    mocks.clientFind.mockResolvedValue([{ _id: { toString: () => 'client-1' } }]);
    mocks.clientFindById.mockResolvedValue({ name: 'Cliente' });
    mocks.notify.mockResolvedValue(undefined);
    mocks.canUserAccessClient.mockResolvedValue(true);
  });

  it('rejects a client attempt to create a blocked slot', async () => {
    const next = vi.fn();

    await createAppointment({
      body: {
        unitId: 'unit-1',
        employeeId: 'employee-1',
        date: '2026-08-10',
        startTime: '10:00',
        status: 'blocked',
      },
      user: { id: 'user-1', role: 'client' },
    } as any, response() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a client attempt to change appointment status through the generic update', async () => {
    const next = vi.fn();

    await updateAppointment({
      params: { id: 'appointment-1' },
      body: { status: 'completed' },
      user: { id: 'user-1', role: 'client' },
    } as any, response() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an employee attempt to block another professional schedule', async () => {
    const next = vi.fn();

    await createAppointment({
      body: {
        unitId: 'unit-1',
        employeeId: 'employee-2',
        date: '2026-08-10',
        startTime: '10:00',
        status: 'blocked',
      },
      user: { id: 'employee-1', role: 'employee', unitId: 'unit-1' },
    } as any, response() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
