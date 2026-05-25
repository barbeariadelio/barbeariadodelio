import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppointmentService } from '../appointment.service';
import { AppointmentModel } from '../appointment.model';
import { ServiceModel } from '../../services/service.model';

vi.mock('../appointment.model');
vi.mock('../../services/service.model');

describe('AppointmentService', () => {
  let service: AppointmentService;

  beforeEach(() => {
    service = new AppointmentService();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUnitAndDate', () => {
    it('should query appointments by unit and date range', async () => {
      const mockAppts = [{ _id: '1', date: '2026-05-12' }];
      const findMock = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockAppts),
        lean: vi.fn().mockResolvedValue(mockAppts),
      };
      
      (AppointmentModel.find as any).mockReturnValue(findMock);

      const result = await service.findByUnitAndDate('unit1', '2026-05-12');
      
      expect(AppointmentModel.find).toHaveBeenCalledWith(expect.objectContaining({
        unitId: 'unit1',
        date: '2026-05-12'
      }));
      expect(result).toEqual(mockAppts);
    });
  });

  describe('updateStatus', () => {
    it('should throw error if appointment not found', async () => {
      (AppointmentModel.findById as any).mockResolvedValue(null);
      
      await expect(service.updateStatus('invalid-id', 'completed'))
        .rejects.toThrow('Appointment não encontrado(a)');
    });

    it('should reject a different price after an appointment has been billed', async () => {
      (AppointmentModel.findById as any).mockResolvedValue({
        isBilled: true,
        price: 40,
        status: 'completed',
      });

      await expect(service.updateStatus('appointment-1', 'completed', { price: 20 }))
        .rejects.toThrow('Não é possível alterar o valor de um agendamento já faturado.');
    });
  });

  describe('update', () => {
    it('should reject financial changes after an appointment has been billed', async () => {
      (AppointmentModel.findById as any).mockResolvedValue({
        isBilled: true,
        productsBilled: false,
        serviceId: { toString: () => 'service-1' },
      });

      await expect(service.update('appointment-1', {
        serviceId: 'service-2' as any,
        price: 55,
      })).rejects.toThrow('Não é possível editar valores ou dados de um agendamento já faturado.');
    });

    it('should not accept a client-supplied price when editing an appointment', async () => {
      const appt = {
        _id: { toString: () => 'appointment-1' },
        isBilled: false,
        productsBilled: false,
        status: 'confirmed',
        serviceId: { toString: () => 'service-1' },
        price: 40,
        save: vi.fn(),
        unitId: { toString: () => 'unit-1' },
        employeeId: { toString: () => 'employee-1' },
        date: '2026-05-25',
      };
      appt.save.mockResolvedValue(appt);
      (AppointmentModel.findById as any).mockResolvedValue(appt);
      (ServiceModel.findById as any).mockResolvedValue({ type: 'single', price: 40 });
      vi.spyOn(service, 'findById').mockResolvedValue(appt as any);

      await service.update('appointment-1', { source: 'client', price: 1 } as any);

      expect(appt.price).toBe(40);
    });
  });
});
