import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { uploadAvatar, uploadServiceImage } from './upload.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas.'));
  },
});

export const uploadRoutes = Router();
uploadRoutes.post('/avatar', authenticate, upload.single('file'), uploadAvatar);
uploadRoutes.post('/service-image', authenticate, upload.single('file'), uploadServiceImage);
