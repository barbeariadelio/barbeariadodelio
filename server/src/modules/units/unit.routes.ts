import { Router } from 'express';
import { listUnits, getUnit, createUnit, updateUnit } from './unit.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const unitRoutes = Router();

unitRoutes.get('/', authenticate, requireRoles('owner', 'franchisor', 'franchisee'), listUnits);
unitRoutes.get('/:id', authenticate, requireRoles('owner', 'franchisor', 'franchisee'), getUnit);
unitRoutes.post('/', authenticate, requireRoles('owner'), createUnit);
unitRoutes.patch('/:id', authenticate, requireRoles('owner'), updateUnit);
