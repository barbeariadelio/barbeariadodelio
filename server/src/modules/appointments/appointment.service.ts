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
import { getSlotCache, setSlotCache, invalidateSlotCache } from '../../shared/cache/slotCache';
import type { AppointmentStatus, TransactionCategory } from '@barber/types';

interface GuestBookResult {
  appointment: IAppointment;
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string; phone: string };
}

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  // Use at least 30 minutes so endTime is always after startTime (handles packages with durationMinutes=0)
  const dur = durationMinutes > 0 ? durationMinutes : 30;
  const total = h * 60 + m + dur;
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

export class AppointmentService {
  async findByUnitAndDate(unitId: string, date?: string, start?: string, end?: string, pagination?: { skip: number, limit: number }, employeeId?: string): Promise<IAppointment[]> {
    const filter: Record<string, unknown> = { unitId, status: { $ne: 'cancelled' } };
    if (date) {
      filter.date = date;
    } else if (start && end) {
      filter.date = { $gte: start, $lte: end };
    }
    if (employeeId) {
      filter.employeeId = new mongoose.Types.ObjectId(employeeId);
    }

    let query = AppointmentModel.find(filter)
      .populate('clientId', 'name phone')
      .populate('employeeId', 'name')
      .populate('serviceId', 'name durationMinutes')
      .sort({ startTime: 1 });

    if (pagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }

    return query.lean() as unknown as Promise<IAppointment[]>;
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
    bufferMins = 0,
  ): Promise<string[]> {
    const cached = getSlotCache(unitId, employeeId, date, durationMinutes, bufferMins);
    if (cached) return cached;

    const [employee, unit] = await Promise.all([
      UserModel.findById(employeeId).select('workSchedule daySchedules vacations blockedDays').lean(),
      UnitModel.findById(unitId).select('slotInterval workingDays').lean(),
    ]);
    if (!employee) throw new NotFoundError('Employee');
    if (!unit) throw new NotFoundError('Unit');

    // Check if the day is a working day for the unit
    // Use T12:00:00 to avoid timezone shifts that could change the day
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    if (unit.workingDays && unit.workingDays.length > 0 && !unit.workingDays.includes(dayOfWeek)) {
      return [];
    }

    const slotInterval = Number(unit?.slotInterval) || 0;

    if (employee.blockedDays?.includes(date)) return [];
    if (employee.vacations?.some(v => date >= v.start && date <= v.end)) return [];

    // Resolve working ranges for this day (new per-day structure takes priority)
    let dayRanges: { start: string; end: string }[];
    if (employee.daySchedules && employee.daySchedules.length > 0) {
      const dayConfig = (employee.daySchedules as { day: number; slots: { start: string; end: string }[] }[]).find(ds => ds.day === dayOfWeek);
      if (!dayConfig || dayConfig.slots.length === 0) return []; // Day not configured = not working
      dayRanges = dayConfig.slots;
    } else {
      // Fallback to legacy workSchedule
      const empWorkDays = employee.workSchedule?.workDays;
      if (empWorkDays && empWorkDays.length > 0 && !empWorkDays.includes(dayOfWeek)) return [];
      const schedule = employee.workSchedule || { start: '08:00', end: '18:00' };
      dayRanges = [{ start: schedule.start || '08:00', end: schedule.end || '18:00' }];
    }

    const booked = await AppointmentModel.find({
      unitId,
      employeeId,
      date,
      status: { $nin: ['cancelled'] },
    }).select('startTime endTime').lean();

    const gridStep = slotInterval > 0 ? slotInterval : 15;

    // Generate slots from all time ranges and deduplicate
    const rawSlots: string[] = [];
    for (const range of dayRanges) {
      rawSlots.push(...this.generateSlots(range.start, range.end, gridStep));
    }
    const allSlots = [...new Set(rawSlots)].sort();

    // Use Brazil timezone so past-slot filtering isn't skewed by UTC offset
    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayISO = `${nowBR.getFullYear()}-${String(nowBR.getMonth() + 1).padStart(2, '0')}-${String(nowBR.getDate()).padStart(2, '0')}`;
    const nowMins = nowBR.getHours() * 60 + nowBR.getMinutes();

    const result = allSlots.filter(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      const slotEnd = slotStart + Number(durationMinutes);

      if (date === todayISO && slotStart < nowMins + bufferMins) return false;
      if (date < todayISO) return false;

      // Slot must fit entirely within at least one time range
      const fitsInRange = dayRanges.some(range => {
        const [rsh, rsm] = range.start.split(':').map(Number);
        const [reh, rem] = range.end.split(':').map(Number);
        return slotStart >= rsh * 60 + rsm && slotEnd <= reh * 60 + rem;
      });
      if (!fitsInRange) return false;

      return !booked.some(b => {
        const [bsh, bsm] = b.startTime.split(':').map(Number);
        const [beh, bem] = b.endTime.split(':').map(Number);
        const bookedStart = bsh * 60 + bsm;
        const bookedEndWithBuffer = beh * 60 + bem;
        const slotEndWithBuffer = slotEnd;
        return (
          (slotStart >= bookedStart && slotStart < bookedEndWithBuffer) ||
          (slotEnd > bookedStart && slotEnd <= bookedEndWithBuffer) ||
          (slotStart <= bookedStart && slotEndWithBuffer > bookedStart)
        );
      });
    });

