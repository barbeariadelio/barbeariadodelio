import { Router } from 'express';
import * as controller from './product.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), controller.listProducts);
router.post('/',   requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), controller.createProduct);
router.put('/:id', requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), controller.updateProduct);
router.delete('/:id', requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), controller.deleteProduct);

export { router as productRoutes };
