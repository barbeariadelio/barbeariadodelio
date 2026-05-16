import { Router } from 'express';
import { getFranchise, getFranchiseUnits, addUnit, createFranchise, updateFranchise } from './franchise.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const franchiseRoutes = Router();

franchiseRoutes.get('/', authenticate, requireRoles('owner'), getFranchise);
franchiseRoutes.get('/:id/units', authenticate, requireRoles('owner'), getFranchiseUnits);
franchiseRoutes.post('/', authenticate, requireRoles('owner'), createFranchise);
franchiseRoutes.patch('/:id', authenticate, requireRoles('owner'), updateFranchise);
franchiseRoutes.post('/:id/units', authenticate, requireRoles('owner'), addUnit);
