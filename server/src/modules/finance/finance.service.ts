import { TransactionModel, ITransaction } from './transaction.model';
import { UnitModel } from '../units/unit.model';
import type { FinanceSummary, TransactionCategory } from '@barber/types';

export class FinanceService {
  async getSummary(
    userId: string,
    role: string,
    unitId?: string,
    period: 'month' | 'week' | 'year' = 'month',
  ): Promise<FinanceSummary> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId);
    const { startDate, endDate } = this.resolvePeriod(period);

    const transactions = await TransactionModel.find({
      unitId: { $in: unitIds },
      date: { $gte: startDate, $lte: endDate },
    });

    return this.buildSummary(transactions);
  }

  async getTransactions(unitId: string, page: number, limit: number): Promise<{ data: ITransaction[]; total: number }> {
    const [data, total] = await Promise.all([
      TransactionModel.find({ unitId })
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      TransactionModel.countDocuments({ unitId }),
    ]);
    return { data, total };
  }

  async create(data: Partial<ITransaction>): Promise<ITransaction> {
    const transaction = await TransactionModel.create(data);
    await this.maybeCreateRoyalty(transaction);
    return transaction;
  }

  private async maybeCreateRoyalty(transaction: ITransaction): Promise<void> {
    if (transaction.type !== 'income') return;

    const { FranchiseModel } = await import('../franchise/franchise.model');
    const franchise = await FranchiseModel.findOne({ units: transaction.unitId });
    if (!franchise || franchise.royaltyPercent <= 0) return;

    const royaltyAmount = Math.round((transaction.amount * franchise.royaltyPercent) / 100 * 100) / 100;
    await TransactionModel.create({
      unitId: transaction.unitId,
      type: 'royalty',
      category: 'other',
      amount: royaltyAmount,
      description: `Royalty ${franchise.royaltyPercent}% — ${transaction.description}`,
      date: transaction.date,
      createdBy: transaction.createdBy,
    });
  }

  private async resolveUnitIds(userId: string, role: string, unitId?: string): Promise<string[]> {
    if (unitId && unitId !== 'all') return [unitId];

    if (role === 'owner') {
      const units = await UnitModel.find({ ownerId: userId, isActive: true }).select('_id');
      return units.map(u => u._id.toString());
    }

    if (role === 'franchisor') {
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const franchise = await FranchiseModel.findOne({ franchisors: userId });
      return franchise ? franchise.units.map(u => u.toString()) : [];
    }

    if (role === 'franchisee') {
      const user = await UnitModel.findOne({ _id: userId });
      return user ? [userId] : [];
    }

    return [];
  }

  private resolvePeriod(period: string): { startDate: string; endDate: string } {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (period === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startDate: fmt(start), endDate: fmt(end) };
    }

    if (period === 'year') {
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    }

    // month (default)
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${lastDay}` };
  }

  private buildSummary(transactions: ITransaction[]): FinanceSummary {
    let totalIncome = 0;
    let totalExpense = 0;
    const byUnitMap = new Map<string, { unitId: string; name: string; income: number; expense: number; profit: number }>();
    const byCategoryMap = new Map<TransactionCategory, number>();

    for (const t of transactions) {
      const unitKey = t.unitId.toString();
      if (!byUnitMap.has(unitKey)) {
        byUnitMap.set(unitKey, { unitId: unitKey, name: '', income: 0, expense: 0, profit: 0 });
      }
      const unit = byUnitMap.get(unitKey)!;

      if (t.type === 'income') {
        totalIncome += t.amount;
        unit.income += t.amount;
      } else if (t.type === 'expense') {
        totalExpense += t.amount;
        unit.expense += t.amount;
      }
      unit.profit = unit.income - unit.expense;

      const prev = byCategoryMap.get(t.category) ?? 0;
      byCategoryMap.set(t.category, prev + t.amount);
    }

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      byUnit: Array.from(byUnitMap.values()),
      byCategory: Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount })),
      chart: [],
    };
  }
}
