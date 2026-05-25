import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from './appointment.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';
import { notificationService } from '../notifications/notification.service';
import { ClientModel } from '../clients/client.model';
import { AppointmentModel } from './appointment.model';
import { UserModel } from '../auth/auth.model';
import { AppError } from '../../shared/errors/AppError';
import { sseService } from '../events/sse.service';

const service = new AppointmentService();

export async function listAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, id: userId } = req.user!;
    const isSuperUser = role === 'owner';
    const unitId = isSuperUser
      ? ((req.query.unitId as string) || req.user!.unitId)
      : req.user!.unitId;
    if (!unitId) { ok(res, []); return; }

    const { date, start, end, employeeId: queryEmployeeId } = req.query as Record<string, string | undefined>;
    const { page, limit, skip } = (await import('../../shared/utils/pagination')).parsePagination(req.query as any);

    // Employees only see their own appointments; owners/cashiers can filter by a specific employee via ?employeeId=
    const employeeFilter = role === 'employee' ? userId : queryEmployeeId;

    const appointments = await service.findByUnitAndDate(unitId, date, start, end, { skip, limit }, employeeFilter);
    ok(res, appointments);
  } catch (e) { next(e); }
}

export async function getAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const appt = await service.findById(id);

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner';
    
    if (!isOwnerOrFranchisor) {
      // If client, must be the owner of the appointment
      if (req.user!.role === 'client') {
        const clients = await ClientModel.find({ userId: req.user!.id });
        const clientIds = clients.map(c => c._id.toString());
        if (!clientIds.includes(appt.clientId?.toString() || '')) {
          throw new AppError('Access denied', 403);
        }
      } else {
        // If employee/cashier, must belong to the same unit
        if (appt.unitId?.toString() !== req.user!.unitId?.toString()) {
          throw new AppError('Access denied to this unit', 403);
        }
      }
    }

    ok(res, appt);
  } catch (e) { next(e); }
}

export async function getSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { unitId, employeeId, date, durationMinutes, source } = req.query as Record<string, string>;
    if (!unitId || !employeeId || !date) {
      ok(res, []);
      return;
    }
    const duration = Number(durationMinutes) || 30;
    const bufferMins = source === 'guest' ? 30 : 0;
    const slots = await service.getAvailableSlots(unitId, employeeId, date, duration, bufferMins);
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

    // Unit isolation check.
    // Self-booking (no clientId supplied): any authenticated user may book at any unit —
    //   the controller will create a client record in the target unit automatically.
    // Staff-managed booking (clientId explicitly supplied): employee/franchisee/cashier
    //   may only manage appointments that belong to their own unit.
    const isSelfBooking = !data.clientId;
    const isRestrictedStaff = ['employee', 'cashier'].includes(req.user!.role);
    if (!isSelfBooking && isRestrictedStaff && data.unitId !== req.user!.unitId?.toString()) {
      throw new AppError('Cannot create appointment for another unit', 403);
    }

    // For blocked slots, no client lookup needed
    if (data.status !== 'blocked' && !data.clientId && req.user) {
      // Always look up (or create) a client record scoped to the target unit.
      // This ensures cross-unit bookings get their own client entry in that unit.
      let client = await ClientModel.findOne({ userId: req.user.id, unitId: data.unitId });

      if (!client) {
        const user = await UserModel.findById(req.user.id);
        if (user) {
          client = await ClientModel.create({
            name: user.name,
            email: user.email || `user_${user._id}@delio.internal`,
            phone: user.phone,
            userId: user._id,
            unitId: data.unitId,
          });
        }
      }

      if (client) {
        data.clientId = client._id;
      } else {
        throw new AppError('Client record not found and could not be created', 404);
      }
    }
    data.source = req.user!.role === 'client' ? 'client' : 'admin';
    const appt = await service.create(data);
    
    // Create notification
    const fullAppt = await service.findById(appt._id.toString());
    const client = await ClientModel.findById(fullAppt.clientId);
    await notificationService.notify({
      unitId: fullAppt.unitId.toString(),
      type: 'new',
      title: 'Novo Agendamento',
      message: `${client?.name || 'Um cliente'} realizou um novo agendamento.`,
      appointmentId: fullAppt._id.toString(),
      external: true
    });

    sseService.emit(appt.unitId.toString(), 'appointments:change');
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
    await notificationService.notify({
      unitId: result.appointment.unitId.toString(),
      type: 'new',
      title: 'Novo Agendamento',
      message: `${guestName} agendou um novo serviço.`,
      appointmentId: result.appointment._id.toString(),
      external: true
    });

    created(res, result);
  } catch (e) { next(e); }
}

