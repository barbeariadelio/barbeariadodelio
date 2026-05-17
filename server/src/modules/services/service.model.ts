import mongoose, { Schema, Document } from 'mongoose';

export interface IPackageItem {
  serviceId: mongoose.Types.ObjectId;
  quantity: number;
  unitPrice?: number;
}

export interface IService extends Document {
  name: string;
  description?: string;
  price: number;
  durationMinutes: number; // For packages, could be the sum of items or 0
  unitId: mongoose.Types.ObjectId;
  image?: string;
  isActive: boolean;
  type: 'single' | 'package';
  showPrice: boolean;
  showPricePrefix: boolean;
  packageValidity?: {
    type: 'none' | 'days' | 'weeks' | 'months' | 'years';
    value?: number;
  };
  packageItems?: IPackageItem[];
}

const serviceSchema = new Schema<IService>(
  {
    name:            { type: String, required: true, trim: true },
    description:     String,
    price:           { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 0 }, // Changed min to 0 to support packages that don't have a specific duration upfront
    unitId:          { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    image:            String,
    isActive:         { type: Boolean, default: true },
    type:             { type: String, enum: ['single', 'package'], default: 'single' },
    showPrice:        { type: Boolean, default: true },
    showPricePrefix:  { type: Boolean, default: true },
    packageValidity: {
      type: { type: String, enum: ['none', 'days', 'weeks', 'months', 'years'] },
      value: Number,
    },
    packageItems: [
      {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
        quantity:  { type: Number, min: 1 },
        unitPrice: Number,
      }
    ],
  },
  { timestamps: true },
);

serviceSchema.index({ unitId: 1, name: 1 }, { unique: true });

export const ServiceModel = mongoose.model<IService>('Service', serviceSchema);
