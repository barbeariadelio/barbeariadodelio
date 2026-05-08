import { Router } from 'express';
import { getSummary, listTransactions, createTransaction, updateTransaction, deleteTransaction } from './finance.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const financeRoutes = Router();

financeRoutes.get('/summary', authenticate, requireRoles('owner', 'franchisor', 'franchisee', 'employee'), getSummary);
financeRoutes.get('/transactions', authenticate, requireRoles('owner', 'franchisee', 'franchisor', 'employee'), requireSameUnit(), listTransactions);
financeRoutes.post('/transactions', authenticate, requireRoles('owner', 'employee'), createTransaction);
financeRoutes.patch('/transactions/:id', authenticate, requireRoles('owner', 'employee'), updateTransaction);
financeRoutes.delete('/transactions/:id', authenticate, requireRoles('owner', 'employee'), deleteTransaction);
