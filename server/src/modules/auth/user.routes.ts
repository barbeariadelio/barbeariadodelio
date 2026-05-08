import { Router } from 'express';
import * as controller from './user.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/',    controller.listUsers);
router.post('/register', controller.registerUser);
router.put('/:id', controller.updateAccount);

export { router as userRoutes };
