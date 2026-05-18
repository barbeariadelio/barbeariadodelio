import { NotificationModel } from './notification.model';

interface NotifyOptions {
  unitId: string;
  type: 'cancellation' | 'edit' | 'new';
  title: string;
  message: string;
  appointmentId?: string;
  external?: boolean;
}

class NotificationService {
  async notify(options: NotifyOptions) {
    const { unitId, type, title, message, appointmentId } = options;

    const notification = await NotificationModel.create({
      unitId,
      type,
      title,
      message,
      appointmentId,
    });

    return notification;
  }

  async list(unitId: string, limit = 20) {
    return NotificationModel.find({ unitId })
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'clientId', select: 'name phone' },
          { path: 'employeeId', select: 'name' },
          { path: 'serviceId', select: 'name' },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async markAsRead(id: string, userId: string) {
    return NotificationModel.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true },
    );
  }
}

export const notificationService = new NotificationService();
