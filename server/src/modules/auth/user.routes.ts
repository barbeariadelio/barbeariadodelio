import { Router } from 'express';
import * as controller from './user.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';
import { validate } from '../../shared/utils/validate';
import { createUserSchema, updateUserSchema } from './user.schema';

const router = Router();

router.use(authenticate);

router.get('/',    requireRoles('owner', 'franchisor', 'admin', 'franchisee', 'cashier'), controller.listUsers);
router.post('/register', requireRoles('owner', 'franchisor', 'admin', 'franchisee', 'cashier'), validate(createUserSchema), controller.registerUser);
router.put('/:id', requireRoles('owner', 'franchisor', 'admin', 'franchisee', 'cashier'), validate(updateUserSchema), controller.updateAccount);

export { router as userRoutes };
