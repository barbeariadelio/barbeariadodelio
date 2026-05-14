import mongoose, { Schema, Document } from 'mongoose';

export interface IClientPackageSubscription {
  packageId: mongoose.Types.ObjectId;
  startDate: Date;
  active: boolean;
  expiresAt?: Date;
  itemLimits?: {
    serviceId: mongoose.Types.ObjectId;
    quantity: number;   // total sessions allowed
    used: number;       // sessions consumed (incremented on billing)
  }[];
}

export interface IClient extends Document {
  name: string;
  email?: string;
  phone?: string;
  userId?: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  birthdate?: string;
  notes?: string;
  packages?: IClientPackageSubscription[];
}

const clientSchema = new Schema<IClient>(
  {
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: false, lowercase: true },
    phone:     { type: String, required: false },
    userId:    { type: Schema.Types.ObjectId, ref: 'User' },
    unitId:    { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    birthdate: String,
    notes:     String,
    packages: [
      {
        packageId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
        startDate: { type: Date, required: true, default: Date.now },
        active:    { type: Boolean, default: true },
        expiresAt: { type: Date },
        itemLimits: [
          {
            serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
            quantity:  { type: Number },
            used:      { type: Number, default: 0 },
          }
        ]
      }
    ]
  },
  { timestamps: true },
);

clientSchema.index({ unitId: 1, phone: 1 });

export const ClientModel = mongoose.model<IClient>('Client', clientSchema);
