import mongoose, { Schema, Document } from 'mongoose';
import type { UserRole } from '@barber/types';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  passwordPlain?: string;
  role: UserRole;
  unitId?: mongoose.Types.ObjectId;
  phone: string;
  avatar?: string;
  workSchedule?: {
    start: string;
    end: string;
    lunchStart?: string;
    lunchEnd?: string;
  };
  vacations?: {
    start: string;
    end: string;
  }[];
  blockedDays?: string[];
  isActive: boolean;
  allowedApps?: string[];
}

const userSchema = new Schema<IUser>(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true },
    passwordHash:  { type: String, required: true },
    passwordPlain: { type: String },
    role:         {
      type: String,
      enum: ['owner', 'employee', 'franchisor', 'franchisee', 'client'],
      required: true,
    },
    unitId:   { type: Schema.Types.ObjectId, ref: 'Unit' },
    phone:    { type: String, required: true },
    avatar:   String,
    workSchedule: {
      start: { type: String, default: '08:00' },
      end: { type: String, default: '18:00' },
      lunchStart: String,
      lunchEnd: String,
    },
    vacations: [{
      start: String,
      end: String,
    }],
    blockedDays: [String],
    isActive: { type: Boolean, default: true },
    allowedApps: { type: [String], default: [] },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
