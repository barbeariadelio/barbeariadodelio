import { Response, NextFunction } from 'express';
import { TaskService } from './task.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new TaskService();

export async function listTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const system = req.query.system as string;
    if (!system) { ok(res, []); return; }
    const tasks = await service.findBySystem(system);
    ok(res, tasks);
  } catch (e) {
    next(e);
  }
}

export async function createTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await service.create(req.body);
    created(res, task);
  } catch (e) {
    next(e);
  }
}

export async function updateTaskStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await service.updateStatus(req.params.id, req.body.status);
    ok(res, task);
  } catch (e) {
    next(e);
  }
}

export async function deleteTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id);
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
}
