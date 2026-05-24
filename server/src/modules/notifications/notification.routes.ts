import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import * as controller from './notification.controller';

const notificationRoutes = Router();

notificationRoutes.get('/', authenticate, controller.listNotifications);
notificationRoutes.patch('/read-all', authenticate, controller.markAllRead);
notificationRoutes.patch('/:id/read', authenticate, controller.markRead);

export { notificationRoutes };
