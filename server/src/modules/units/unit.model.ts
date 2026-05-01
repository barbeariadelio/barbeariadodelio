import mongoose, { Schema, Document } from 'mongoose';

export interface IUnit extends Document {
  name: string;
  address: string;
  phone: string;
  cnpj?: string;
  ownerId: mongoose.Types.ObjectId;
  franchiseId?: mongoose.Types.ObjectId;
  isActive: boolean;
}

const unitSchema = new Schema<IUnit>(
  {
    name:        { type: String, required: true, trim: true },
    address:     { type: String, required: true },
    phone:       { type: String, required: true },
    cnpj:        String,
    ownerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    franchiseId: { type: Schema.Types.ObjectId, ref: 'Franchise' },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const UnitModel = mongoose.model<IUnit>('Unit', unitSchema);
