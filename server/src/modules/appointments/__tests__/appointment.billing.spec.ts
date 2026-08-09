import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appointmentFindById: vi.fn(),
  transactionDeleteMany: vi.fn(),
  productUpdate: vi.fn(),
}));

vi.mock('../appointment.model', () => ({ AppointmentModel: { findById: mocks.appointmentFindById } }));
vi.mock('../../finance/transaction.model', () => ({ TransactionModel: { deleteMany: mocks.transactionDeleteMany } }));
vi.mock('../../inventory/product.model', () => ({ ProductModel: { findByIdAndUpdate: mocks.productUpdate } }));
vi.mock('../../services/service.model', () => ({ ServiceModel: {} }));
vi.mock('../../clients/client.model', () => ({ ClientModel: {} }));
vi.mock('../../auth/auth.model', () => ({ UserModel: {} }));
vi.mock('../../units/unit.model', () => ({ UnitModel: {} }));

import { AppointmentService } from '../appointment.service';

describe('AppointmentService.updateStatus billing reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionDeleteMany.mockResolvedValue({});
  });

  it('does not restore stock for products that were never billed', async () => {
    const appointment = {
      _id: 'appointment-1',
      status: 'completed',
      isBilled: false,
      productsBilled: false,
      products: [{ productId: 'product-1', quantity: 2 }],
      unitId: { toString: () => 'unit-1' },
      employeeId: { toString: () => 'employee-1' },
      date: '2026-08-10',
      save: vi.fn(),
    };
    appointment.save.mockResolvedValue(appointment);
    mocks.appointmentFindById.mockResolvedValue(appointment);

    const service = new AppointmentService();
    await service.updateStatus('appointment-1', 'confirmed');

    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });
});
