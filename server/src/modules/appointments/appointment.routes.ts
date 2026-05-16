import { Router } from 'express';
import {
  listAppointments,
  getSlots,
  getAppointment,
  createAppointment,
  guestBookAppointment,
  updateAppointmentStatus,
  updateAppointment,
  deleteAppointment,
  getClientAppointments,
  getMyAppointments,
} from './appointment.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';
import { validate } from '../../shared/utils/validate';
import { createAppointmentSchema, guestBookSchema } from './appointment.schema';

export const appointmentRoutes = Router();

appointmentRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'cashier'), requireSameUnit(), listAppointments);
appointmentRoutes.get('/slots', getSlots);
appointmentRoutes.get('/my', authenticate, getMyAppointments);
appointmentRoutes.get('/client/:clientId', authenticate, requireRoles('owner', 'employee', 'client', 'cashier'), getClientAppointments);
appointmentRoutes.get('/:id', authenticate, getAppointment);
appointmentRoutes.post('/', authenticate, validate(createAppointmentSchema), createAppointment);
appointmentRoutes.post('/guest', validate(guestBookSchema), guestBookAppointment);
appointmentRoutes.patch('/:id/status', authenticate, requireRoles('owner', 'employee', 'client', 'cashier'), updateAppointmentStatus);
appointmentRoutes.patch('/:id', authenticate, requireRoles('owner', 'employee', 'client', 'cashier'), updateAppointment);
appointmentRoutes.delete('/:id', authenticate, requireRoles('owner', 'employee', 'cashier'), deleteAppointment);
