import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { notificationService as service } from './notification.service';
import { ok } from '../../shared/utils/responseHelper';

export async function listNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const unitId = req.user?.unitId;
    if (!unitId) return ok(res, []);
    const notifications = await service.list(unitId);
    ok(res, notifications);
  } catch (e) { next(e); }
}

export async function markRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const notif = await service.markAsRead(id, req.user!.id);
    ok(res, notif);
  } catch (e) { next(e); }
}
