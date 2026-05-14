import mongoose from 'mongoose';
import { TransactionModel, ITransaction } from './transaction.model';
import { UnitModel } from '../units/unit.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { UserModel } from '../auth/auth.model';
import type { FinanceSummary, TransactionCategory } from '@barber/types';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { toDate } from 'date-fns-tz';
import { escapeRegex } from '../../shared/utils/regex';

export class FinanceService {
  async getSummary(
    userId: string,
    role: string,
    unitId?: string,
    period: 'day' | 'month' | 'week' | 'year' = 'month',
  ): Promise<FinanceSummary> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId);
    const { startDate, endDate } = this.resolvePeriod(period);

    const transactions = await TransactionModel.find({
      unitId: { $in: unitIds },
      date: { $gte: startDate, $lte: endDate },
    }).populate('unitId', 'name').populate('employeeId', 'name');

    const appointments = await AppointmentModel.find({
      unitId: { $in: unitIds },
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed', 'completed'] },
    })
      .populate('serviceId', 'name price')
      .populate('employeeId', 'name commissionRate')
      .populate('unitId', 'name');

    const unitsInfo = await UnitModel.find({ _id: { $in: unitIds } }).select('name');

    return this.buildSummary(transactions, appointments as any, unitsInfo);
  }

  async getTransactions(userId: string, role: string, unitId: string, page: number, limit: number, filters?: { employeeId?: string; category?: string }): Promise<{ data: ITransaction[]; total: number }> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId);
    
    const query: any = { unitId: { $in: unitIds } };
    if (filters?.employeeId) query.employeeId = filters.employeeId;
    if (filters?.category) query.category = filters.category;

    const [data, total] = await Promise.all([
      TransactionModel.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('unitId', 'name'),
      TransactionModel.countDocuments(query),
    ]);
    return { data, total };
  }

  async create(data: Partial<ITransaction>): Promise<ITransaction> {
    const transaction = await TransactionModel.create(data);
    // Royalty creation is now handled by the nightly batch job:
    // server/src/jobs/batchRoyalty.ts
    return transaction;
  }

  async update(id: string, data: Partial<ITransaction>): Promise<ITransaction | null> {
    const transaction = await TransactionModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    // Note: updating royalty logic could be complex if amount changes, for now we just update the tx.
    return transaction;
  }

  async delete(id: string): Promise<void> {
    const tx = await TransactionModel.findById(id);
    if (!tx) return;
    
    // If it's income, we should probably delete the linked royalty tx too
    if (tx.type === 'income') {
      const safeDesc = escapeRegex(tx.description);
      await TransactionModel.deleteMany({ 
        unitId: tx.unitId, 
        description: { $regex: new RegExp(`Royalty .* — ${safeDesc}`) },
        date: tx.date 
      });
    }

    await TransactionModel.findByIdAndDelete(id);
  }

  /**
   * Royalty creation has been moved to the batch job: server/src/jobs/batchRoyalty.ts
   * Run nightly via cron: npx tsx server/src/jobs/batchRoyalty.ts
   * This consolidates all income for a given date into a single royalty transaction
   * per unit, reducing write load during high-traffic hours.
   */

  private async resolveUnitIds(userId: string, role: string, unitId?: string): Promise<string[]> {
    const allowedIds = await this.getAllowedUnitIds(userId, role);
    
    if (unitId && unitId !== 'all') {
      const isPrivileged = ['owner', 'franchisor', 'admin'].includes(role);
      if (isPrivileged) return [unitId];
      
      const user = await UserModel.findById(userId).select('unitId');
      if (user?.unitId?.toString() === unitId) return [unitId];

      return [];
    }

    return allowedIds;
  }

  private async getAllowedUnitIds(userId: string, role: string): Promise<string[]> {
    if (role === 'owner') {
      const ownerObjectId = new mongoose.Types.ObjectId(userId);
      const userDoc = await UserModel.findById(userId).select('unitId');
      const orClause: any[] = [{ ownerId: ownerObjectId }];
      if (userDoc?.unitId) orClause.push({ _id: userDoc.unitId });
      const units = await UnitModel.find({ $or: orClause, isActive: true }).select('_id');
      const ownIds = units.map(u => u._id.toString());

      // Also include franchise units where this owner is listed as a franchisor
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const franchise = await FranchiseModel.findOne({ franchisors: ownerObjectId });
      if (franchise && franchise.units.length > 0) {
        const franchiseIds = franchise.units.map(u => u.toString());
        return [...new Set([...ownIds, ...franchiseIds])];
      }

      return ownIds;
    }

    if (role === 'franchisor') {
      const { FranchiseModel } = await import('../franchise/franchise.model');
      const franchisorObjectId = new mongoose.Types.ObjectId(userId);
      const franchise = await FranchiseModel.findOne({ franchisors: franchisorObjectId });
      return franchise ? franchise.units.map(u => u.toString()) : [];
    }

    if (role === 'admin') {
      const units = await UnitModel.find({ isActive: true }).select('_id');
      return units.map(u => u._id.toString());
    }

    if (role === 'franchisee' || role === 'employee' || role === 'cashier') {
      const user = await UserModel.findById(userId).select('unitId');
      return user?.unitId ? [user.unitId.toString()] : [];
    }

    return [];
  }

  private resolvePeriod(period: string): { startDate: string; endDate: string } {
    const timeZone = 'America/Sao_Paulo';
    const now = toDate(new Date(), { timeZone });
    
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

    if (period === 'day') {
      const today = fmt(now);
      return { startDate: today, endDate: today };
    }

    if (period === 'week') {
      const start = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
      const end = endOfWeek(now, { weekStartsOn: 0 });
      return { startDate: fmt(start), endDate: fmt(end) };
    }

    if (period === 'year') {
      const start = startOfYear(now);
      const end = endOfYear(now);
      return { startDate: fmt(start), endDate: fmt(end) };
    }

    // month (default)
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return { startDate: fmt(start), endDate: fmt(end) };
  }

  private buildSummary(transactions: any[], appointments: any[], unitsInfo: any[] = []): FinanceSummary {
    let totalIncome = 0;
    let totalExpense = 0;
    let realizedIncome = 0;   // completed only
    let projectedIncome = 0;  // confirmed (not yet completed)
    const byUnitMap = new Map<string, { unitId: string; name: string; income: number; expense: number; profit: number }>();
    
    // Pre-populate with all relevant units
    for (const u of unitsInfo) {
      byUnitMap.set(u._id.toString(), { 
        unitId: u._id.toString(), 
        name: u.name, 
        income: 0, 
        expense: 0, 
        profit: 0 
      });
    }

    const byCategoryMap = new Map<TransactionCategory, number>();
    const byEmployeeMap = new Map<string, {
      id: string; name: string;
      unitId: string; unitName: string;
      appointments: number;
      grossRevenue: number;
      commissionRate?: number;
      commissionAmount?: number;
      totalVouchers: number;
    }>();
    const dailyMap = new Map<string, { date: string; income: number; expense: number }>();

    // 1. Process Transactions (Cash Flow — realized)
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
        realizedIncome += t.amount;
        unit.income += t.amount;
        day.income += t.amount;
      } else if (t.type === 'expense' || t.type === 'commission') {
        totalExpense += t.amount;
        unit.expense += t.amount;
        day.expense += t.amount;
      }
      const prev = byCategoryMap.get(t.category) ?? 0;
      byCategoryMap.set(t.category, prev + t.amount);

      // Track vouchers per employee
      if (t.category === 'voucher' && t.employeeId) {
        const empId = (t.employeeId as any)._id?.toString() || t.employeeId.toString();
        if (!byEmployeeMap.has(empId)) {
          byEmployeeMap.set(empId, { 
            id: empId, 
            name: (t.employeeId as any).name || 'Funcionário', 
            unitId: t.unitId?._id?.toString() || t.unitId?.toString() || '',
            unitName: t.unitId?.name || '',
            appointments: 0, 
            grossRevenue: 0,
            totalVouchers: 0 
          });
        }
        byEmployeeMap.get(empId)!.totalVouchers += t.amount;
      }
    }

    // 2. Process Appointments (Work Metrics)
    const byServiceMap = new Map<string, { name: string; revenue: number; count: number; unitId: string; unitName: string }>();

    for (const appt of appointments) {
      const price = appt.price || (appt.serviceId?.price ?? 0);
      const svcName = appt.serviceId?.name || 'Outro';
      const unitId = appt.unitId?._id?.toString() || appt.unitId?.toString() || '';
      const unitName = appt.unitId?.name || '';
      const status = (appt as any).status;

      // Separate realized (completed) from projected (confirmed)
      if (status === 'completed') {
        // Already counted via transactions — don't double-count
      } else if (status === 'confirmed') {
        projectedIncome += price;
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
          commissionRate: appt.employeeId?.commissionRate,
          totalVouchers: 0 
        });
      }
      const empEntry = byEmployeeMap.get(empId)!;
      if (!empEntry.name && appt.employeeId?.name) empEntry.name = appt.employeeId.name;
      if (!empEntry.unitName && appt.unitId?.name) empEntry.unitName = appt.unitId.name;

      // Only count billed appointments for commission/attendance metrics.
      // Exclude billingSkipped (package sessions marked done without a financial transaction).
      if ((appt as any).isBilled && !(appt as any).billingSkipped) {
        empEntry.appointments += 1;
        empEntry.grossRevenue += price;
      }

      if (unitKey) {
        if (!byUnitMap.has(unitKey)) {
          byUnitMap.set(unitKey, { unitId: unitKey, name: unitName || 'Unidade', income: 0, expense: 0, profit: 0 });
        }
        const unit = byUnitMap.get(unitKey)!;
        if (status === 'confirmed') {
          // projected — don't add to realized unit.income
        } else if (status === 'completed') {
          // Already in transactions
        }
        unit.profit = unit.income - unit.expense;
      }
    }

    // 3. Compute commission amounts per employee
    for (const emp of byEmployeeMap.values()) {
      if (emp.commissionRate && emp.commissionRate > 0) {
        emp.commissionAmount = Math.round(emp.grossRevenue * emp.commissionRate / 100 * 100) / 100;
      }
    }

    const chart = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      realizedIncome,
      projectedIncome,
      byUnit: Array.from(byUnitMap.values()),
      byCategory: Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount })),
      byService: Array.from(byServiceMap.values()),
      byEmployee: Array.from(byEmployeeMap.values()),
      chart,
    };
  }
}
