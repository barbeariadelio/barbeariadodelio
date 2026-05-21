import { Router } from 'express';
import { getSummary, listTransactions, createTransaction, updateTransaction, deleteTransaction, listRemunerations, registerPayment } from './finance.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';
import { validate } from '../../shared/utils/validate';
import { createTransactionSchema, updateTransactionSchema } from './finance.schema';

export const financeRoutes = Router();

financeRoutes.get('/summary', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), getSummary);
financeRoutes.get('/transactions', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listTransactions);
financeRoutes.post('/transactions', authenticate, requireRoles('owner', 'employee', 'cashier'), validate(createTransactionSchema), createTransaction);
financeRoutes.patch('/transactions/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), validate(updateTransactionSchema), updateTransaction);
financeRoutes.delete('/transactions/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), deleteTransaction);
financeRoutes.get('/remunerations', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listRemunerations);
financeRoutes.post('/payment', authenticate, requireRoles('owner', 'cashier'), registerPayment);
