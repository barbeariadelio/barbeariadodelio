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

  async list(unitId: string, options: { role?: string; userId?: string; limit?: number } = {}) {
    const { role, userId, limit = 20 } = options;
    const docs = await NotificationModel.find({ unitId })
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'clientId', select: 'name phone' },
          { path: 'employeeId', select: 'name' },
          { path: 'serviceId', select: 'name' },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(role === 'employee' ? 200 : limit);

    if (role === 'employee' && userId) {
      return docs
        .filter(n => {
          const appt = n.appointmentId as any;
          if (!appt) return false;
          const empId = appt.employeeId?._id?.toString() ?? appt.employeeId?.toString();
          return empId === userId;
        })
        .slice(0, limit);
    }

    return docs;
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
