import mongoose, { Schema, Document } from 'mongoose';

export interface IService extends Document {
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  unitId: mongoose.Types.ObjectId;
  isActive: boolean;
}

const serviceSchema = new Schema<IService>(
  {
    name:            { type: String, required: true, trim: true },
    description:     String,
    price:           { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1 },
    unitId:          { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const ServiceModel = mongoose.model<IService>('Service', serviceSchema);
