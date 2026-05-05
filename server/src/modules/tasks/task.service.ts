import { TaskModel, ITask } from './task.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class TaskService {
  async findBySystem(system: string): Promise<ITask[]> {
    return TaskModel.find({ system }).sort({ createdAt: -1 });
  }

  async create(data: Partial<ITask> & { title: string; system: string }): Promise<ITask> {
    return TaskModel.create(data);
  }

  async updateStatus(id: string, status: string): Promise<ITask> {
    const task = await TaskModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!task) throw new NotFoundError('Task');
    return task;
  }

  async delete(id: string): Promise<void> {
    const task = await TaskModel.findByIdAndDelete(id);
    if (!task) throw new NotFoundError('Task');
  }
}
