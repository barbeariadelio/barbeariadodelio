import { Router } from 'express';
import { getFranchise, getFranchiseUnits, addUnit, createFranchise, updateFranchise } from './franchise.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';

export const franchiseRoutes = Router();

franchiseRoutes.get('/', authenticate, requireRoles('franchisor', 'franchisee'), getFranchise);
franchiseRoutes.get('/:id/units', authenticate, requireRoles('franchisor', 'franchisee'), getFranchiseUnits);
franchiseRoutes.post('/', authenticate, requireRoles('owner', 'franchisor'), createFranchise);
franchiseRoutes.patch('/:id', authenticate, requireRoles('franchisor'), updateFranchise);
franchiseRoutes.post('/:id/units', authenticate, requireRoles('franchisor'), addUnit);
