import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from './appointment.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new AppointmentService();

export async function listAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = (req.query.unitId as string) || req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const date = req.query.date as string | undefined;
    const appointments = await service.findByUnitAndDate(unitId, date);
    ok(res, appointments);
  } catch (e) { next(e); }
}

export async function getSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { unitId, employeeId, date, durationMinutes } = req.query as Record<string, string>;
    if (!unitId || !employeeId || !date) {
      ok(res, []);
      return;
    }
    const duration = Number(durationMinutes) || 30;
    const slots = await service.getAvailableSlots(unitId, employeeId, date, duration);
    ok(res, slots);
  } catch (e) { next(e); }
}

export async function createAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appt = await service.create(req.body);
    created(res, appt);
  } catch (e) { next(e); }
}

export async function updateAppointmentStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appt = await service.updateStatus(req.params.id, req.body.status);
    ok(res, appt);
  } catch (e) { next(e); }
}

export async function getClientAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = req.params.clientId;
    const appointments = await service.findByClient(clientId);
    ok(res, appointments);
  } catch (e) { next(e); }
}
