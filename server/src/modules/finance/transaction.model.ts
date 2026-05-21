import mongoose, { Schema, Document } from 'mongoose';
import type { TransactionType, TransactionCategory } from '@barber/types';

export interface ITransaction extends Document {
  unitId: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId;
  employeeId?: mongoose.Types.ObjectId;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  date: string;
  paymentMethod?: 'money' | 'debit' | 'credit' | 'pix' | 'package' | 'other';
  createdBy: mongoose.Types.ObjectId;
  isPaid?: boolean;
}

const transactionSchema = new Schema<ITransaction>(
  {
    unitId:        { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    employeeId:    { type: Schema.Types.ObjectId, ref: 'User' },
    type:     { type: String, enum: ['income', 'expense', 'royalty', 'commission'], required: true },
    category: { type: String, enum: ['service', 'product', 'salary', 'rent', 'voucher', 'commission', 'package_use', 'package_sale', 'sale', 'other'], required: true },
    amount:      { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    date:        { type: String, required: true },
    paymentMethod: { type: String, enum: ['money', 'debit', 'credit', 'pix', 'package', 'other'] },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isPaid:      { type: Boolean, default: false },
  },
  { timestamps: true },
);

transactionSchema.index({ unitId: 1, date: 1 });

export const TransactionModel = mongoose.model<ITransaction>('Transaction', transactionSchema);
