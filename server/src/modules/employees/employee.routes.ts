import { Router } from 'express';
import { listPublicEmployees, listEmployees, getEmployee, createEmployee, updateEmployee, deactivateEmployee } from './employee.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const employeeRoutes = Router();

employeeRoutes.get('/public', listPublicEmployees);
employeeRoutes.get('/', authenticate, requireRoles('owner', 'franchisee', 'franchisor', 'employee', 'cashier'), requireSameUnit(), listEmployees);
employeeRoutes.get('/:id', authenticate, requireRoles('owner', 'franchisee', 'franchisor', 'employee', 'cashier'), getEmployee);
employeeRoutes.post('/', authenticate, requireRoles('owner', 'franchisee', 'cashier'), createEmployee);
employeeRoutes.patch('/:id', authenticate, requireRoles('owner', 'franchisee', 'cashier'), updateEmployee);
employeeRoutes.delete('/:id', authenticate, requireRoles('owner'), deactivateEmployee);
