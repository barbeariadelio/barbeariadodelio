import { z } from 'zod';

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

const appointmentDate = z.string().refine(isValidIsoDate, 'Data invÃ¡lida (YYYY-MM-DD)');
const appointmentTime = z.string().refine(isValidTime, 'Hora invÃ¡lida (HH:MM)');

export const createAppointmentSchema = z.object({
  body: z.object({
    unitId: z.string().min(1, 'Unidade Ã© obrigatÃ³ria'),
    serviceId: z.string().min(1, 'ServiÃ§o Ã© obrigatÃ³rio').optional(),
    employeeId: z.string().min(1, 'Profissional Ã© obrigatÃ³rio'),
    clientId: z.string().optional(),
    date: appointmentDate,
    startTime: appointmentTime,
    endTime: appointmentTime.optional(),
    price: z.coerce.number().min(0).optional(),
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'blocked']).optional(),
    isPackage: z.boolean().optional(),
    usedPackageId: z.string().optional(),
    notes: z.string().optional(),
    products: z.array(z.object({
      productId: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number().int().min(1),
      unitPrice: z.number().min(0),
    })).optional(),
    seriesId: z.string().optional(),
  }).superRefine((data, ctx) => {
    const hasProducts = (data.products?.length ?? 0) > 0;
    if (data.status !== 'blocked' && !data.serviceId && !hasProducts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceId'], message: 'ServiÃ§o Ã© obrigatÃ³rio' });
    }
    if (data.status === 'blocked' && !data.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Bloqueios exigem um horÃ¡rio de fim' });
    }
    if (data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'O horÃ¡rio de fim deve ser posterior ao inÃ­cio' });
    }
  }),
});

export const guestBookSchema = z.object({
  body: z.object({
    unitId: z.string().min(1, 'Unidade Ã© obrigatÃ³ria'),
    serviceId: z.string().min(1, 'ServiÃ§o Ã© obrigatÃ³rio'),
    employeeId: z.string().min(1, 'Profissional Ã© obrigatÃ³rio'),
    date: appointmentDate,
    startTime: appointmentTime,
    guestName: z.string().min(2, 'O nome deve ter no mÃ­nimo 2 caracteres'),
    guestPhone: z.string().min(10, 'Telefone invÃ¡lido'),
    notes: z.string().max(500).optional(),
  }).strict(),
});
