import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description?: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  system: 'admin' | 'franchise';
}

const taskSchema = new Schema<ITask>(
  {
    title:       { type: String, required: true },
    description: String,
    status:      { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
    priority:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate:     String,
    system:      { type: String, enum: ['admin', 'franchise'], required: true },
  },
  { timestamps: true },
);

export const TaskModel = mongoose.model<ITask>('Task', taskSchema);
