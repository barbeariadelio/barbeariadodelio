import mongoose, { Schema, Document } from 'mongoose';
import type { AppointmentStatus } from '@barber/types';

export interface IAppointment extends Document {
  clientId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  price: number;
  isPackage?: boolean;
  usedPackageId?: mongoose.Types.ObjectId;
  seriesId?: string;
  source?: 'guest' | 'admin';
  reminderSent?: boolean;
  isBilled?: boolean;
  serviceBilled?: boolean;
  productsBilled?: boolean;
  billingSkipped?: boolean;
  products?: Array<{
    productId: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    clientId:   { type: Schema.Types.ObjectId, ref: 'Client' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    serviceId:  { type: Schema.Types.ObjectId, ref: 'Service' },
    unitId:     { type: Schema.Types.ObjectId, ref: 'Unit',    required: true },
    date:       { type: String, required: true },
    startTime:  { type: String, required: true },
    endTime:    { type: String, required: true },
    status:     {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'blocked'],
      default: 'confirmed',
    },
    notes: String,
    price: { type: Number, required: true, min: 0, default: 0 },
    isPackage: { type: Boolean, default: false },
    usedPackageId: { type: Schema.Types.ObjectId, ref: 'Service' },
    seriesId: { type: String, index: true },
    isBilled: { type: Boolean, default: false },
    serviceBilled: { type: Boolean, default: false },
    productsBilled: { type: Boolean, default: false },
    source: { type: String, enum: ['guest', 'admin'], default: undefined },
    reminderSent: { type: Boolean, default: false },
    billingSkipped: { type: Boolean, default: false },
    products: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      name:      { type: String, required: true },
      quantity:  { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
    }],
  },
  { timestamps: true },
);

appointmentSchema.index({ unitId: 1, date: 1, employeeId: 1 });
appointmentSchema.index({ clientId: 1 });

export const AppointmentModel = mongoose.model<IAppointment>('Appointment', appointmentSchema);
