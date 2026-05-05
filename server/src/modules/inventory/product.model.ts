import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description?: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  minStock: number;
  unitId: mongoose.Types.ObjectId;
  category?: string;
  isActive: boolean;
}

const productSchema = new Schema<IProduct>(
  {
    name:          { type: String, required: true, trim: true },
    description:   String,
    price:         { type: Number, required: true, min: 0 },
    costPrice:     { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, required: true, default: 0 },
    minStock:      { type: Number, required: true, default: 5 },
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    category:      String,
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ProductModel = mongoose.model<IProduct>('Product', productSchema);
