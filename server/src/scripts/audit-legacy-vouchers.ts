/**
 * Read-only report for vouchers marked as paid before voucher allocations
 * were introduced. Review this output before changing historical balances.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { TransactionModel } from '../modules/finance/transaction.model';

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const rows = await TransactionModel.aggregate([
      {
        $match: {
          type: 'expense',
          category: 'voucher',
          isPaid: true,
          $or: [
            { deductedAmount: { $exists: false } },
            { deductedAmount: 0 },
          ],
        },
      },
      {
        $group: {
          _id: { unitId: '$unitId', employeeId: '$employeeId' },
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          firstDate: { $min: '$date' },
          lastDate: { $max: '$date' },
          voucherIds: { $push: '$_id' },
        },
      },
      { $sort: { '_id.unitId': 1, '_id.employeeId': 1 } },
    ]);

    const report = rows.map(row => ({
      unitId: row._id.unitId?.toString(),
      employeeId: row._id.employeeId?.toString() ?? null,
      vouchers: row.count,
      amount: Math.round(row.amount * 100) / 100,
      firstDate: row.firstDate,
      lastDate: row.lastDate,
      voucherIds: row.voucherIds.map((id: mongoose.Types.ObjectId) => id.toString()),
    }));

    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), groups: report, totalGroups: report.length }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
