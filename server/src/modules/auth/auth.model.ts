import mongoose, { Schema, Document } from 'mongoose';
import type { UserRole } from '@barber/types';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  unitId?: mongoose.Types.ObjectId;
  phone: string;
  avatar?: string;
  isActive: boolean;
}

const userSchema = new Schema<IUser>(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role:         {
      type: String,
      enum: ['owner', 'employee', 'franchisor', 'franchisee', 'client'],
      required: true,
    },
    unitId:   { type: Schema.Types.ObjectId, ref: 'Unit' },
    phone:    { type: String, required: true },
    avatar:   String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
