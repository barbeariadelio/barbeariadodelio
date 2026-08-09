import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  findByIdAndDelete: vi.fn(),
  findOneAndUpdate: vi.fn(),
  exists: vi.fn(),
  aggregate: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
}));

const productMocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('../transaction.model', () => ({
  TransactionModel: mocks,
}));
vi.mock('../../inventory/product.model', () => ({ ProductModel: productMocks }));

import { FinanceService } from '../finance.service';

const unitId = '64b000000000000000000001';
const employeeId = '64b000000000000000000002';
const userId = '64b000000000000000000003';

function queryResult(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }),
      lean: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe('FinanceService.registerPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exists.mockResolvedValue(false);
    mocks.aggregate.mockResolvedValue([]);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.updateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.create.mockImplementation(async (data: unknown) => data);
    mocks.findByIdAndUpdate.mockResolvedValue({ _id: 'transaction-1' });
    mocks.findByIdAndDelete.mockResolvedValue({ _id: 'transaction-1' });
  });

  it('deducts older pending vouchers before creating the employee payment', async () => {
    const commissions = [{
      _id: new mongoose.Types.ObjectId('64b000000000000000000011'),
      amount: 180,
      date: '2026-08-12',
    }];
    const vouchers = [
      { _id: new mongoose.Types.ObjectId('64b000000000000000000021'), amount: 100, deductedAmount: 0, date: '2026-08-10' },
      { _id: new mongoose.Types.ObjectId('64b000000000000000000022'), amount: 40, deductedAmount: 0, date: '2026-08-11' },
    ];

    mocks.find.mockImplementation((query: Record<string, unknown>) => {
      if (query.category === 'commission') return queryResult(commissions);
      if (query.category === 'voucher') return queryResult(vouchers);
      throw new Error('Consulta de transaÃ§Ã£o inesperada');
    });

    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    const payment = await service.registerPayment(
      userId,
      'owner',
      unitId,
      employeeId,
      [commissions[0]._id.toString()],
      180,
      'Pagamento semanal',
      '2026-08-12',
    ) as any;

    expect(payment.amount).toBe(40);
  });

  it('keeps the unused balance on the oldest voucher after a partial payment', async () => {
    const commissions = [{
      _id: new mongoose.Types.ObjectId('64b000000000000000000011'),
      amount: 90,
      date: '2026-08-12',
    }];
    const vouchers = [
      { _id: new mongoose.Types.ObjectId('64b000000000000000000021'), amount: 100, deductedAmount: 0, date: '2026-08-10' },
      { _id: new mongoose.Types.ObjectId('64b000000000000000000022'), amount: 40, deductedAmount: 0, date: '2026-08-11' },
    ];
    mocks.find.mockImplementation((query: Record<string, unknown>) =>
      query.category === 'commission' ? queryResult(commissions) : queryResult(vouchers),
    );
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    const payment = await service.registerPayment(
      userId, 'owner', unitId, employeeId, [commissions[0]._id.toString()], 999, 'Pagamento semanal', '2026-08-12',
    ) as any;

    expect(payment.amount).toBe(0);
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: vouchers[0]._id }),
      expect.objectContaining({ $inc: { deductedAmount: 90 } }),
    );
  });

  it('previews the exact net amount the payment will record, without writing', async () => {
    const commissions = [{
      _id: new mongoose.Types.ObjectId('64b000000000000000000011'),
      amount: 180,
      date: '2026-08-12',
    }];
    const vouchers = [
      { _id: new mongoose.Types.ObjectId('64b000000000000000000021'), amount: 100, deductedAmount: 0, description: 'Vale: adiantamento', date: '2026-08-10' },
      { _id: new mongoose.Types.ObjectId('64b000000000000000000022'), amount: 40, deductedAmount: 0, description: 'Vale', date: '2026-08-11' },
    ];
    mocks.find.mockImplementation((query: Record<string, unknown>) =>
      query.category === 'commission' ? queryResult(commissions) : queryResult(vouchers),
    );
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    const preview = await service.previewPayment(
      userId, 'owner', unitId, employeeId, [commissions[0]._id.toString()], '2026-08-12',
    );

    expect(preview.commissionTotal).toBe(180);
    expect(preview.voucherDeduction).toBe(140);
    expect(preview.netAmount).toBe(40);
    expect(preview.vouchers).toHaveLength(2);

    // Looking at a payment must never settle anything.
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();

    const payment = await service.registerPayment(
      userId, 'owner', unitId, employeeId, [commissions[0]._id.toString()], 999, 'Pagamento semanal', '2026-08-12',
    ) as any;

    expect(payment.amount).toBe(preview.netAmount);
  });

  it('agrees between preview and payment on amounts that sum with float error', async () => {
    // 10.1 + 20.2 + 30.3 === 60.59999999999999 in IEEE-754. If the two paths
    // rounded that sum at different points they could allocate a cent
    // differently and quote a payout the ledger would not record.
    const commissions = [
      { _id: new mongoose.Types.ObjectId('64b000000000000000000011'), amount: 10.1, date: '2026-08-12' },
      { _id: new mongoose.Types.ObjectId('64b000000000000000000012'), amount: 20.2, date: '2026-08-12' },
      { _id: new mongoose.Types.ObjectId('64b000000000000000000013'), amount: 30.3, date: '2026-08-12' },
    ];
    const vouchers = [
      { _id: new mongoose.Types.ObjectId('64b000000000000000000021'), amount: 20.2, deductedAmount: 0, date: '2026-08-10' },
    ];
    mocks.find.mockImplementation((query: Record<string, unknown>) =>
      query.category === 'commission' ? queryResult(commissions) : queryResult(vouchers),
    );
    mocks.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    const ids = commissions.map(c => c._id.toString());
    const preview = await service.previewPayment(userId, 'owner', unitId, employeeId, ids, '2026-08-12');
    const payment = await service.registerPayment(
      userId, 'owner', unitId, employeeId, ids, 0, 'Pagamento semanal', '2026-08-12',
    ) as any;

    expect(preview.commissionTotal).toBe(60.6);
    expect(preview.voucherDeduction).toBe(20.2);
    expect(preview.netAmount).toBe(40.4);
    expect(payment.amount).toBe(preview.netAmount);
  });

  it('scopes the preview to the selected commissions and to vouchers up to the payment date', async () => {
    const selectedId = new mongoose.Types.ObjectId('64b000000000000000000011');
    mocks.find.mockImplementation((query: Record<string, unknown>) =>
      query.category === 'commission' ? queryResult([{ _id: selectedId, amount: 50, date: '2026-08-12' }]) : queryResult([]),
    );
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await service.previewPayment(userId, 'owner', unitId, employeeId, [selectedId.toString()], '2026-08-12');

    // Only the rows the user ticked — not every pending commission in the period.
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({
      _id: { $in: [selectedId] },
      category: 'commission',
      isPaid: { $ne: true },
    }));
    // Voucher window follows the payment date, never the report's date filter.
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({
      category: 'voucher',
      isPaid: { $ne: true },
      date: { $lte: '2026-08-12' },
    }));
  });

  it('returns a zeroed preview instead of throwing when no commission id is valid', async () => {
    mocks.find.mockImplementation(() => queryResult([]));
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    const preview = await service.previewPayment(
      userId, 'owner', unitId, employeeId, ['not-an-object-id'], '2026-08-12',
    );

    expect(preview.commissionCount).toBe(0);
    expect(preview.commissionTotal).toBe(0);
    expect(preview.netAmount).toBe(0);
  });

  it('does not finalize a payment when another request already paid its commissions', async () => {
    const commissions = [{
      _id: new mongoose.Types.ObjectId('64b000000000000000000011'),
      amount: 100,
      date: '2026-08-12',
    }];
    mocks.find.mockImplementation((query: Record<string, unknown>) =>
      query.category === 'commission' ? queryResult(commissions) : queryResult([]),
    );
    mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect(service.registerPayment(
      userId, 'owner', unitId, employeeId, [commissions[0]._id.toString()], 100, 'Pagamento semanal', '2026-08-12',
    )).rejects.toMatchObject({ statusCode: 409 });

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects manually marking a voucher as paid outside the payment flow', async () => {
    mocks.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        unitId: { toString: () => unitId },
        category: 'voucher',
      }),
    });
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect(service.update(
      '64b000000000000000000021',
      { isPaid: true } as any,
      userId,
      'owner',
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects manually creating a salary ledger entry', async () => {
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect(service.create({
      unitId: unitId as any,
      employeeId: employeeId as any,
      type: 'expense',
      category: 'salary',
      amount: 100,
      description: 'Pagamento manual',
      date: '2026-08-12',
    } as any, userId, 'owner', unitId)).rejects.toMatchObject({ statusCode: 403 });

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a product sale with insufficient stock before creating income', async () => {
    productMocks.findOneAndUpdate.mockResolvedValue(null);
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect((service as any).registerProductSale(
      userId,
      'owner',
      unitId,
      [{ productId: '64b000000000000000000051', quantity: 2 }],
      'pix',
      '2026-08-12',
    )).rejects.toMatchObject({ statusCode: 400 });

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects generic updates to a transaction generated by an appointment', async () => {
    mocks.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        unitId: { toString: () => unitId },
        category: 'service',
        appointmentId: new mongoose.Types.ObjectId('64b000000000000000000031'),
      }),
    });
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect(service.update(
      '64b000000000000000000032',
      { amount: 1 } as any,
      userId,
      'owner',
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects generic deletion of a transaction generated by an appointment', async () => {
    mocks.findById.mockResolvedValue({
      unitId: { toString: () => unitId },
      appointmentId: new mongoose.Types.ObjectId('64b000000000000000000041'),
      type: 'income',
      category: 'service',
    });
    const service = new FinanceService();
    vi.spyOn(service as any, 'resolveUnitIds').mockResolvedValue([unitId]);

    await expect(service.delete(
      '64b000000000000000000042',
      userId,
      'owner',
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('counts the salary payment once instead of double-counting its commission accrual', () => {
    const service = new FinanceService();
    const unit = { _id: { toString: () => unitId }, name: 'Unidade Centro' };

    const summary = (service as any).buildSummary([
      { unitId: unit, type: 'commission', category: 'commission', amount: 50, date: '2026-08-12' },
      { unitId: unit, type: 'expense', category: 'salary', amount: 50, date: '2026-08-12' },
    ], [], [unit]);

    expect(summary.totalExpense).toBe(50);
    expect(summary.netProfit).toBe(-50);
  });
});
