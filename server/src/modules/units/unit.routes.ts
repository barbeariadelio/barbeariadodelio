import { Router } from 'express';
import { listPublicUnits, getPublicUnit, listUnits, getUnit, createUnit, updateUnit } from './unit.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const unitRoutes = Router();

unitRoutes.get('/public', listPublicUnits);
unitRoutes.get('/public/:id', getPublicUnit);
unitRoutes.get('/', authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'cashier'), listUnits);
unitRoutes.get('/:unitId', authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'employee', 'cashier'), requireSameUnit(), getUnit);
unitRoutes.post('/', authenticate, requireRoles('owner'), createUnit);
unitRoutes.patch('/:unitId', authenticate, requireRoles('owner'), requireSameUnit(), updateUnit);
