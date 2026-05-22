import { Router } from 'express';
import { listPublicEmployees, getPublicAvatar, listEmployees, getEmployee, createEmployee, updateEmployee, deactivateEmployee, hardDeleteEmployee } from './employee.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const employeeRoutes = Router();

employeeRoutes.get('/public', listPublicEmployees);
employeeRoutes.get('/public/:id/avatar', getPublicAvatar);
employeeRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listEmployees);
employeeRoutes.get('/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), getEmployee);
employeeRoutes.post('/', authenticate, requireRoles('owner', 'cashier'), createEmployee);
employeeRoutes.patch('/:id', authenticate, requireRoles('owner', 'cashier'), updateEmployee);
employeeRoutes.delete('/:id/permanent', authenticate, requireRoles('owner'), hardDeleteEmployee);
employeeRoutes.delete('/:id', authenticate, requireRoles('owner'), deactivateEmployee);
