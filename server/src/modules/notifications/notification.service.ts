import { NotificationModel, INotification } from './notification.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { logger } from '../../shared/utils/logger';

interface NotifyOptions {
  unitId: string;
  type: 'cancellation' | 'edit' | 'new';
  title: string;
  message: string;
  appointmentId?: string;
  external?: boolean; // If true, trigger external notification (WhatsApp/SMS/Webhook)
}

class NotificationService {
  async notify(options: NotifyOptions) {
    const { unitId, type, title, message, appointmentId, external } = options;

    // 1. Internal Notification (DB)
    const notification = await NotificationModel.create({
      unitId,
      type,
      title,
      message,
      appointmentId
    });

    // 2. External Notification (WhatsApp / SMS / Webhook)
    if (external) {
      await this.sendExternalNotification(options);
    }

    return notification;
  }

  private async sendExternalNotification(options: NotifyOptions) {
    // In a real scenario, we would fetch the client/employee phone here.
    // For now, we simulate the integration with a detailed log.
    
    let targetPhone = 'Unknown';
    if (options.appointmentId) {
      const appt = await AppointmentModel.findById(options.appointmentId).populate('clientId');
      if (appt && (appt.clientId as any)?.phone) {
        targetPhone = (appt.clientId as any).phone;
      }
    }

    logger.info({
      targetPhone,
      type: options.type,
      title: options.title,
      message: options.message,
    }, '[EXTERNAL NOTIFICATION]');

    // Integration points:
    // - Twilio (SMS)
    // - Evolution API / WPPConnect (WhatsApp)
    // - HTTP Webhook to a marketing automation tool
  }

  async list(unitId: string, limit = 20) {
    return NotificationModel.find({ unitId })
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'clientId', select: 'name phone' },
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
