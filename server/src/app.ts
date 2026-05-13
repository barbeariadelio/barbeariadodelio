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

const app = express();

// --- Security & Utility Middlewares ---
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10kb' })); // Limit body size
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

// --- SPA Mounting ---
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

mountSpa('/admin', adminDist);
mountSpa('/franchise-app', franchiseDist);
mountSpa('/booking', bookingDist);

app.use(errorHandler);

async function start() {
  await connectDb();
  
  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(err => {
    logger.fatal({ err }, 'ERRO FATAL NO BOOT');
    process.exit(1);
  });
}

export default app;
