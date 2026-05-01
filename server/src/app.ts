import express from 'express';
import cors from 'cors';
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

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/units', unitRoutes);
app.use('/clients', clientRoutes);
app.use('/services', serviceRoutes);
app.use('/employees', employeeRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/finance', financeRoutes);
app.use('/franchise', franchiseRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(console.error);
}

export default app;
