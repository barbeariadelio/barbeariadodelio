import { Router } from 'express';
import { listServices, createService, updateService, toggleService } from './service.controller';
import { authenticate, optionalAuthenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const serviceRoutes = Router();

serviceRoutes.get('/', optionalAuthenticate, listServices);
serviceRoutes.post('/', authenticate, requireRoles('owner', 'cashier'), createService);
serviceRoutes.patch('/:id', authenticate, requireRoles('owner', 'cashier'), updateService);
serviceRoutes.patch('/:id/toggle', authenticate, requireRoles('owner', 'cashier'), toggleService);
