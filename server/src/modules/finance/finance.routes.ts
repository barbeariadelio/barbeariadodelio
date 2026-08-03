import { Router } from 'express';
import { getSummary, listTransactions, createTransaction, registerProductSale, updateTransaction, deleteTransaction, listRemunerations, registerPayment, getRemunerationsSummary, settleVoucher } from './finance.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';
import { validate } from '../../shared/utils/validate';
import { createTransactionSchema, registerProductSaleSchema, updateTransactionSchema } from './finance.schema';

export const financeRoutes = Router();

financeRoutes.get('/summary', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), getSummary);
financeRoutes.get('/transactions', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), listTransactions);
financeRoutes.post('/transactions', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), validate(createTransactionSchema), createTransaction);
financeRoutes.post('/sales', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), validate(registerProductSaleSchema), registerProductSale);
financeRoutes.patch('/transactions/:id', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), validate(updateTransactionSchema), updateTransaction);
financeRoutes.patch('/transactions/:id/settle-voucher', authenticate, requireRoles('owner', 'cashier'), settleVoucher);
financeRoutes.delete('/transactions/:id', authenticate, requireRoles('owner', 'cashier'), requireSameUnit(), deleteTransaction);
financeRoutes.get('/remunerations/summary', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), getRemunerationsSummary);
financeRoutes.get('/remunerations', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listRemunerations);
financeRoutes.post('/payment', authenticate, requireRoles('owner', 'cashier'), registerPayment);
