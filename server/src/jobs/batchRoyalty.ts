/**
 * Batch Royalty Job
 *
 * Aggregates all income transactions for the previous day that don't yet have
 * a corresponding royalty entry, and creates a single consolidated royalty
 * transaction per unit — instead of one per income transaction.
 */
import mongoose from 'mongoose';
import { format, subDays } from 'date-fns';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

import { TransactionModel } from '../modules/finance/transaction.model';
import { FranchiseModel } from '../modules/franchise/franchise.model';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateIdx = args.indexOf('--date');
  const targetDate = dateIdx >= 0 && args[dateIdx + 1]
    ? args[dateIdx + 1]
    : format(subDays(new Date(), 1), 'yyyy-MM-dd');

  logger.info({ targetDate, dryRun }, '[batchRoyalty] Job started');

  await mongoose.connect(env.mongoUri);

  try {
    const franchises = await FranchiseModel.find({ royaltyPercent: { $gt: 0 } });
    if (franchises.length === 0) {
      logger.info('[batchRoyalty] No franchises with royaltyPercent > 0. Nothing to do.');
      return;
    }

    let totalCreated = 0;

    for (const franchise of franchises) {
      const unitIds = franchise.units.map((u: any) => u.toString());

      for (const unitId of unitIds) {
        const [incomeAgg] = await TransactionModel.aggregate([
          {
            $match: {
              unitId: new mongoose.Types.ObjectId(unitId),
              date: targetDate,
              type: 'income',
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ]);

        if (!incomeAgg || incomeAgg.total <= 0) continue;

        const existingRoyalty = await TransactionModel.findOne({
          unitId,
          date: targetDate,
          type: 'royalty',
          description: { $regex: /^\[Batch\]/ },
        });

        if (existingRoyalty) {
          logger.debug({ unitId, targetDate }, '[batchRoyalty] Royalty already exists, skipping');
          continue;
        }

        const royaltyAmount = Math.round((incomeAgg.total * franchise.royaltyPercent) / 100 * 100) / 100;

        logger.info({
          unitId,
          count: incomeAgg.count,
          totalIncome: incomeAgg.total,
          royaltyPercent: franchise.royaltyPercent,
          royaltyAmount
        }, '[batchRoyalty] Calculating royalty');

        if (!dryRun) {
          await TransactionModel.create({
            unitId,
            type: 'royalty',
            category: 'other',
            amount: royaltyAmount,
            description: `[Batch] Royalty ${franchise.royaltyPercent}% — ${targetDate} (${incomeAgg.count} receitas)`,
            date: targetDate,
            createdBy: franchise.franchisors?.[0] || unitId,
          });
          totalCreated++;
        }
      }
    }

    logger.info({ totalCreated, dryRun }, '[batchRoyalty] Job finished');
  } catch (err) {
    logger.error({ err }, '[batchRoyalty] Error during execution');
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  logger.fatal({ err }, '[batchRoyalty] Fatal error');
  process.exit(1);
});
