import { Router } from 'express';
import { listPublicUnits, getPublicUnit, listUnits, getUnit, createUnit, updateUnit } from './unit.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const unitRoutes = Router();

unitRoutes.get('/public', listPublicUnits);
unitRoutes.get('/public/:id', getPublicUnit);
unitRoutes.get('/', authenticate, requireRoles('owner', 'franchisor', 'franchisee'), listUnits);
unitRoutes.get('/:id', authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'employee'), getUnit);
unitRoutes.post('/', authenticate, requireRoles('owner'), createUnit);
unitRoutes.patch('/:id', authenticate, requireRoles('owner'), updateUnit);
