import pino from 'pino';
import { env } from '../../config/env';

export const logger = pino({
  level: env.nodeEnv === 'development' ? 'info' : 'info',
  transport: env.nodeEnv === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    env: env.nodeEnv,
    service: 'barber-server',
  },
});
