import { describe, expect, it } from 'vitest';
import { createAppointmentSchema, guestBookSchema } from '../appointment.schema';

const validGuestBooking = {
  unitId: 'unit-1',
  serviceId: 'service-1',
  employeeId: 'employee-1',
  date: '2026-08-10',
  startTime: '10:00',
  guestName: 'Cliente Teste',
  guestPhone: '11999999999',
};

describe('appointment schemas', () => {
  it.each([
    ['2026-99-99', '10:00'],
    ['2026-02-30', '10:00'],
    ['2026-08-10', '25:99'],
    ['2026-08-10', '10:60'],
  ])('rejects an invalid calendar date or time: %s %s', (date, startTime) => {
    const result = guestBookSchema.safeParse({ body: { ...validGuestBooking, date, startTime } });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid internal end time', () => {
    const result = createAppointmentSchema.safeParse({
      body: {
        unitId: 'unit-1',
        employeeId: 'employee-1',
        date: '2026-08-10',
        startTime: '10:00',
        endTime: '24:00',
        status: 'blocked',
      },
    });

    expect(result.success).toBe(false);
  });

  it('requires a valid duration for a blocked schedule slot', () => {
    const result = createAppointmentSchema.safeParse({
      body: {
        unitId: 'unit-1',
        employeeId: 'employee-1',
        date: '2026-08-10',
        startTime: '10:00',
        status: 'blocked',
      },
    });

    expect(result.success).toBe(false);
  });
});
