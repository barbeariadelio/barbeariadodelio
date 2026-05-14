import pino from 'pino';
import { env } from '../../config/env';

let hasPinoPretty = false;
try {
  require.resolve('pino-pretty');
  hasPinoPretty = true;
} catch (e) {
  // pino-pretty not installed
}

export const logger = pino({
  level: env.nodeEnv === 'development' ? 'info' : 'info',
  transport: (env.nodeEnv === 'development' && hasPinoPretty)
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    env: env.nodeEnv,
    service: 'barber-server',
  },
});
