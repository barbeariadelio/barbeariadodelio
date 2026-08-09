import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';
import * as controller from './notification.controller';

const notificationRoutes = Router();

// Staff-only: these are internal alerts (new/edited/cancelled appointments)
// for the unit's team, never meant for a client to read.
notificationRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'cashier'), controller.listNotifications);
notificationRoutes.patch('/read-all', authenticate, requireRoles('owner', 'employee', 'cashier'), controller.markAllRead);
notificationRoutes.patch('/:id/read', authenticate, requireRoles('owner', 'employee', 'cashier'), controller.markRead);

export { notificationRoutes };
