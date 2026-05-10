import { TransactionModel, ITransaction } from './transaction.model';
import { UnitModel } from '../units/unit.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { UserModel } from '../auth/auth.model';
import type { FinanceSummary, TransactionCategory } from '@barber/types';

export class FinanceService {
  async getSummary(
    userId: string,
    role: string,
    unitId?: string,
    period: 'day' | 'month' | 'week' | 'year' = 'month',
  ): Promise<FinanceSummary> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId);
    const { startDate, endDate } = this.resolvePeriod(period);

    console.log(`[FinanceService] getSummary: userId=${userId}, role=${role}, unitIdParam=${unitId}`);
    console.log(`[FinanceService] Resolved unitIds:`, unitIds);
    console.log(`[FinanceService] Period: ${startDate} to ${endDate}`);

    const transactions = await TransactionModel.find({
      unitId: { $in: unitIds },
      date: { $gte: startDate, $lte: endDate },
    }).populate('unitId', 'name');

    const appointments = await AppointmentModel.find({
      unitId: { $in: unitIds },
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed', 'completed'] },
    })
      .populate('serviceId', 'name price')
      .populate('employeeId', 'name commissionRate')
      .populate('unitId', 'name');

    console.log(`[FinanceService] Data Detail:`);
    transactions.forEach(t => console.log(`  - TX: ${t.type}, ${t.amount}, ${t.description}`));
    appointments.forEach(a => console.log(`  - Appt: ${(a as any).status}, ${(a as any).serviceId?.name}, ${a.date}`));

    console.log(`[FinanceService] Found ${transactions.length} transactions and ${appointments.length} appointments`);

    return this.buildSummary(transactions, appointments as any);
  }

  async getTransactions(userId: string, role: string, unitId: string, page: number, limit: number): Promise<{ data: ITransaction[]; total: number }> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId);
    
    const [data, total] = await Promise.all([
      TransactionModel.find({ unitId: { $in: unitIds } })
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('unitId', 'name'),
      TransactionModel.countDocuments({ unitId: { $in: unitIds } }),
    ]);
    return { data, total };
  }

  async create(data: Partial<ITransaction>): Promise<ITransaction> {
    const transaction = await TransactionModel.create(data);
    await this.maybeCreateRoyalty(transaction);
    return transaction;
  }

  async update(id: string, data: Partial<ITransaction>): Promise<ITransaction | null> {
    const transaction = await TransactionModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    // Note: updating royalty logic could be complex if amount changes, for now we just update the tx.
    return transaction;
  }

  async delete(id: string): Promise<void> {
    const tx = await TransactionModel.findById(id);
    if (!tx) return;
    
    // If it's income, we should probably delete the linked royalty tx too
    if (tx.type === 'income') {
      await TransactionModel.deleteMany({ 
        unitId: tx.unitId, 
        description: { $regex: new RegExp(`Royalty .* — ${tx.description}`) },
        date: tx.date 
      });
    }

    await TransactionModel.findByIdAndDelete(id);
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
    const allowedIds = await this.getAllowedUnitIds(userId, role);
    console.log(`[FinanceService] getAllowedUnitIds for ${userId} (${role}):`, allowedIds);
    
    if (unitId && unitId !== 'all') {
      // If owner, trust the unitIdParam
      if (role === 'owner') {
        console.log(`[FinanceService] Owner requesting specific unit: ${unitId}. Granting access.`);
        return [unitId];
      }

      if (allowedIds.includes(unitId)) return [unitId];
      
      const user = await UserModel.findById(userId).select('unitId');
      console.log(`[FinanceService] User fallback check for unitId ${unitId}: user.unitId=${user?.unitId}`);
      if (user?.unitId?.toString() === unitId) return [unitId];

      return [];
    }

    return allowedIds;
  }

  private async getAllowedUnitIds(userId: string, role: string): Promise<string[]> {
    if (role === 'owner') {
      const units = await UnitModel.find({ 
        $or: [
          { ownerId: userId },
          { _id: (await UserModel.findById(userId).select('unitId'))?.unitId }
        ],
        isActive: true 
      }).select('_id');
      return units.map(u => u._id.toString());
    }

    if (role === 'franchisor') {
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const franchise = await FranchiseModel.findOne({ franchisors: userId });
      return franchise ? franchise.units.map(u => u.toString()) : [];
    }

    if (role === 'franchisee' || role === 'employee' || role === 'admin') {
      const user = await UserModel.findById(userId).select('unitId');
      return user?.unitId ? [user.unitId.toString()] : [];
    }

    return [];
  }

  private resolvePeriod(period: string): { startDate: string; endDate: string } {
    // Force Brazil/Sao_Paulo timezone for date calculations
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (period === 'day') {
      const today = fmt(now);
      return { startDate: today, endDate: today };
    }

    if (period === 'week') {
      const start = new Date(now);
      const day = now.getDay();
      start.setDate(now.getDate() - day);
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

  private buildSummary(transactions: any[], appointments: any[]): FinanceSummary {
    let totalIncome = 0;
    let totalExpense = 0;
    const byUnitMap = new Map<string, { unitId: string; name: string; income: number; expense: number; profit: number }>();
    const byCategoryMap = new Map<TransactionCategory, number>();
    const dailyMap = new Map<string, { date: string; income: number; expense: number }>();

    // 1. Process Transactions (Cash Flow)
    for (const t of transactions) {
      const unitKey = t.unitId?._id?.toString() || t.unitId?.toString();
      if (!unitKey) continue;

      if (!byUnitMap.has(unitKey)) {
        byUnitMap.set(unitKey, { unitId: unitKey, name: t.unitId?.name || 'Unidade', income: 0, expense: 0, profit: 0 });
      }
      const unit = byUnitMap.get(unitKey)!;
      if (!unit.name && t.unitId?.name) unit.name = t.unitId.name;

      if (!dailyMap.has(t.date)) {
        dailyMap.set(t.date, { date: t.date, income: 0, expense: 0 });
      }
      const day = dailyMap.get(t.date)!;

      if (t.type === 'income') {
        totalIncome += t.amount;
        unit.income += t.amount;
        day.income += t.amount;
      } else if (t.type === 'expense') {
        totalExpense += t.amount;
        unit.expense += t.amount;
        day.expense += t.amount;
      }
      unit.profit = unit.income - unit.expense;

      const prev = byCategoryMap.get(t.category) ?? 0;
      byCategoryMap.set(t.category, prev + t.amount);
    }

    // 2. Process Appointments (Work Metrics & Commissions)
    const byServiceMap = new Map<string, { name: string; revenue: number; count: number; unitId: string; unitName: string }>();
    const byEmployeeMap = new Map<string, {
      id: string; name: string;
      unitId: string; unitName: string;
      appointments: number;
      grossRevenue: number;
      commissionRate?: number;
    }>();

    for (const appt of appointments) {
      const price = appt.price || (appt.serviceId?.price ?? 0);
      const svcName = appt.serviceId?.name || 'Outro';
      const unitId = appt.unitId?._id?.toString() || appt.unitId?.toString() || '';
      const unitName = appt.unitId?.name || '';
      const status = (appt as any).status;

      // Add to total income if confirmed or completed to show real business movement
      if (status === 'confirmed' || status === 'completed') {
        totalIncome += price;
      }

      // Stats by service (unit-aware)
      const svcKey = `${unitId}-${svcName}`;
      if (!byServiceMap.has(svcKey)) {
        byServiceMap.set(svcKey, { name: svcName, revenue: 0, count: 0, unitId, unitName });
      }
      const svcEntry = byServiceMap.get(svcKey)!;
      svcEntry.revenue += price;
      svcEntry.count += 1;

      // Stats by employee
      const empId = appt.employeeId?._id?.toString() || appt.employeeId?.toString() || 'unknown';
      const empName = appt.employeeId?.name || 'Profissional';
      const unitKey = unitId;

      if (!byEmployeeMap.has(empId)) {
        byEmployeeMap.set(empId, { 
          id: empId, 
          name: empName, 
          unitId: unitKey, 
          unitName, 
          appointments: 0, 
          grossRevenue: 0,
          commissionRate: appt.employeeId?.commissionRate 
        });
      }
      const empEntry = byEmployeeMap.get(empId)!;
      empEntry.appointments += 1;
      empEntry.grossRevenue += price;

      if (unitKey) {
        if (!byUnitMap.has(unitKey)) {
          byUnitMap.set(unitKey, { unitId: unitKey, name: unitName || 'Unidade', income: 0, expense: 0, profit: 0 });
        }
        const unit = byUnitMap.get(unitKey)!;
        if (status === 'confirmed' || status === 'completed') {
          unit.income += price;
          unit.profit = unit.income - unit.expense;
        }
      }
    }

    const chart = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      byUnit: Array.from(byUnitMap.values()),
      byCategory: Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount })),
      byService: Array.from(byServiceMap.values()),
      byEmployee: Array.from(byEmployeeMap.values()),
      chart,
    };
  }
}
