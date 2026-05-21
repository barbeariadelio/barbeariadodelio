import { Request, Response, NextFunction } from 'express';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import path from 'path';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from '../../shared/utils/r2';
import { logger } from '../../shared/utils/logger';

export async function uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'Nenhum arquivo enviado.' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const key = `avatars/${randomBytes(16).toString('hex')}${ext}`;

    logger.info({ bucket: R2_BUCKET, key, size: file.size }, 'Uploading to R2');

    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    const url = `${R2_PUBLIC_URL}/${key}`;
    logger.info({ url }, 'R2 upload success');
    res.json({ url });
  } catch (e) {
    next(e);
  }
}
