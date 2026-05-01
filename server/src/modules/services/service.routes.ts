import { Router } from 'express';
import { listServices, createService, updateService, toggleService } from './service.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const serviceRoutes = Router();

serviceRoutes.get('/', listServices); // public — booking portal needs this
serviceRoutes.post('/', authenticate, requireRoles('owner', 'franchisee'), createService);
serviceRoutes.patch('/:id', authenticate, requireRoles('owner', 'franchisee'), updateService);
serviceRoutes.patch('/:id/toggle', authenticate, requireRoles('owner', 'franchisee'), toggleService);
