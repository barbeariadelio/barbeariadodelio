import axios from 'axios';
import { NotificationModel } from './notification.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { UnitModel } from '../units/unit.model';
import { logger } from '../../shared/utils/logger';

const EVOLUTION_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '') || '';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';

const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS_PT[m - 1]} de ${y}`;
}

function buildConfirmationText(opts: {
  clientName: string;
  serviceName: string;
  employeeName: string;
  date: string;
  time: string;
  unitName: string;
}): string {
  return (
    `Olá, ${opts.clientName.split(' ')[0]}! Seu agendamento foi confirmado.\n\n` +
    `Data: ${fmtDate(opts.date)}\n` +
    `Horário: ${opts.time}\n` +
    `Serviço: ${opts.serviceName}\n` +
    `Profissional: ${opts.employeeName}\n\n` +
    `Até lá! — ${opts.unitName}`
  );
}

function buildReminderText(opts: {
  clientName: string;
  serviceName: string;
  employeeName: string;
  date: string;
  time: string;
  unitName: string;
}): string {
  return (
    `Olá, ${opts.clientName.split(' ')[0]}! Lembrete do seu agendamento amanhã:\n\n` +
    `${fmtDate(opts.date)} às ${opts.time}\n` +
    `${opts.serviceName} com ${opts.employeeName}\n\n` +
    `Qualquer dúvida estamos à disposição. — ${opts.unitName}`
  );
}

async function sendViaEvolution(instance: string, toNumber: string, text: string): Promise<boolean> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !instance) return false;
  try {
    const num = toNumber.replace(/\D/g, '');
    const phone = num.startsWith('55') ? num : `55${num}`;
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${instance}`,
      { number: phone, text },
      { headers: { apikey: EVOLUTION_KEY }, timeout: 8000 },
    );
    logger.info({ instance, phone }, '[WHATSAPP] Mensagem enviada via Evolution API');
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ instance, err: msg }, '[WHATSAPP] Falha no envio via Evolution API');
    return false;
  }
}

function waLink(toNumber: string, text: string): string {
  const num = toNumber.replace(/\D/g, '');
  const phone = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

interface NotifyOptions {
  unitId: string;
  type: 'cancellation' | 'edit' | 'new';
  title: string;
  message: string;
  appointmentId?: string;
  external?: boolean;
}

class NotificationService {
  async notify(options: NotifyOptions) {
    const { unitId, type, title, message, appointmentId, external } = options;

    const notification = await NotificationModel.create({
      unitId,
      type,
      title,
      message,
      appointmentId,
    });

    if (external && appointmentId) {
      await this.sendWhatsApp(unitId, appointmentId, type).catch(() => null);
    }

    return notification;
  }

  private async sendWhatsApp(unitId: string, appointmentId: string, type: NotifyOptions['type']) {
    const [appt, unit] = await Promise.all([
      AppointmentModel.findById(appointmentId)
        .populate('clientId', 'name phone')
        .populate('serviceId', 'name')
        .populate('employeeId', 'name'),
      UnitModel.findById(unitId).select('name whatsappNumber whatsappInstance'),
    ]);

    if (!appt || !unit) return;

    const client   = appt.clientId   as { name?: string; phone?: string };
    const service  = appt.serviceId  as { name?: string };
    const employee = appt.employeeId as { name?: string };

    const clientPhone: string | undefined = client?.phone;
    if (!clientPhone) {
      logger.warn({ appointmentId }, '[WHATSAPP] Cliente sem telefone, pulando envio');
      return;
    }

    const msgData = {
      clientName:   client?.name  || 'Cliente',
      serviceName:  service?.name || 'Serviço',
      employeeName: employee?.name || 'Profissional',
      date:         appt.date,
      time:         appt.startTime,
      unitName:     unit.name,
    };

    const text = type === 'new'
      ? buildConfirmationText(msgData)
      : buildReminderText(msgData);

    const instance = unit.whatsappInstance || '';
    const sent = await sendViaEvolution(instance, clientPhone, text);

    if (!sent) {
      // Log the wa.me fallback URL so staff can copy/paste if needed
      logger.info({ waLink: waLink(clientPhone, text) }, '[WHATSAPP] Evolution API não configurada — link wa.me gerado');
    }
  }

  async list(unitId: string, limit = 20) {
    return NotificationModel.find({ unitId })
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'clientId', select: 'name phone' },
          { path: 'employeeId', select: 'name' },
          { path: 'serviceId', select: 'name' },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async markAsRead(id: string, userId: string) {
    return NotificationModel.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true },
    );
  }
}

export const notificationService = new NotificationService();
