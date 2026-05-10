export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';

export interface Appointment {
  _id: string;
  clientId: string;
  employeeId: string;
  serviceId: string;
  unitId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  price: number;
  isPackage?: boolean;
  client?: { name: string; phone: string };
  employee?: { name: string };
  service?: { name: string; durationMinutes: number };
  createdAt: string;
}
