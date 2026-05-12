import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppointmentModel, IAppointment } from './appointment.model';
import { ClientModel } from '../clients/client.model';
import { ServiceModel } from '../services/service.model';
import { UserModel } from '../auth/auth.model';
import { UnitModel } from '../units/unit.model';
import { env } from '../../config/env';
import { NotFoundError, AppError } from '../../shared/errors/AppError';
import type { AppointmentStatus } from '@barber/types';

interface GuestBookResult {
  appointment: IAppointment;
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string; phone: string };
}

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function sanitize(str?: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

import { IService } from '../services/service.model';
import { IClient } from '../clients/client.model';

interface PopulatedService extends IService { _id: mongoose.Types.ObjectId }
interface PopulatedClient extends IClient { _id: mongoose.Types.ObjectId }
interface PopulatedUser { _id: mongoose.Types.ObjectId, name: string }

export class AppointmentService {
  async findByUnitAndDate(unitId: string, date?: string, start?: string, end?: string, pagination?: { skip: number, limit: number }): Promise<IAppointment[]> {
    const filter: Record<string, unknown> = { unitId };
    if (date) {
      filter.date = date;
    } else if (start && end) {
      filter.date = { $gte: start, $lte: end };
    }
    
    let query = AppointmentModel.find(filter)
      .populate('clientId', 'name phone')
      .populate('employeeId', 'name')
      .populate('serviceId', 'name durationMinutes')
      .sort({ startTime: 1 });

    if (pagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }

    return query;
  }

  async findByEmployee(employeeId: string, date?: string): Promise<IAppointment[]> {
    const filter: Record<string, unknown> = { employeeId };
    if (date) filter.date = date;
    return AppointmentModel.find(filter).sort({ startTime: 1 });
  }

  async findByClient(clientId: string): Promise<IAppointment[]> {
    return AppointmentModel.find({ clientId })
      .populate('serviceId', 'name price')
      .populate('employeeId', 'name')
      .populate('unitId', 'name address')
      .sort({ date: -1, startTime: -1 });
  }

  async findByUserId(userId: string): Promise<IAppointment[]> {
    const clients = await ClientModel.find({ userId: new mongoose.Types.ObjectId(userId) });
    const clientIds = clients.map(c => c._id);
    return AppointmentModel.find({ clientId: { $in: clientIds } })
      .populate('serviceId', 'name price')
      .populate('employeeId', 'name')
      .populate('unitId', 'name address')
      .sort({ date: -1, startTime: -1 });
  }

  async getAvailableSlots(
    unitId: string,
    employeeId: string,
    date: string,
    durationMinutes: number,
  ): Promise<string[]> {
    const employee = await UserModel.findById(employeeId).select('workSchedule vacations blockedDays');
    if (!employee) throw new NotFoundError('Employee');

    const unit = await UnitModel.findById(unitId).select('slotInterval');
    const slotInterval = Number(unit?.slotInterval) || 0;

    // Se o dia estiver bloqueado ou o profissional estiver de férias, retorna zero horários
    if (employee.blockedDays?.includes(date)) return [];
    if (employee.vacations?.some(v => date >= v.start && date <= v.end)) return [];

    const schedule = employee.workSchedule || { start: '08:00', end: '18:00' };

    const booked = await AppointmentModel.find({
      unitId,
      employeeId,
      date,
      status: { $nin: ['cancelled'] },
    }).select('startTime endTime');

    // Intervalo de geração do grid pode ser 15min ou 30min
    const gridStep = slotInterval > 0 ? slotInterval : 15;
    const allSlots = this.generateSlots(schedule.start, schedule.end, gridStep);
    
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const nowMins = today.getHours() * 60 + today.getMinutes();

    return allSlots.filter(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      const slotEnd = slotStart + Number(durationMinutes);

      // 0. Prevent past time for today
      if (date === todayISO && slotStart < nowMins) return false;
      if (date < todayISO) return false;

      // 1. Check if it's within work hours
      const [wsh, wsm] = schedule.start.split(':').map(Number);
      const [weh, wem] = schedule.end.split(':').map(Number);
      const workStart = wsh * 60 + wsm;
      const workEnd = weh * 60 + wem;
      if (slotEnd > workEnd) return false;

      // 2. Check lunch break
      if (schedule.lunchStart && schedule.lunchEnd) {
        const [lsh, lsm] = schedule.lunchStart.split(':').map(Number);
        const [leh, lem] = schedule.lunchEnd.split(':').map(Number);
        const lunchStart = lsh * 60 + lsm;
        const lunchEnd = leh * 60 + lem;
        // Se o slot interceptar o almoço
        if (slotStart < lunchEnd && slotEnd > lunchStart) return false;
      }

      // 3. Check bookings considering buffer time
      return !booked.some(b => {
        const [bsh, bsm] = b.startTime.split(':').map(Number);
        const [beh, bem] = b.endTime.split(':').map(Number);
        
        const bookedStart = bsh * 60 + bsm;
        // Extend booked End Time by the interval buffer
        const bookedEndWithBuffer = (beh * 60 + bem) + slotInterval;
        
        // Similarly, ensure that our proposed slot doesn't infringe on a booking's start time
        // (i.e. our end time + buffer shouldn't exceed their start time if we are before them)
        const slotEndWithBuffer = slotEnd + slotInterval;

        return (
          (slotStart >= bookedStart && slotStart < bookedEndWithBuffer) ||
          (slotEnd > bookedStart && slotEnd <= bookedEndWithBuffer) ||
          (slotStart <= bookedStart && slotEndWithBuffer > bookedStart)
        );
      });
    });
  }

  async findById(id: string): Promise<IAppointment> {
    const appt = await AppointmentModel.findById(id)
      .populate('clientId', 'name phone')
      .populate('employeeId', 'name')
      .populate('serviceId', 'name durationMinutes price');
    if (!appt) throw new NotFoundError('Appointment');
    return appt;
  }

  async create(data: Partial<IAppointment>): Promise<IAppointment> {
    if (data.status !== 'blocked') {
      if (!data.clientId || !data.serviceId) {
        throw new AppError('Cliente e Serviço são obrigatórios para agendamentos.', 400);
      }
    }

    if (!data.endTime && data.serviceId && data.startTime) {
      const svc = await ServiceModel.findById(data.serviceId);
      if (svc) data.endTime = calcEndTime(data.startTime, svc.durationMinutes);
    }

    // Past date/time validation — skip for admin-created blocks
    if (data.status !== 'blocked') {
      const today = new Date();
      const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
      
      if (data.date! < todayISO || (data.date === todayISO && data.startTime! < nowTime)) {
        throw new AppError('Não é possível agendar em uma data ou hora retroativa.', 400);
      }
    }
    
    const employee = await UserModel.findById(data.employeeId).select('vacations blockedDays');
    if (!employee) throw new NotFoundError('Employee');

    if (employee.blockedDays?.includes(data.date!)) {
      throw new AppError('Profissional indisponível: Dia bloqueado.', 400);
    }
    if (employee.vacations?.some(v => data.date! >= v.start && data.date! <= v.end)) {
      throw new AppError('Profissional indisponível: Em período de férias.', 400);
    }

    const conflict = await AppointmentModel.findOne({
      employeeId: data.employeeId,
      date: data.date,
      status: { $nin: ['cancelled'] },
      $or: [
        { startTime: { $lt: data.endTime, $gte: data.startTime } },
        { endTime: { $gt: data.startTime, $lte: data.endTime } },
        { startTime: { $lte: data.startTime }, endTime: { $gte: data.endTime } },
      ],
    });
    if (conflict) throw new AppError('Horário já ocupado por outro agendamento.', 409);
    
    const svc = await ServiceModel.findById(data.serviceId);
    const apptData = { 
      ...data, 
      status: data.status || 'confirmed',
      isPackage: data.isPackage || svc?.type === 'package'
    };
    return AppointmentModel.create(apptData);
  }

  async guestBook(payload: {
    unitId: string;
    serviceId: string;
    employeeId: string;
    date: string;
    startTime: string;
    price: number;
    guestName: string;
    guestPhone: string;
    notes?: string;
  }): Promise<GuestBookResult> {
    const { unitId, serviceId, employeeId, date, startTime, price, guestName, guestPhone, notes } = payload;

    const svc = await ServiceModel.findById(serviceId);
    if (!svc) throw new AppError('Service not found', 404);

    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
    
    if (date < todayISO || (date === todayISO && startTime < nowTime)) {
      throw new AppError('Não é possível agendar em uma data ou hora retroativa.', 400);
    }

    const endTime = calcEndTime(startTime, svc.durationMinutes);
    const cleanPhone = guestPhone.replace(/\D/g, '');
    const guestEmail = `guest_${cleanPhone}@delio.guest`;

    // Find or create Client record
    let client = await ClientModel.findOne({ phone: guestPhone, unitId });
    if (!client) {
      client = await ClientModel.create({ name: guestName, phone: guestPhone, email: guestEmail, unitId });
    } else if (client.name !== guestName) {
      client.name = guestName;
      await client.save();
    }

    // Find or create User account (role: client) so they can log in later
    let userAccount = await UserModel.findOne({ email: guestEmail });
    if (!userAccount) {
      const passwordHash = await bcrypt.hash(cleanPhone.slice(-4), 10);
      userAccount = await UserModel.create({
        name: guestName,
        email: guestEmail,
        phone: guestPhone,
        passwordHash,
        role: 'client',
        unitId,
        isActive: true,
      });
    }

    if (!client.userId) {
      client.userId = userAccount._id as any;
      await client.save();
    }

    // Check if client has a package for THIS service
    const activeSub = client.packages?.find(p => 
      p.active && (p.packageId.toString() === serviceId || p.itemLimits?.some(il => il.serviceId.toString() === serviceId))
    );

    const isUsingPackage = !!activeSub && svc.type === 'single';
    const isBuyingPackage = svc.type === 'package';

    const finalIsPackage = isUsingPackage || isBuyingPackage;
    const finalPrice = isUsingPackage ? 0 : price;

    const conflict = await AppointmentModel.findOne({
      employeeId,
      date,
      status: { $nin: ['cancelled'] },
      $or: [
        { startTime: { $lt: endTime, $gte: startTime } },
        { endTime: { $gt: startTime, $lte: endTime } },
        { startTime: { $lte: startTime }, endTime: { $gte: endTime } },
      ],
    });
    if (conflict) throw new AppError('Time slot already booked', 409);
    
    const employee = await UserModel.findById(employeeId).select('vacations blockedDays');
    if (!employee) throw new NotFoundError('Employee');

    if (employee.blockedDays?.includes(date)) {
      throw new AppError('Profissional indisponível: Dia bloqueado.', 400);
    }
    if (employee.vacations?.some(v => date >= v.start && date <= v.end)) {
      throw new AppError('Profissional indisponível: Em período de férias.', 400);
    }

    // If booking a PACKAGE service, automatically subscribe the client
    if (svc.type === 'package') {
      const alreadyHas = client.packages?.some(p => p.packageId.toString() === serviceId && p.active);
      if (!alreadyHas) {
        client.packages = client.packages || [];
        client.packages.push({
          packageId: svc._id as any,
          startDate: new Date(),
          active: true,
          itemLimits: svc.packageItems?.map(pi => ({
            serviceId: pi.serviceId,
            quantity: pi.quantity
          })) || []
        });
        await client.save();
      }
    }

    const appointment = await AppointmentModel.create({ 
      clientId: client._id, 
      employeeId, 
      serviceId, 
      unitId, 
      date, 
      startTime, 
      endTime, 
      price: finalPrice, 
      status: 'confirmed',
      isPackage: finalIsPackage,
      notes: sanitize(notes)
    });

    const tokenPayload = { id: userAccount._id.toString(), role: 'client' as const, unitId };
    const accessToken = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
    const refreshToken = jwt.sign(tokenPayload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn as any });

    return {
      appointment,
      accessToken,
      refreshToken,
      user: { id: userAccount._id.toString(), name: userAccount.name, email: userAccount.email, role: 'client', phone: userAccount.phone },
    };
  }

  async updateStatus(
    id: string, 
    status: AppointmentStatus, 
    options?: { price?: number; paymentMethod?: string }
  ): Promise<IAppointment> {
    const appt = await AppointmentModel.findById(id).populate('serviceId', 'name price');
    if (!appt) throw new NotFoundError('Appointment');

    const oldStatus = appt.status;
    appt.status = status;
    
    if (options?.price != null) {
      appt.price = options.price;
    }

    await appt.save();

    // Automatically create transaction if completed
    if (status === 'completed' && oldStatus !== 'completed') {
      const { TransactionModel } = await import('../finance/transaction.model');
      
      const exists = await TransactionModel.findOne({ appointmentId: appt._id });
      if (!exists) {
        await TransactionModel.create({
          unitId: appt.unitId,
          appointmentId: appt._id,
          type: 'income',
          category: 'service',
          amount: options?.price ?? appt.price ?? (appt.serviceId as unknown as PopulatedService)?.price ?? 0,
          description: `Atendimento: ${(appt.serviceId as unknown as PopulatedService)?.name || 'Serviço'}`,
          date: appt.date,
          paymentMethod: options?.paymentMethod,
          createdBy: appt.employeeId
        });
      }
    } else if (status !== 'completed' && oldStatus === 'completed') {
      // Remove transaction if no longer completed
      const { TransactionModel } = await import('../finance/transaction.model');
      await TransactionModel.deleteOne({ appointmentId: appt._id });
    }

    return appt;
  }

  async delete(id: string): Promise<void> {
    const appt = await AppointmentModel.findByIdAndDelete(id);
    if (!appt) throw new NotFoundError('Appointment');
  }

  async update(id: string, data: Partial<IAppointment>): Promise<IAppointment> {
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new NotFoundError('Appointment');

    if (data.startTime && !data.endTime && (data.serviceId || appt.serviceId)) {
      const svcId = data.serviceId || appt.serviceId;
      const svc = await ServiceModel.findById(svcId);
      if (svc) {
        data.endTime = calcEndTime(data.startTime, svc.durationMinutes);
      }
    }

    // Conflict check
    if (data.startTime || data.date || data.employeeId) {
      const checkDate = data.date || appt.date;
      const checkEmp  = data.employeeId || appt.employeeId;
      const checkStart = data.startTime || appt.startTime;
      const checkEnd   = data.endTime || appt.endTime;

      const conflict = await AppointmentModel.findOne({
        _id: { $ne: id },
        employeeId: checkEmp,
        date: checkDate,
        status: { $nin: ['cancelled'] },
        $or: [
          { startTime: { $lt: checkEnd, $gte: checkStart } },
          { endTime: { $gt: checkStart, $lte: checkEnd } },
          { startTime: { $lte: checkStart }, endTime: { $gte: checkEnd } },
        ],
      });
      if (conflict) throw new AppError('Horário já ocupado por outro agendamento.', 409);
    }

    Object.assign(appt, data);
    return appt.save();
  }

  private generateSlots(start: string, end: string, intervalMin: number): string[] {
    const slots: string[] = [];
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let current = sh * 60 + sm;
    const endMins = eh * 60 + em;
    while (current + intervalMin <= endMins) {
      const h = Math.floor(current / 60).toString().padStart(2, '0');
      const m = (current % 60).toString().padStart(2, '0');
      slots.push(`${h}:${m}`);
      current += intervalMin;
    }
    return slots;
  }
}
