import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { notificationService as service } from './notification.service';
import { ok } from '../../shared/utils/responseHelper';

export async function listNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const unitId = req.user?.unitId;
    if (!unitId) return ok(res, []);
    const notifications = await service.list(unitId, { role: req.user?.role, userId: req.user?.id });
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

export async function markAllRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const unitId = req.user?.unitId;
    if (!unitId) return ok(res, { modifiedCount: 0 });
    const result = await service.markAllAsRead(unitId, req.user!.id, { role: req.user?.role });
    ok(res, result);
  } catch (e) { next(e); }
}
