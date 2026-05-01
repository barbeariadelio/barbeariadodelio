import { Router } from 'express';
import { listClients, getClient, createClient, updateClient } from './client.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const clientRoutes = Router();

clientRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'franchisee', 'franchisor'), requireSameUnit(), listClients);
clientRoutes.get('/:id', authenticate, requireRoles('owner', 'employee', 'franchisee', 'franchisor'), getClient);
clientRoutes.post('/', authenticate, requireRoles('owner', 'employee'), createClient);
clientRoutes.patch('/:id', authenticate, requireRoles('owner', 'employee'), updateClient);