    setSlotCache(unitId, employeeId, date, durationMinutes, result, bufferMins);
    return result;
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

    const internalOverride = data.source === 'admin';

    // Custom duration is reserved for internal scheduling. Public/client
    // requests always use the registered service duration.
    if (data.serviceId && data.startTime && (!internalOverride || !data.endTime)) {
      const svc = await ServiceModel.findById(data.serviceId);
      if (svc) data.endTime = calcEndTime(data.startTime, svc.durationMinutes);
    }

    if (data.status !== 'blocked' && !internalOverride) {
      const unit = await UnitModel.findById(data.unitId).select('workingDays');
      if (unit?.workingDays && unit.workingDays.length > 0) {
        const dayOfWeek = new Date(data.date! + 'T12:00:00').getDay();
        if (!unit.workingDays.includes(dayOfWeek)) {
          throw new AppError('A barbearia não funciona no dia selecionado.', 400);
        }
      }

      const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayISO = `${nowBR.getFullYear()}-${String(nowBR.getMonth() + 1).padStart(2, '0')}-${String(nowBR.getDate()).padStart(2, '0')}`;
      const nowTime = `${String(nowBR.getHours()).padStart(2, '0')}:${String(nowBR.getMinutes()).padStart(2, '0')}`;
      const canBackfillToday = data.source === 'admin';
      if (data.date! < todayISO || (!canBackfillToday && data.date === todayISO && data.startTime! < nowTime)) {
        throw new AppError('Não é possível agendar em uma data ou hora retroativa.', 400);
      }
    }
    
    const employee = await UserModel.findById(data.employeeId).select('vacations blockedDays');
    if (!employee) throw new NotFoundError('Employee');

    if (!internalOverride && employee.blockedDays?.includes(data.date!)) {
      throw new AppError('Profissional indisponível: Dia bloqueado.', 400);
    }
    if (!internalOverride && employee.vacations?.some(v => data.date! >= v.start && data.date! <= v.end)) {
      throw new AppError('Profissional indisponível: Em período de férias.', 400);
    }

