import mongoose, { Schema, Document } from 'mongoose';
import type { TransactionType, TransactionCategory } from '@barber/types';

export interface ITransaction extends Document {
  unitId: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  date: string;
  createdBy: mongoose.Types.ObjectId;
}

const transactionSchema = new Schema<ITransaction>(
  {
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    type:     { type: String, enum: ['income', 'expense', 'royalty'], required: true },
    category: { type: String, enum: ['service', 'product', 'salary', 'rent', 'other'], required: true },
    amount:      { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    date:        { type: String, required: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const TransactionModel = mongoose.model<ITransaction>('Transaction', transactionSchema);
