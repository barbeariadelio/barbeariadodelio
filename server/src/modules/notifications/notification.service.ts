import { NotificationModel, INotification } from './notification.model';

class NotificationService {
  async create(data: Partial<INotification>) {
    return NotificationModel.create(data);
  }

  async list(unitId: string, limit = 20) {
    return NotificationModel.find({ unitId })
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'clientId', select: 'name' },
          { path: 'employeeId', select: 'name' },
          { path: 'serviceId', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async markAsRead(id: string, userId: string) {
    return NotificationModel.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true }
    );
  }
}

export const notificationService = new NotificationService();
