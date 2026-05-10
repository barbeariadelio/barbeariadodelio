import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  unitId: mongoose.Types.ObjectId;
  type: 'cancellation' | 'edit' | 'new';
  title: string;
  message: string;
  appointmentId?: mongoose.Types.ObjectId;
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    type: { type: String, enum: ['cancellation', 'edit', 'new'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model<INotification>('Notification', notificationSchema);
