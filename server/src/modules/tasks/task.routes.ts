import { Router } from 'express';
import { listTasks, createTask, updateTaskStatus, deleteTask } from './task.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

export const taskRoutes = Router();

taskRoutes.get('/',             authenticate, listTasks);
taskRoutes.post('/',            authenticate, createTask);
taskRoutes.patch('/:id/status', authenticate, updateTaskStatus);
taskRoutes.delete('/:id',       authenticate, deleteTask);
