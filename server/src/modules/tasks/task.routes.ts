import { Router } from 'express';
import { listTasks, createTask, updateTaskStatus, deleteTask } from './task.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const taskRoutes = Router();

taskRoutes.get('/',             authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'employee'), listTasks);
taskRoutes.post('/',            authenticate, requireRoles('owner', 'franchisor', 'franchisee'), createTask);
taskRoutes.patch('/:id/status', authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'employee'), updateTaskStatus);
taskRoutes.delete('/:id',       authenticate, requireRoles('owner', 'franchisor', 'franchisee'), deleteTask);
