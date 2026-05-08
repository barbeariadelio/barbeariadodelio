import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from './appointment.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { ClientModel } from '../clients/client.model';
import { AppError } from '../../shared/errors/AppError';

const service = new AppointmentService();

export async function listAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.user!.role === 'owner'
      ? ((req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    const { date, start, end } = req.query as Record<string, string | undefined>;
    const appointments = await service.findByUnitAndDate(unitId, date, start, end);
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
    const data = req.body;

    // If unitId not in body, use the authenticated user's unitId
    if (!data.unitId && req.user?.unitId) {
      data.unitId = req.user.unitId;
    }

    // For blocked slots, no client lookup needed
    if (data.status !== 'blocked' && !data.clientId && req.user) {
      let client = await ClientModel.findOne({ userId: req.user.id, unitId: data.unitId });
      if (!client) {
        client = await ClientModel.findOne({ userId: req.user.id });
      }
      if (client) {
        data.clientId = client._id;
      } else {
        throw new AppError('Client record not found for this user', 404);
      }
    }
    const appt = await service.create(data);
    created(res, appt);
  } catch (e) { next(e); }
}

export async function guestBookAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guestName, guestPhone, unitId, serviceId, employeeId, date, startTime, price } = req.body;
    if (!guestName || !guestPhone || !unitId || !serviceId || !employeeId || !date || !startTime) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }
    const result = await service.guestBook({ guestName, guestPhone, unitId, serviceId, employeeId, date, startTime, price: Number(price) });
    created(res, result);
  } catch (e) { next(e); }
}

export async function updateAppointmentStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appt = await service.updateStatus(req.params.id, req.body.status);
    ok(res, appt);
  } catch (e) { next(e); }
}

export async function deleteAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
}

export async function getClientAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = req.params.clientId;
    const appointments = await service.findByClient(clientId);
    ok(res, appointments);
  } catch (e) { next(e); }
}

export async function getMyAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointments = await service.findByUserId(req.user!.id);
    ok(res, appointments);
  } catch (e) { next(e); }
}
