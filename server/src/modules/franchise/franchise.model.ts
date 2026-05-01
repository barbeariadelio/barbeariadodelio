import mongoose, { Schema, Document } from 'mongoose';

export interface IFranchise extends Document {
  name: string;
  franchisors: mongoose.Types.ObjectId[];
  royaltyPercent: number;
  units: mongoose.Types.ObjectId[];
}

const franchiseSchema = new Schema<IFranchise>(
  {
    name:           { type: String, required: true },
    franchisors:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
    royaltyPercent: { type: Number, required: true, min: 0, max: 100 },
    units:          [{ type: Schema.Types.ObjectId, ref: 'Unit' }],
  },
  { timestamps: true },
);

export const FranchiseModel = mongoose.model<IFranchise>('Franchise', franchiseSchema);