export async function updateAppointmentStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { status, price, paymentMethod, skipBilling, billService, billProducts } = req.body;

    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    // Security check
    const isOwnerOrFranchisor = req.user!.role === 'owner';
    if (req.user!.role === 'client' && status !== 'cancelled') {
      throw new AppError('Clientes só podem cancelar seus próprios agendamentos.', 403);
    }
    if (!isOwnerOrFranchisor) {
      if (req.user!.role === 'client') {
        const clients = await ClientModel.find({ userId: req.user!.id });
        const clientIds = clients.map(c => c._id.toString());
        if (!clientIds.includes(appt.clientId?.toString() || '')) {
          throw new AppError('You can only update your own appointments', 403);
        }
      } else {
        if (appt.unitId?.toString() !== req.user!.unitId?.toString()) {
          throw new AppError('Access denied to this unit', 403);
        }
      }
    }

    if (status === 'cancelled') {
      const fullAppt = await service.findById(id);
      if (fullAppt.isBilled) {
        throw new AppError('Não é possível cancelar um agendamento já faturado.', 400);
      }
      const client = await ClientModel.findById(fullAppt.clientId);
      await notificationService.notify({
        unitId: fullAppt.unitId.toString(),
        type: 'cancellation',
        title: 'Agendamento Cancelado',
        message: `${client?.name || 'Um cliente'} cancelou o serviço ${(fullAppt.serviceId as any)?.name || 'agendado'}.`,
        appointmentId: fullAppt._id.toString(),
        external: true
      });
      await service.delete(id);
      ok(res, { deleted: true });
      return;
    }

    const updated = await service.updateStatus(id, status, { price, paymentMethod, skipBilling, billService, billProducts });
    const uid = updated.unitId?.toString();
    if (uid) {
      sseService.emit(uid, 'appointments:change');
      sseService.emit(uid, 'finance:change');
      sseService.emit(uid, 'clients:change');
    }
    ok(res, updated);
  } catch (e) { next(e); }
}

export async function deleteAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    const isOwnerOrFranchisor = req.user!.role === 'owner';
    if (!isOwnerOrFranchisor && appt.unitId?.toString() !== req.user!.unitId?.toString()) {
      throw new AppError('Access denied to this unit', 403);
    }

    const uid = appt.unitId?.toString();
    const mode = (req.query.mode as string) as 'single' | 'this-and-future' | undefined;
    await service.delete(id, { mode });
    if (uid) sseService.emit(uid, 'appointments:change');
    ok(res, { deleted: true });
  } catch (e) { next(e); }
}

export async function getClientAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = req.params.clientId;
    
    // Security check for client role
    if (req.user!.role === 'client') {
      const clients = await ClientModel.find({ userId: req.user!.id });
      const clientIds = clients.map(c => c._id.toString());
      if (!clientIds.includes(clientId)) {
        throw new AppError('Access denied', 403);
      }
    } else if (req.user!.role !== 'owner') {
      // For employee/cashier, check unit
      const client = await ClientModel.findById(clientId);
      if (client?.unitId?.toString() !== req.user!.unitId?.toString()) {
        throw new AppError('Access denied to this unit', 403);
      }
    }

    const appointments = await service.findByClient(clientId);
    ok(res, appointments);
  } catch (e) { next(e); }
}

export async function updateAppointment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new AppError('Appointment not found', 404);

    const isOwnerOrFranchisor = req.user!.role === 'owner';
    if (!isOwnerOrFranchisor) {
      if (req.user!.role === 'client') {
        const clients = await ClientModel.find({ userId: req.user!.id });
        const clientIds = clients.map(c => c._id.toString());
        if (!clientIds.includes(appt.clientId?.toString() || '')) {
          throw new AppError('You can only update your own appointments', 403);
        }
      } else {
        // Employee/Cashier: must belong to the same unit
        if (appt.unitId?.toString() !== req.user!.unitId?.toString()) {
          throw new AppError('Access denied to this unit', 403);
        }
      }
    }

    req.body.source = req.user!.role === 'client' ? 'client' : 'admin';
    const updated = await service.update(id, req.body);

    // Create notification for edit
    const fullAppt = await service.findById(id);
    const client = await ClientModel.findById(fullAppt.clientId);
    await notificationService.notify({
      unitId: fullAppt.unitId.toString(),
      type: 'edit',
      title: 'Agendamento Editado',
      message: `${client?.name || 'Um cliente'} alterou detalhes do agendamento de ${(fullAppt.serviceId as any)?.name || 'serviço'}.`,
      appointmentId: fullAppt._id.toString(),
      external: true
    });

    sseService.emit(updated.unitId.toString(), 'appointments:change');
    ok(res, updated);
  } catch (e) { next(e); }
}

export async function getMyAppointments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointments = await service.findByUserId(req.user!.id);
    ok(res, appointments);
  } catch (e) { next(e); }
}
