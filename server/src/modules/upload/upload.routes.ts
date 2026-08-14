import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles } from '../../shared/middlewares/rbac.middleware';
import { uploadAvatar, uploadServiceImage } from './upload.controller';
import { AppError } from '../../shared/errors/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new AppError('Apenas imagens são permitidas.', 400, 'UPLOAD_INVALID_FILE'));
  },
});

export const uploadRoutes = Router();
// Both are only ever called from the employee/service management forms
// (owner or cashier managing someone else's record) — never by an employee
// or client uploading their own picture.
uploadRoutes.post('/avatar', authenticate, requireRoles('owner', 'cashier'), upload.single('file'), uploadAvatar);
uploadRoutes.post('/service-image', authenticate, requireRoles('owner', 'cashier'), upload.single('file'), uploadServiceImage);
