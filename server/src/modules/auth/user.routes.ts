import { Router } from 'express';
import * as controller from './user.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';
import { validate } from '../../shared/utils/validate';
import { createUserSchema, updateUserSchema } from './user.schema';

const router = Router();

router.use(authenticate);

router.get('/',    requireRoles('owner', 'cashier'), controller.listUsers);
router.post('/register', requireRoles('owner'), validate(createUserSchema), controller.registerUser);
router.put('/:id', requireRoles('owner', 'cashier'), validate(updateUserSchema), controller.updateAccount);
router.delete('/:id', requireRoles('owner'), controller.deleteUser);

export { router as userRoutes };
