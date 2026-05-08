import mongoose, { Schema, Document } from 'mongoose';

export interface IUnit extends Document {
  name: string;
  address: string;
  phone: string;
  cnpj?: string;
  apiUrl?: string;
  ownerId: mongoose.Types.ObjectId;
  franchiseId?: mongoose.Types.ObjectId;
  isActive: boolean;
  workingDays?: number[];   // 0=Sun,1=Mon,...,6=Sat
  workingHours?: {
    start: string;          // e.g. "08:00"
    end: string;            // e.g. "20:00"
    lunchStart?: string;
    lunchEnd?: string;
  };
  slotInterval?: number; // Minutes between appointments
}

const unitSchema = new Schema<IUnit>(
  {
    name:        { type: String, required: true, trim: true },
    address:     { type: String, required: true },
    phone:       { type: String, required: true },
    cnpj:        String,
    apiUrl:      String,
    ownerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    franchiseId: { type: Schema.Types.ObjectId, ref: 'Franchise' },
    isActive:    { type: Boolean, default: true },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // Mon–Sat
    workingHours: {
      type: new Schema({
        start:      { type: String, default: '08:00' },
        end:        { type: String, default: '20:00' },
        lunchStart: String,
        lunchEnd:   String,
      }, { _id: false }),
      default: () => ({ start: '08:00', end: '20:00' }),
    },
    slotInterval: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const UnitModel = mongoose.model<IUnit>('Unit', unitSchema);
