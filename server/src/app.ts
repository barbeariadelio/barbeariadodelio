import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import rtracer from 'cls-rtracer';
import pinoHttp from 'pino-http';

import { connectDb } from './config/db';
import { env } from './config/env';
import { logger } from './shared/utils/logger';
import { errorHandler } from './shared/middlewares/errorHandler';

import { authRoutes } from './modules/auth/auth.routes';
import { unitRoutes } from './modules/units/unit.routes';
import { clientRoutes } from './modules/clients/client.routes';
import { serviceRoutes } from './modules/services/service.routes';
import { employeeRoutes } from './modules/employees/employee.routes';
import { appointmentRoutes } from './modules/appointments/appointment.routes';
import { financeRoutes } from './modules/finance/finance.routes';
import { franchiseRoutes } from './modules/franchise/franchise.routes';
import { productRoutes } from './modules/inventory/product.routes';
import { userRoutes } from './modules/auth/user.routes';
import { notificationRoutes } from './modules/notifications/notification.routes';
import { sseRoutes } from './modules/events/sse.routes';
import { uploadRoutes } from './modules/upload/upload.routes';

const app = express();

// --- Security & Utility Middlewares ---
app.use(helmet({
  contentSecurityPolicy: env.nodeEnv === 'development' ? false : undefined,
}));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // Prevent NoSQL Injection
app.use(hpp()); // Prevent Parameter Pollution

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Muitas requisições originadas deste IP, tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })); // Stricter for login
app.use('/api', limiter);

// --- Logging & Correlation ID ---
app.use(rtracer.expressMiddleware());
app.use(pinoHttp({
  logger,
  // Disable automatic request logging in development to keep terminal clean
  autoLogging: env.nodeEnv !== 'development',
  genReqId: (req) => (rtracer.id() as string) || req.id,
  customLogLevel: (res, err) => {
    if (res.statusCode && res.statusCode >= 500 || err) return 'error';
    if (res.statusCode && res.statusCode >= 400) return 'warn';
    return 'info';
  },
}));

// Serve static portal at root
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'portal.html'));
});

// --- Routes ---
app.use('/auth', authRoutes);
app.use('/units', unitRoutes);
app.use('/clients', clientRoutes);
app.use('/services', serviceRoutes);
app.use('/employees', employeeRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/finance', financeRoutes);
app.use('/franchise', franchiseRoutes);
app.use('/products', productRoutes);
app.use('/users', userRoutes);
app.use('/notifications', notificationRoutes);
app.use('/events', sseRoutes);
app.use('/upload', uploadRoutes);

app.get('/health', (_req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const status = mongoStatus === 'up' ? 'ok' : 'error';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: mongoStatus,
    },
  });
});

// --- SPA Mounting (production only) ---
function mountSpa(basePath: string, distPath: string): void {
  const indexPath = path.join(distPath, 'index.html');
  if (!fs.existsSync(indexPath)) return;

  app.use(basePath, express.static(distPath));
  app.get(basePath, (_req, res) => res.sendFile(indexPath));
  app.get(`${basePath}/*`, (_req, res) => res.sendFile(indexPath));
}

const adminDist = path.resolve(__dirname, '../../apps/admin/dist');
const franchiseDist = path.resolve(__dirname, '../../apps/franchise/dist');
const bookingDist = path.resolve(__dirname, '../../apps/booking/dist');

async function start() {
  await connectDb();

  if (env.nodeEnv === 'development') {
    const { createProxyMiddleware } = await import('http-proxy-middleware');

    const devProxy = (pathFilter: string, port: number) =>
      createProxyMiddleware({
        pathFilter,
        target: `http://localhost:${port}`,
        changeOrigin: true,
        on: {
          error: (_err, _req, res) => {
            const r = res as { headersSent?: boolean; writeHead: (s: number) => void; end: (b: string) => void };
            if (!r.headersSent) {
              r.writeHead(502);
              r.end(`Vite dev server na porta ${port} não está rodando. Execute: npm run dev`);
            }
          },
        },
      });

    app.use(devProxy('/admin', 5173));
    app.use(devProxy('/franchise-app', 5174));
    app.use(devProxy('/booking', 5175));
  } else {
    mountSpa('/admin', adminDist);
    mountSpa('/franchise-app', franchiseDist);
    mountSpa('/booking', bookingDist);
  }

  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

if (process.env.NODE_ENV === 'test') {
  app.use(errorHandler);
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(err => {
    logger.fatal({ err }, 'ERRO FATAL NO BOOT');
    process.exit(1);
  });
}

export default app;
