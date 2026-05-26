import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UserModel } from '../auth/auth.model';
import { sseService } from './sse.service';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).end(); return; }

  let payload: any;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    res.status(401).end();
    return;
  }

  if (payload?.persistentSession === true) {
    const user = await UserModel.findById(payload.id).select('tokenVersion isActive').lean();
    if (!user?.isActive || user.tokenVersion !== payload.tokenVersion) {
      res.status(401).end();
      return;
    }
  }

  const unitId = payload?.unitId as string | undefined;
  if (!unitId) { res.status(400).end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseService.subscribe(unitId, res);
  res.write(': connected\n\n');

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch { clearInterval(ping); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    sseService.unsubscribe(unitId, res);
  });
});

export const sseRoutes = router;
