import { z } from 'zod';
import zxcvbn from 'zxcvbn';

const passwordSchema = z.string()
  .min(8, 'A senha deve ter no mínimo 8 caracteres')
  .refine((val) => zxcvbn(val).score >= 2, {
    message: 'A senha é muito fraca. Tente usar uma combinação de letras, números e símbolos.',
  });

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Informe seu e-mail ou telefone'),
    password: z.string().min(1, 'Informe sua senha'),
    appId: z.string().optional(),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().min(10, 'Telefone inválido'),
    password: passwordSchema,
    unitId: z.string().optional(),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').optional(),
    email: z.string().email('E-mail inválido').optional(),
    phone: z.string().min(10, 'Telefone inválido').optional(),
  }).strict(),
});

export const updateThemeSchema = z.object({
  body: z.object({
    theme: z.enum(['light', 'dark']),
  }).strict(),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
    newPassword: passwordSchema,
  }).strict(),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Informe seu e-mail ou telefone'),
  }).strict(),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token é obrigatório'),
    newPassword: passwordSchema,
  }).strict(),
});
