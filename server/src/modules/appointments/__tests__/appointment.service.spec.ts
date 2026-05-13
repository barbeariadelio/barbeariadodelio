import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppointmentService } from '../appointment.service';
import { AppointmentModel } from '../appointment.model';

vi.mock('../appointment.model');

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
        .rejects.toThrow('Appointment not found');
    });
  });
});
