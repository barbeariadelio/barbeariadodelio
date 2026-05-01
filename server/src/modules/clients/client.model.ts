import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  name: string;
  email: string;
  phone: string;
  userId?: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  birthdate?: string;
  notes?: string;
}

const clientSchema = new Schema<IClient>(
  {
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, lowercase: true },
    phone:     { type: String, required: true },
    userId:    { type: Schema.Types.ObjectId, ref: 'User' },
    unitId:    { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    birthdate: String,
    notes:     String,
  },
  { timestamps: true },
);

export const ClientModel = mongoose.model<IClient>('Client', clientSchema);
