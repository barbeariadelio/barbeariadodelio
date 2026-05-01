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
}

const appointmentSchema = new Schema<IAppointment>(
  {
    clientId:   { type: Schema.Types.ObjectId, ref: 'Client',  required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    serviceId:  { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    unitId:     { type: Schema.Types.ObjectId, ref: 'Unit',    required: true },
    date:       { type: String, required: true },
    startTime:  { type: String, required: true },
    endTime:    { type: String, required: true },
    status:     {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending',
    },
    notes: String,
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export const AppointmentModel = mongoose.model<IAppointment>('Appointment', appointmentSchema);
