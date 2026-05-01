import { Router } from 'express';
import { login, refresh, me } from './auth.controller';
import { validate } from '../../shared/utils/validate';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { loginSchema, refreshSchema } from './auth.schema';

export const authRoutes = Router();

authRoutes.post('/login', validate(loginSchema), login);
authRoutes.post('/refresh', validate(refreshSchema), refresh);
authRoutes.get('/me', authenticate, me);
