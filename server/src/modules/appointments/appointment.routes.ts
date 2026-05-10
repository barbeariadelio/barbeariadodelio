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

export const appointmentRoutes = Router();

appointmentRoutes.get('/', authenticate, requireRoles('owner', 'employee', 'franchisee', 'franchisor'), requireSameUnit(), listAppointments);
appointmentRoutes.get('/slots', getSlots);
appointmentRoutes.get('/my', authenticate, getMyAppointments);
appointmentRoutes.get('/client/:clientId', authenticate, requireRoles('owner', 'employee', 'client'), getClientAppointments);
appointmentRoutes.get('/:id', authenticate, getAppointment);
appointmentRoutes.post('/', authenticate, createAppointment);
appointmentRoutes.post('/guest', guestBookAppointment);
appointmentRoutes.patch('/:id/status', authenticate, requireRoles('owner', 'employee', 'franchisee', 'client'), updateAppointmentStatus);
appointmentRoutes.patch('/:id', authenticate, requireRoles('owner', 'employee', 'franchisee', 'client'), updateAppointment);
appointmentRoutes.delete('/:id', authenticate, requireRoles('owner', 'employee', 'franchisee'), deleteAppointment);
