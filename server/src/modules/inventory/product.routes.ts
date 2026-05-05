import { Router } from 'express';
import * as controller from './product.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    controller.listProducts);
router.post('/',   controller.createProduct);
router.put('/:id', controller.updateProduct);
router.delete('/:id', controller.deleteProduct);

export { router as productRoutes };
