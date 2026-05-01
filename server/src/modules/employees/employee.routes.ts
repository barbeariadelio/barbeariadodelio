import { Router } from 'express';
import { listEmployees, getEmployee, createEmployee, updateEmployee, deactivateEmployee } from './employee.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const employeeRoutes = Router();

employeeRoutes.get('/', authenticate, requireRoles('owner', 'franchisee', 'franchisor'), requireSameUnit(), listEmployees);
employeeRoutes.get('/:id', authenticate, requireRoles('owner', 'franchisee', 'franchisor'), getEmployee);
employeeRoutes.post('/', authenticate, requireRoles('owner', 'franchisee'), createEmployee);
employeeRoutes.patch('/:id', authenticate, requireRoles('owner', 'franchisee'), updateEmployee);
employeeRoutes.delete('/:id', authenticate, requireRoles('owner'), deactivateEmployee);
