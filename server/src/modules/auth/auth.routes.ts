import { Router } from 'express';
import { login, refresh, me, updateMe, updateTheme } from './auth.controller';
import { validate } from '../../shared/utils/validate';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { refreshSchema } from './auth.schema';

export const authRoutes = Router();

authRoutes.post('/login', login);
authRoutes.post('/refresh', validate(refreshSchema), refresh);
authRoutes.get('/me', authenticate, me);
authRoutes.patch('/me', authenticate, updateMe);
authRoutes.put('/theme', authenticate, updateTheme);
