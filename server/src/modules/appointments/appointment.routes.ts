import { Router } from 'express';
import {
  listAppointments,
  getSlots,
  createAppointment,
  updateAppointmentStatus,
  getClientAppointments,
} from './appointment.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import { requireRoles, requireSameUnit } from '../../shared/middlewares/rbac.middleware';

export const appointmentRoutes = Router();

appointmentRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'franchisee', 'franchisor'), requireSameUnit(), listAppointments);
appointmentRoutes.get('/slots', getSlots); // public — booking portal
appointmentRoutes.get('/client/:clientId', authenticate, requireRoles('owner', 'employee', 'client'), getClientAppointments);
appointmentRoutes.post('/', authenticate, createAppointment);
appointmentRoutes.patch('/:id/status', authenticate, requireRoles('owner', 'employee', 'franchisee'), updateAppointmentStatus);
