import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    unitId: z.string().min(1, 'Unidade é obrigatória'),
    type: z.enum(['income', 'expense', 'royalty']),
    category: z.string().min(1, 'Categoria é obrigatória'),
    amount: z.number().min(0, 'Valor deve ser positivo'),
    description: z.string().min(1, 'Descrição é obrigatória'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
    employeeId: z.string().optional(),
  }).strict(),
});

export const updateTransactionSchema = z.object({
  body: z.object({
    category: z.string().optional(),
    amount: z.number().min(0).optional(),
    description: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    employeeId: z.string().optional(),
    type: z.enum(['income', 'expense', 'royalty']).optional(),
    isPaid: z.boolean().optional(),
    appointmentId: z.string().nullable().optional(),
  }).strict(),
});