    if (data.status !== 'blocked') {
      const conflict = await AppointmentModel.findOne({
        unitId: data.unitId,
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
    }
    
    const svc = await ServiceModel.findById(data.serviceId);

    let finalPrice = svc?.price ?? data.price ?? 0;
    let usedPackageId = undefined;
    let isPackage = data.isPackage || svc?.type === 'package';

    // For package-type services, always store the per-session prorated price
    // and auto-enroll the client in the package if they don't have it yet
    if (svc?.type === 'package' && data.clientId) {
      const totalSessions = svc.packageItems?.reduce((acc, item) => acc + (item.quantity || 1), 0) || 1;
      finalPrice = Math.round((svc.price / totalSessions) * 100) / 100;

      const client = await ClientModel.findById(data.clientId);
      if (client) {
        const alreadyHas = client.packages?.some(
          p => p.packageId.toString() === svc._id!.toString() && p.active
        );
        if (!alreadyHas) {
          let expiresAt: Date | undefined;
          const validity = (svc as any).packageValidity;
          if (validity?.type && validity.type !== 'none' && validity.value) {
            const exp = new Date();
            if (validity.type === 'days')   exp.setDate(exp.getDate() + validity.value);
            else if (validity.type === 'weeks')  exp.setDate(exp.getDate() + validity.value * 7);
            else if (validity.type === 'months') exp.setMonth(exp.getMonth() + validity.value);
            else if (validity.type === 'years')  exp.setFullYear(exp.getFullYear() + validity.value);
            expiresAt = exp;
          }
          client.packages = client.packages || [];
          client.packages.push({
            packageId: svc._id as any,
            startDate: new Date(),
            active: true,
            expiresAt,
            itemLimits: svc.packageItems?.map(pi => ({
              serviceId: pi.serviceId,
              quantity: pi.quantity,
              used: 0,
            })) || [],
          });
          await client.save();
        }
      }
    } else if (svc?.type === 'package') {
      const totalSessions = svc.packageItems?.reduce((acc, item) => acc + (item.quantity || 1), 0) || 1;
      finalPrice = Math.round((svc.price / totalSessions) * 100) / 100;
    }

    // If it's a single service, check if client is using an active package for it
    if (svc?.type === 'single' && data.clientId) {
      const client = await ClientModel.findById(data.clientId);
      if (client) {
        const { price: prorated, packageId } = await this.calculateProratedPrice(client, data.serviceId!.toString());
        if (packageId) {
          finalPrice = prorated;
          usedPackageId = packageId;
          isPackage = true;
        }
      }
    }

    const apptData = { 
      ...data, 
      price: finalPrice,
      status: data.status || 'confirmed',
      isPackage,
      usedPackageId,
      // If it's a package type service but NOT a use of an existing package, it's a sale
      notes: svc?.type === 'package' && !usedPackageId ? `Venda de Pacote: ${svc.name}${data.notes ? ' | ' + data.notes : ''}` : data.notes
    };
    const created = await AppointmentModel.create(apptData);
    invalidateSlotCache(data.unitId!.toString(), data.employeeId!.toString(), data.date!);
    return created;
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

    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayISO = `${nowBR.getFullYear()}-${String(nowBR.getMonth() + 1).padStart(2, '0')}-${String(nowBR.getDate()).padStart(2, '0')}`;
    const nowMinsTotal = nowBR.getHours() * 60 + nowBR.getMinutes();
    const minAllowedMins = nowMinsTotal + 30;
    const minAllowedTime = `${String(Math.floor(minAllowedMins / 60)).padStart(2, '0')}:${String(minAllowedMins % 60).padStart(2, '0')}`;
    if (date < todayISO || (date === todayISO && startTime < minAllowedTime)) {
      throw new AppError('Agendamentos online devem ser feitos com pelo menos 30 minutos de antecedência.', 400);
    }

    const cleanPhone = guestPhone.replace(/\D/g, '');
    const guestEmail = `guest_${cleanPhone}_${unitId}@delio.guest`;

    // Batch 1: all independent reads in parallel
    const [svc, existingClient, userByEmail, userByPhone, employee] = await Promise.all([
      ServiceModel.findById(serviceId),
      ClientModel.findOne({ phone: guestPhone, unitId }),
      UserModel.findOne({ email: guestEmail }),
      UserModel.findOne({ phone: guestPhone }),
      UserModel.findById(employeeId).select('vacations blockedDays').lean(),
    ]);

    if (!svc) throw new AppError('Service not found', 404);
    if (!employee) throw new NotFoundError('Employee');

    if (employee.blockedDays?.includes(date)) {
      throw new AppError('Profissional indisponível: Dia bloqueado.', 400);
    }
    if (employee.vacations?.some((v: { start: string; end: string }) => date >= v.start && date <= v.end)) {
      throw new AppError('Profissional indisponível: Em período de férias.', 400);
    }

    const endTime = calcEndTime(startTime, svc.durationMinutes || 30);

    // Batch 2: conflict check (needs endTime from svc) + client/user writes
    const conflict = await AppointmentModel.findOne({
      employeeId,
      date,
      status: { $nin: ['cancelled'] },
      $or: [
        { startTime: { $lt: endTime, $gte: startTime } },
        { endTime: { $gt: startTime, $lte: endTime } },
        { startTime: { $lte: startTime }, endTime: { $gte: endTime } },
      ],
    }).select('_id').lean();
    if (conflict) throw new AppError('Time slot already booked', 409);

    let client = existingClient;
    if (!client) {
      client = await ClientModel.create({ name: guestName, phone: guestPhone, email: guestEmail, unitId });
    } else if (client.name !== guestName) {
      client.name = guestName;
      await client.save();
    }

    // Prefer account matched by guest email, fall back to phone match
    let userAccount = userByEmail ?? userByPhone ?? null;
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

    const activeSub = client.packages?.find(p =>
      p.active && (p.packageId.toString() === serviceId || p.itemLimits?.some(il => il.serviceId.toString() === serviceId))
    );

    const isBuyingPackage = svc.type === 'package';
    const isUsingPackage = !!activeSub && svc.type === 'single';

    let finalPrice = isUsingPackage ? 0 : svc.price;
    let usedPackageId = undefined;

    if (isUsingPackage) {
      const { price: prorated, packageId } = await this.calculateProratedPrice(client, serviceId);
      if (packageId) {
        finalPrice = prorated;
        usedPackageId = packageId;
      }
    }

    if (isBuyingPackage) {
      const totalSessions = svc.packageItems?.reduce((acc, item) => acc + (item.quantity || 1), 0) || 1;
      finalPrice = Math.round((svc.price / totalSessions) * 100) / 100;
    }

    const finalIsPackage = isUsingPackage || isBuyingPackage;

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
            quantity: pi.quantity,
            used: 0,
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
      usedPackageId,
      source: 'guest',
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
    options?: { price?: number; paymentMethod?: string; skipBilling?: boolean; billService?: boolean; billProducts?: boolean }
  ): Promise<IAppointment> {
    // Step 1: fetch raw document (no populate) to avoid save() issues with populated fields
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new NotFoundError('Appointment');

    const oldStatus = appt.status;

    if (oldStatus === 'cancelled' && status !== 'cancelled') {
      const conflict = await AppointmentModel.findOne({
        _id: { $ne: id },
        employeeId: appt.employeeId,
        date: appt.date,
        status: { $nin: ['cancelled'] },
        $or: [
          { startTime: { $lt: appt.endTime, $gte: appt.startTime } },
          { endTime: { $gt: appt.startTime, $lte: appt.endTime } },
          { startTime: { $lte: appt.startTime }, endTime: { $gte: appt.endTime } },
        ],
      });
      if (conflict) throw new AppError('Este horário já está ocupado por outro agendamento.', 409);
    }

    if (appt.isBilled && options?.price != null && options.price !== appt.price) {
      throw new AppError('Não é possível alterar o valor de um agendamento já faturado.', 400);
    }

    appt.status = status;
    if (options?.price != null) {
      appt.price = options.price;
    }

    await appt.save();
    invalidateSlotCache(appt.unitId.toString(), appt.employeeId.toString(), appt.date);

    const { TransactionModel } = await import('../finance/transaction.model');

    if (status === 'completed') {
      // Step 2: fetch with populate only for the financial logic
      const populated = await AppointmentModel.findById(id).populate<{
        serviceId: { _id: mongoose.Types.ObjectId; name: string; price: number; type: string; packageItems?: Array<{ serviceId: mongoose.Types.ObjectId; quantity: number }> }
      }>('serviceId', 'name price type packageItems');
      
      if (!populated) throw new NotFoundError('Appointment');
      
      const svcDoc = populated.serviceId;
      let isPackageUse = !!appt.usedPackageId;
      const isPackageSale = !isPackageUse && svcDoc?.type === 'package';

      // Pre-load client once — used by auto-link, skipBilling, and doService blocks
      const clientDoc = appt.clientId ? await ClientModel.findById(appt.clientId) : null;

      // ── Auto-link to active package on billing ──
      // If this is a regular service and the client has an active package covering it,
      // link the appointment now so the session is consumed and the counter updates.
      if (!isPackageUse && !isPackageSale && appt.clientId && appt.serviceId) {
        if (clientDoc) {
          const { packageId } = await this.calculateProratedPrice(clientDoc, appt.serviceId.toString());
          if (packageId) {
            appt.usedPackageId = packageId;
            await appt.save();
            isPackageUse = true;
          }
        }
      }

      // skipBilling: caller explicitly requested no financial transaction (package use only)
      const skipBilling = isPackageUse && options?.skipBilling === true;

      // ── When a package USE session is marked done without billing,
      //    still decrement the session counter and mark as billed so it can't be re-processed.
      if (skipBilling) {
        // Decrement session counter only
        if (appt.clientId && appt.usedPackageId && appt.serviceId) {
          const client = clientDoc;
          if (client) {
            const sub = client.packages?.find(
              p => p.packageId.toString() === appt.usedPackageId!.toString()
            );
            if (sub?.itemLimits) {
              const limit = sub.itemLimits.find(
                l => l.serviceId.toString() === appt.serviceId!.toString()
              );
              if (limit) {
                limit.used = (limit.used || 0) + 1;
                const allExhausted = sub.itemLimits.every(l => (l.used || 0) >= (l.quantity || 0));
                if (allExhausted) sub.active = false;
                await client.save();
              }
            }
          }
        }
        // Mark as billed (button disappears) + billingSkipped (exclude from commission metrics)
        appt.isBilled = true;
        (appt as any).billingSkipped = true;
        await appt.save();
      }

      const hasBillingTrigger = !skipBilling && (options?.paymentMethod || isPackageUse);
      const doService = hasBillingTrigger && options?.billService !== false && !appt.isBilled;
      const products = (appt as any).products as Array<{ productId: mongoose.Types.ObjectId; name: string; quantity: number; unitPrice: number }> | undefined;
      const doProducts = (options?.paymentMethod || isPackageUse) && options?.billProducts !== false && !(appt as any).productsBilled && products && products.length > 0;

      // ── Service income + commission ──
      if (doService) {
        let category: TransactionCategory = 'service';
        if (isPackageUse)  category = 'package_use';
        else if (isPackageSale) category = 'package_sale';

        const svcName = svcDoc?.name || 'Serviço';
        const description = isPackageUse
          ? `Uso de Pacote: ${svcName}`
          : isPackageSale
            ? `Venda de Pacote: ${svcName}`
            : `Atendimento: ${svcName}`;

        const billedAmount = options?.price ?? appt.price ?? svcDoc?.price ?? 0;

        // Income transaction (dedup on service-category only)
        const exists = await TransactionModel.findOne({ appointmentId: appt._id, type: 'income', category: { $ne: 'product' } });
        if (!exists) {
          const pm = (isPackageUse ? 'package' : (options?.paymentMethod || 'other')).toLowerCase();
          await TransactionModel.create({
            unitId: appt.unitId,
            appointmentId: appt._id,
            type: 'income',
            category,
            amount: billedAmount,
            description,
            date: appt.date,
            paymentMethod: pm,
            createdBy: appt.employeeId,
          });

          appt.isBilled = true;
          (appt as any).serviceBilled = true;
          await appt.save();
        }

        // ── When a package SALE is billed, activate the subscription and decrement one session ──
        if (isPackageSale && appt.clientId && svcDoc) {
          const client = clientDoc;
          if (client) {
            if (!client.packages) client.packages = [];

            let sub = client.packages.find(
              p => p.packageId.toString() === svcDoc._id.toString() && p.active
            );

            if (!sub) {
              let expiresAt: Date | undefined;
              const validity = (svcDoc as any).packageValidity;
              if (validity && validity.type && validity.type !== 'none' && validity.value) {
                const exp = new Date();
                if (validity.type === 'days')   exp.setDate(exp.getDate() + validity.value);
                if (validity.type === 'weeks')  exp.setDate(exp.getDate() + validity.value * 7);
                if (validity.type === 'months') exp.setMonth(exp.getMonth() + validity.value);
                if (validity.type === 'years')  exp.setFullYear(exp.getFullYear() + validity.value);
                expiresAt = exp;
              }

              client.packages.push({
                packageId: svcDoc._id as any,
                startDate: new Date(),
                active: true,
                expiresAt,
                itemLimits: (svcDoc.packageItems || []).map(pi => ({
                  serviceId: pi.serviceId,
                  quantity: pi.quantity,
                  used: 0,
                })),
              });
              sub = client.packages[client.packages.length - 1];
            }

            // Each billed package-sale appointment consumes one session of every included service
            if (sub?.itemLimits && sub.itemLimits.length > 0) {
              for (const limit of sub.itemLimits) {
                if ((limit.used || 0) < (limit.quantity || 0)) {
                  limit.used = (limit.used || 0) + 1;
                }
              }
              const allExhausted = sub.itemLimits.every(l => (l.used || 0) >= (l.quantity || 0));
              if (allExhausted) sub.active = false;
            }

            await client.save();
          }
        }

        // ── When a package USE is billed, increment the used session counter ──
        if (isPackageUse && appt.clientId && appt.usedPackageId && appt.serviceId) {
          const client = clientDoc;
          if (client) {
            const sub = client.packages?.find(
              p => p.packageId.toString() === appt.usedPackageId!.toString()
            );
            if (sub?.itemLimits) {
              const limit = sub.itemLimits.find(
                l => l.serviceId.toString() === appt.serviceId!.toString()
              );
              if (limit) {
                limit.used = (limit.used || 0) + 1;
                const allExhausted = sub.itemLimits.every(l => (l.used || 0) >= (l.quantity || 0));
                if (allExhausted) sub.active = false;
                await client.save();
              }
            }
          }
        }

        // ── Employee commission ──
        const employee = await UserModel.findById(appt.employeeId).select('commissionRate');
        if (employee?.commissionRate && employee.commissionRate > 0) {
          let commissionBase = billedAmount;
          if (isPackageUse) {
            commissionBase = appt.price;
          } else if (isPackageSale) {
            commissionBase = billedAmount; // price already prorated per session at appointment creation
          }
          const commissionAmount = Math.round(commissionBase * employee.commissionRate / 100 * 100) / 100;
          const commExists = await TransactionModel.findOne({ appointmentId: appt._id, type: 'commission' });
          if (!commExists) {
            await TransactionModel.create({
              unitId: appt.unitId,
              appointmentId: appt._id,
              employeeId: appt.employeeId,
              type: 'commission',
              category: 'commission',
              amount: commissionAmount,
              description: `Comissão (${isPackageUse ? 'Uso de Pacote' : isPackageSale ? 'Venda de Pacote' : 'Serviço'}): ${svcDoc?.name || 'Serviço'} (${employee.commissionRate}%)`,
              date: appt.date,
              createdBy: appt.employeeId,
            });
          }
        }
      }

      // ── Product sales — no commission, deduct from stock ──
      if (doProducts) {
        const { ProductModel } = await import('../inventory/product.model');
        for (const item of products!) {
          const prodExists = await TransactionModel.findOne({ appointmentId: appt._id, category: 'product', description: `Produto: ${item.name}` });
          if (!prodExists) {
            await TransactionModel.create({
              unitId: appt.unitId,
              appointmentId: appt._id,
              type: 'income',
              category: 'product',
              amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
              description: `Produto: ${item.name} (x${item.quantity})`,
              date: appt.date,
              paymentMethod: (options?.paymentMethod || 'other').toLowerCase(),
              createdBy: appt.employeeId,
            });
            await ProductModel.findByIdAndUpdate(item.productId, { $inc: { stockQuantity: -item.quantity } });
          }
        }
        (appt as any).productsBilled = true;
        await appt.save();
      }
    } else if (oldStatus === 'completed') {
      // If un-completing a billed appointment, remove the financial records and reset flags

      // Restore product stock before deleting transactions
      const products = (appt as any).products as Array<{ productId: mongoose.Types.ObjectId; quantity: number }> | undefined;
      if (products && products.length > 0) {
        const { ProductModel } = await import('../inventory/product.model');
        for (const item of products) {
          await ProductModel.findByIdAndUpdate(item.productId, { $inc: { stockQuantity: item.quantity } });
        }
      }

      await TransactionModel.deleteMany({ appointmentId: appt._id });
      appt.isBilled = false;
      (appt as any).serviceBilled = false;
      (appt as any).productsBilled = false;
      (appt as any).billingSkipped = false;
      await appt.save();

      // ── If it was a package SALE, remove the subscription that was created on billing ──
      if (!appt.usedPackageId && appt.isPackage && appt.clientId && appt.serviceId) {
        const svcForUnbill = await ServiceModel.findById(appt.serviceId).select('type');
        if (svcForUnbill?.type === 'package') {
          const client = await ClientModel.findById(appt.clientId);
          if (client?.packages) {
            const svcIdStr = appt.serviceId.toString();
            // Remove the most recently added active subscription for this package
            const idx = client.packages.map((p, i) => ({ p, i }))
              .reverse()
              .find(({ p }) => p.packageId.toString() === svcIdStr)?.i;
            if (idx !== undefined) {
              client.packages.splice(idx, 1);
              await client.save();
            }
          }
        }
      }

      // ── Decrement used session counter when a package use is un-billed ──
      if (appt.usedPackageId && appt.clientId && appt.serviceId) {
        const client = await ClientModel.findById(appt.clientId);
        if (client) {
          const sub = client.packages?.find(
            p => p.packageId.toString() === appt.usedPackageId!.toString()
          );
          if (sub?.itemLimits) {
            const limit = sub.itemLimits.find(
              l => l.serviceId.toString() === appt.serviceId!.toString()
            );
            if (limit && (limit.used || 0) > 0) {
              limit.used = (limit.used || 0) - 1;
              // Re-activate if it was auto-deactivated
              if (!sub.active) sub.active = true;
              await client.save();
            }
          }
        }
      }
    }

    return appt;
  }

  async delete(id: string, options?: { mode?: 'single' | 'this-and-future' }): Promise<void> {
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new NotFoundError('Appointment');
    if (appt.isBilled) {
      throw new AppError('Não é possível excluir um agendamento já faturado.', 400);
    }

    const mode = options?.mode || 'single';

    if (mode === 'this-and-future' && (appt as any).seriesId) {
      const toDelete = await AppointmentModel.find({
        seriesId: (appt as any).seriesId,
        date: { $gte: appt.date },
        isBilled: { $ne: true },
      });
      for (const a of toDelete) {
        await AppointmentModel.findByIdAndDelete(a._id);
        invalidateSlotCache(a.unitId.toString(), a.employeeId.toString(), a.date);
      }
    } else {
      await AppointmentModel.findByIdAndDelete(id);
      invalidateSlotCache(appt.unitId.toString(), appt.employeeId.toString(), appt.date);
    }
  }

  async update(id: string, data: Partial<IAppointment>): Promise<IAppointment> {
    const appt = await AppointmentModel.findById(id);
    if (!appt) throw new NotFoundError('Appointment');
    const internalOverride = data.source === 'admin';
    const isServiceChange = Boolean(
      data.serviceId && data.serviceId.toString() !== appt.serviceId?.toString()
    );
    const mustRecalculatePrice = isServiceChange || (!internalOverride && data.price !== undefined);
    const changesBilledService = appt.isBilled && (
      data.clientId !== undefined ||
      data.employeeId !== undefined ||
      data.serviceId !== undefined ||
      data.unitId !== undefined ||
      data.date !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.price !== undefined ||
      data.isPackage !== undefined ||
      data.usedPackageId !== undefined
    );
    const changesBilledProducts = appt.productsBilled && data.products !== undefined;

    if (changesBilledService || changesBilledProducts) {
      throw new AppError('Não é possível editar valores ou dados de um agendamento já faturado.', 400);
    }

    const mustUseServiceDuration = !internalOverride && Boolean(data.endTime);
    if ((data.startTime || data.serviceId || mustUseServiceDuration) && (data.serviceId || appt.serviceId)) {
      const svcId = data.serviceId || appt.serviceId;
      const svc = await ServiceModel.findById(svcId);
      if (svc && (!internalOverride || !data.endTime)) {
        data.endTime = calcEndTime(data.startTime || appt.startTime, svc.durationMinutes);
      }
    }

    if (mustRecalculatePrice && appt.status !== 'blocked') {
      const nextServiceId = data.serviceId || appt.serviceId;
      const nextClientId = data.clientId || appt.clientId;
      const svc = await ServiceModel.findById(nextServiceId);
      if (!svc) throw new NotFoundError('Service');

      let finalPrice = svc.price;
      let isPackage = svc.type === 'package';
      let usedPackageId: mongoose.Types.ObjectId | undefined;

      if (svc.type === 'package') {
        const totalSessions = svc.packageItems?.reduce((total, item) => total + (item.quantity || 1), 0) || 1;
        finalPrice = Math.round((svc.price / totalSessions) * 100) / 100;
      }
      if (svc.type === 'single' && nextClientId) {
        const client = await ClientModel.findById(nextClientId);
        if (client) {
          const packagePrice = await this.calculateProratedPrice(client, nextServiceId.toString());
          if (packagePrice.packageId) {
            finalPrice = packagePrice.price;
            usedPackageId = packagePrice.packageId;
            isPackage = true;
          }
        }
      }

      data.price = finalPrice;
      data.isPackage = isPackage;
      data.usedPackageId = usedPackageId;
    }

    if (data.startTime || data.endTime || data.serviceId || data.date || data.employeeId) {
      const checkDate = data.date || appt.date;

      // Validate working days
      const unit = await UnitModel.findById(appt.unitId).select('workingDays');
      if (!internalOverride && unit?.workingDays && unit.workingDays.length > 0) {
        const dayOfWeek = new Date(checkDate + 'T12:00:00').getDay();
        if (!unit.workingDays.includes(dayOfWeek)) {
          throw new AppError('A barbearia não funciona no dia selecionado.', 400);
        }
      }

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
    const saved = await appt.save();
    invalidateSlotCache(saved.unitId.toString(), saved.employeeId.toString(), saved.date);
    return this.findById(saved._id.toString());
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

  private async calculateProratedPrice(client: IClient, serviceId: string): Promise<{ price: number, packageId?: mongoose.Types.ObjectId }> {
    if (!client.packages || client.packages.length === 0) return { price: 0 };

    const now = new Date();

    // Find an active, non-expired package that contains this service and still has sessions left
    const activeSub = client.packages.find(p => {
      if (!p.active) return false;
      // Check expiration
      if (p.expiresAt && new Date(p.expiresAt) < now) return false;
      // Check if this service is in the package
      const hasService = p.packageId.toString() === serviceId ||
        p.itemLimits?.some(il => il.serviceId.toString() === serviceId);
      if (!hasService) return false;
      // Check if there are sessions remaining for this service
      const limit = p.itemLimits?.find(il => il.serviceId.toString() === serviceId);
      if (limit && (limit.used || 0) >= (limit.quantity || 0)) return false; // exhausted
      return true;
    });

    if (!activeSub) return { price: 0 };

    // Fetch the package details to get total price and total items
    const pkg = await ServiceModel.findById(activeSub.packageId);
    if (!pkg || pkg.type !== 'package') return { price: 0 };

    const totalItems = pkg.packageItems?.reduce((acc, item) => acc + item.quantity, 0) || 1;
    const proratedPrice = Math.round((pkg.price / totalItems) * 100) / 100;

    return { price: proratedPrice, packageId: pkg._id as mongoose.Types.ObjectId };
  }
}
