import { Router } from 'express';
import * as controller from './user.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    controller.listUsers);
router.put('/:id', controller.updateUserRole);

export { router as userRoutes };
