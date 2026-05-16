import { Router } from 'express';
import { listClients, getClient, createClient, updateClient, assignPackage, removePackage, updatePackageItemLimit } from './client.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const clientRoutes = Router();

clientRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listClients);
clientRoutes.get('/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), getClient);
clientRoutes.post('/', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), createClient);
clientRoutes.patch('/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), updateClient);
clientRoutes.post('/:id/packages', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), assignPackage);
clientRoutes.delete('/:id/packages/:packageId', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), removePackage);
clientRoutes.patch('/:id/packages/:packageId/items/:serviceId', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), updatePackageItemLimit);
