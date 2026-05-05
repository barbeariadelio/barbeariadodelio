import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { connectDb } from './config/db';
import { env } from './config/env';
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
import { taskRoutes } from './modules/tasks/task.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Serve static portal at root
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'portal.html'));
});

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
app.use('/tasks', taskRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const apiPrefixes = [
  '/appointments',
  '/auth',
  '/clients',
  '/employees',
  '/finance',
  '/franchise',
  '/health',
  '/products',
  '/services',
  '/tasks',
  '/units',
  '/users',
];

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
  console.log('Running one-time DB fix...');
  if (mongoose.connection.db) {
    const result = await mongoose.connection.db.collection('appointments').updateMany(
      { status: 'pending' },
      { $set: { status: 'confirmed' } }
    );
    console.log(`Updated ${result.modifiedCount} appointments to confirmed`);
    
    const count = await mongoose.connection.db.collection('appointments').countDocuments({ unitId: { $exists: false } });
    console.log(`Appointments missing unitId: ${count}`);
  }

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(console.error);
}

export default app;
