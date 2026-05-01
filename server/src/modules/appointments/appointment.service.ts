import { AppointmentModel, IAppointment } from './appointment.model';
import { NotFoundError, AppError } from '../../shared/errors/AppError';
import type { AppointmentStatus } from '@barber/types';

export class AppointmentService {
  async findByUnitAndDate(unitId: string, date?: string): Promise<IAppointment[]> {
    const filter: Record<string, unknown> = { unitId };
    if (date) filter.date = date;
    return AppointmentModel.find(filter)
      .populate('clientId', 'name phone')
      .populate('employeeId', 'name')
      .populate('serviceId', 'name durationMinutes')
      .sort({ startTime: 1 });
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
      .sort({ date: -1, startTime: -1 });
  }

  async getAvailableSlots(
    unitId: string,
    employeeId: string,
    date: string,
    durationMinutes: number,
  ): Promise<string[]> {
    const booked = await AppointmentModel.find({
      unitId,
      employeeId,
      date,
      status: { $nin: ['cancelled'] },
    }).select('startTime endTime');

    const allSlots = this.generateSlots('08:00', '18:00', durationMinutes);
    return allSlots.filter(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      const slotEnd = slotStart + durationMinutes;
      return !booked.some(b => {
        const [bsh, bsm] = b.startTime.split(':').map(Number);
        const [beh, bem] = b.endTime.split(':').map(Number);
        const bookedStart = bsh * 60 + bsm;
        const bookedEnd = beh * 60 + bem;
        return slotStart < bookedEnd && slotEnd > bookedStart;
      });
    });
  }

  async create(data: Partial<IAppointment>): Promise<IAppointment> {
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
    if (conflict) throw new AppError('Time slot already booked', 409);
    return AppointmentModel.create(data);
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<IAppointment> {
    const appt = await AppointmentModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!appt) throw new NotFoundError('Appointment');
    return appt;
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
