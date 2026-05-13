import { z } from 'zod';

export const createAppointmentSchema = z.object({
  body: z.object({
    unitId: z.string().min(1, 'Unidade é obrigatória'),
    serviceId: z.string().min(1, 'Serviço é obrigatório'),
    employeeId: z.string().min(1, 'Profissional é obrigatório'),
    clientId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)').optional(),
    price: z.coerce.number().min(0).optional(),
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'blocked']).optional(),
    isPackage: z.boolean().optional(),
    usedPackageId: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const guestBookSchema = z.object({
  body: z.object({
    unitId: z.string().min(1, 'Unidade é obrigatória'),
    serviceId: z.string().min(1, 'Serviço é obrigatório'),
    employeeId: z.string().min(1, 'Profissional é obrigatório'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
    price: z.coerce.number().min(0).optional(),
    guestName: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres'),
    guestPhone: z.string().min(10, 'Telefone inválido'),
    isPackage: z.boolean().optional(),
    usedPackageId: z.string().optional(),
    notes: z.string().optional(),
  }),
});
