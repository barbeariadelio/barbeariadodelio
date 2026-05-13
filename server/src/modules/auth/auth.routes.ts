import { Router } from 'express';
import { login, refresh, logout, me, updateMe, updateTheme, changePassword, forgotPassword, resetPassword } from './auth.controller';
import { validate } from '../../shared/utils/validate';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { refreshSchema, loginSchema, updateMeSchema, updateThemeSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema';

export const authRoutes = Router();

authRoutes.post('/login', validate(loginSchema), login);
authRoutes.post('/refresh', validate(refreshSchema), refresh);
authRoutes.post('/logout', authenticate, logout);
authRoutes.get('/me', authenticate, me);
authRoutes.patch('/me', authenticate, validate(updateMeSchema), updateMe);
authRoutes.put('/theme', authenticate, validate(updateThemeSchema), updateTheme);
authRoutes.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);
authRoutes.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
authRoutes.post('/reset-password', validate(resetPasswordSchema), resetPassword);
