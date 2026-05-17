import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres'),
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['owner', 'employee', 'client', 'cashier']),
    unitId: z.string().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    allowedApps: z.array(z.string()).optional(),
    workSchedule: z.object({
      start: z.string(),
      end: z.string(),
      lunchStart: z.string().optional(),
      lunchEnd: z.string().optional(),
      workDays: z.array(z.number()).optional(),
    }).optional(),
    daySchedules: z.array(z.object({
      day: z.number().min(0).max(6),
      slots: z.array(z.object({ start: z.string(), end: z.string() })),
    })).optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    email: z.any().optional(),
    phone: z.any().optional(),
    role: z.enum(['owner', 'employee', 'client', 'cashier']).optional(),
    unitId: z.any().optional(),
    isActive: z.boolean().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    allowedApps: z.array(z.string()).optional(),
    workSchedule: z.object({
      start: z.string(),
      end: z.string(),
      lunchStart: z.string().optional(),
      lunchEnd: z.string().optional(),
      workDays: z.array(z.number()).optional(),
    }).optional(),
    daySchedules: z.array(z.object({
      day: z.number().min(0).max(6),
      slots: z.array(z.object({ start: z.string(), end: z.string() })),
    })).optional(),
  }),
});
