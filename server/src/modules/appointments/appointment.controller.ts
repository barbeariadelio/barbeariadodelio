import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from './appointment.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { notificationService } from '../notifications/notification.service';
import { ClientModel } from '../clients/client.model';
import { AppointmentModel } from './appointment.model';
import { AppError } from '../../shared/errors/AppError';

const service = new AppointmentService();

export async function listAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unitId = req.user!.role === 'owner'
      ? ((req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    if (!unitId) { ok(res, []); return; }
    
    const { date, start, end } = req.query as Record<string, string | undefined>;
    const { page, limit, skip } = (await import('../../shared/utils/pagination')).parsePagination(req.query as any);
    
    const appointments = await service.findByUnitAndDate(unitId, date, start, end, { skip, limit });
    ok(res, appointments);
  } catch (e) { next(e); }
}

export async function getAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const appt = await service.findById(id);

    // Security check: if client, must be the owner
    if (req.user!.role === 'client') {
      const clients = await ClientModel.find({ userId: req.user!.id });
      const clientIds = clients.map(c => c._id.toString());
      
      if (!clientIds.includes(appt.clientId?.toString() || '')) {
        throw new AppError('Access denied', 403);
      }
    }

    ok(res, appt);
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
    
    // Create notification
    const fullAppt = await service.findById(appt._id.toString());
    const client = await ClientModel.findById(fullAppt.clientId);
    await notificationService.create({
      unitId: fullAppt.unitId,
      type: 'new',
      title: 'Novo Agendamento',
      message: `${client?.name || 'Um cliente'} realizou um novo agendamento.`,
      appointmentId: fullAppt._id as any
    });

    created(res, appt);
  } catch (e) { next(e); }
}

export async function guestBookAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guestName, guestPhone, unitId, serviceId, employeeId, date, startTime, price, notes } = req.body;
    if (!guestName || !guestPhone || !unitId || !serviceId || !employeeId || !date || !startTime) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }
    const result = await service.guestBook({ 
      guestName, 
      guestPhone, 
      unitId, 
      serviceId, 
      employeeId, 
      date, 
      startTime, 
      price: Number(price),
      notes
    });
    
    // Create notification for new booking
    await notificationService.create({
      unitId: result.appointment.unitId as any,
      type: 'new',
      title: 'Novo Agendamento',
      message: `${guestName} agendou um novo serviço.`,
      appointmentId: result.appointment._id as any
    });

    created(res, result);
  } catch (e) { next(e); }
}

export async function updateAppointmentStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { status, price, paymentMethod } = req.body;

    // If role is client, verify ownership
    if (req.user!.role === 'client') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) throw new AppError('Appointment not found', 404);
      
      const clients = await ClientModel.find({ userId: req.user!.id });
      const clientIds = clients.map(c => c._id.toString());
      if (!clientIds.includes(appt.clientId?.toString() || '')) {
        throw new AppError('You can only update your own appointments', 403);
      }
    }

    const appt = await service.updateStatus(id, status, { price, paymentMethod });

    if (status === 'cancelled') {
      const fullAppt = await service.findById(id);
      const client = await ClientModel.findById(fullAppt.clientId);
      await notificationService.create({
        unitId: fullAppt.unitId,
        type: 'cancellation',
        title: 'Agendamento Cancelado',
        message: `${client?.name || 'Um cliente'} cancelou o serviço ${(fullAppt.serviceId as any)?.name || 'agendado'}.`,
        appointmentId: fullAppt._id as any
      });
    }

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

export async function updateAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    
    if (req.user!.role === 'client') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) throw new AppError('Appointment not found', 404);
      
      const clients = await ClientModel.find({ userId: req.user!.id });
      const clientIds = clients.map(c => c._id.toString());
      
      if (!clientIds.includes(appt.clientId?.toString() || '')) {
        throw new AppError('You can only update your own appointments', 403);
      }
    }

    const appt = await service.update(id, req.body);

    // Create notification for edit
    const fullAppt = await service.findById(id);
    const client = await ClientModel.findById(fullAppt.clientId);
    await notificationService.create({
      unitId: fullAppt.unitId,
      type: 'edit',
      title: 'Agendamento Editado',
      message: `${client?.name || 'Um cliente'} alterou detalhes do agendamento de ${(fullAppt.serviceId as any)?.name || 'serviço'}.`,
      appointmentId: fullAppt._id as any
    });

    ok(res, appt);
  } catch (e) { next(e); }
}

export async function getMyAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointments = await service.findByUserId(req.user!.id);
    ok(res, appointments);
  } catch (e) { next(e); }
}
