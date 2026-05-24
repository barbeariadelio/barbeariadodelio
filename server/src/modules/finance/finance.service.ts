import mongoose, { FilterQuery } from 'mongoose';
import { TransactionModel, ITransaction } from './transaction.model';
import { UnitModel } from '../units/unit.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { UserModel, IUser } from '../auth/auth.model';
import type { FinanceSummary, TransactionCategory } from '@barber/types';
import { sharedCache } from '../../shared/utils/cache';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { toDate } from 'date-fns-tz';
import { escapeRegex } from '../../shared/utils/regex';

interface EmployeeLean {
  _id: mongoose.Types.ObjectId;
  name: string;
  avatar?: string;
  commissionRate?: number;
  unitId?: mongoose.Types.ObjectId;
}

interface RemunSummaryItem {
  employeeId: string;
  name: string;
  avatar?: string;
  grossRevenue: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  valesAmount: number;
  valesDiscountedAmount: number;
  commissionRate?: number;
}

interface PopulatedUnit    { _id: mongoose.Types.ObjectId; name?: string }
interface PopulatedEmp     { _id: mongoose.Types.ObjectId; name?: string; commissionRate?: number }
interface PopulatedService { _id: mongoose.Types.ObjectId; name?: string; price?: number }

interface TxLean {
  unitId: PopulatedUnit;
  employeeId?: PopulatedEmp;
  type: string;
  category: TransactionCategory;
  amount: number;
  description?: string;
  date: string;
  paymentMethod?: string;
}

interface ApptLean {
  unitId: PopulatedUnit;
  employeeId?: PopulatedEmp;
  serviceId?: PopulatedService;
  price?: number;
  status: string;
  isBilled?: boolean;
  billingSkipped?: boolean;
}

interface UnitLean {
  _id: mongoose.Types.ObjectId;
  name: string;
}

export class FinanceService {
  async getSummary(
    userId: string,
    role: string,
    unitId?: string,
    period: 'day' | 'month' | 'week' | 'year' = 'month',
    appScope?: string,
    jwtUnitId?: string,
  ): Promise<FinanceSummary> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId, appScope, jwtUnitId);
    const { startDate, endDate } = this.resolvePeriod(period);

    const cacheKey = `finance:summary:${unitIds.sort().join(',')}:${period}:${startDate}`;
    const cached = sharedCache.get<FinanceSummary>(cacheKey);
    if (cached) return cached;

    const [transactions, appointments, unitsInfo, allEmployees] = await Promise.all([
      TransactionModel.find({
        unitId: { $in: unitIds },
        date: { $gte: startDate, $lte: endDate },
      }).populate('unitId', 'name').populate('employeeId', 'name').lean(),
      AppointmentModel.find({
        unitId: { $in: unitIds },
        date: { $gte: startDate, $lte: endDate },
        status: { $in: ['pending', 'confirmed', 'completed'] },
      })
        .populate('serviceId', 'name price')
        .populate('employeeId', 'name commissionRate')
        .populate('unitId', 'name')
        .lean(),
      UnitModel.find({ _id: { $in: unitIds } }).select('name').lean(),
      UserModel.find({
        unitId: { $in: unitIds },
        role: 'employee',
        isActive: true,
      }).select('_id name unitId commissionRate').lean(),
    ]);

    const summary = this.buildSummary(transactions as unknown as TxLean[], appointments as unknown as ApptLean[], unitsInfo as UnitLean[], allEmployees as unknown as IUser[]);
    sharedCache.set(cacheKey, summary, 45);
    return summary;
  }

  async getTransactions(userId: string, role: string, unitId: string, page: number, limit: number, filters?: { employeeId?: string; category?: string }, appScope?: string, jwtUnitId?: string): Promise<{ data: ITransaction[]; total: number }> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId, appScope, jwtUnitId);

    const query: FilterQuery<ITransaction> = {
      unitId: { $in: unitIds },
      ...(filters?.employeeId ? { employeeId: new mongoose.Types.ObjectId(filters.employeeId) } : {}),
      ...(filters?.category ? { category: filters.category as TransactionCategory } : {}),
    };

    const [data, total] = await Promise.all([
      TransactionModel.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('unitId', 'name')
        .lean() as unknown as ITransaction[],
      TransactionModel.countDocuments(query),
    ]);
    return { data, total };
  }

  async listRemunerations(
    userId: string,
    role: string,
    unitId: string,
    employeeId: string,
    appScope?: string,
    jwtUnitId?: string,
    start?: string,
    end?: string,
  ): Promise<unknown[]> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId, appScope, jwtUnitId);
    const empOid = new mongoose.Types.ObjectId(employeeId);

    // Backfill: create commission transactions for completed/billed appointments that don't have one yet.
    // Uses bulk queries (no N+1) — fetches all appointments and existing txs in 2 queries, then insertMany.
    const employee = await UserModel.findById(employeeId).select('commissionRate');
    const commissionRate = employee?.commissionRate ?? 0;

    if (commissionRate > 0) {
      const [completedAppts, existingTxs] = await Promise.all([
        AppointmentModel.find({
          unitId: { $in: unitIds },
          employeeId: empOid,
          isBilled: true,
          billingSkipped: { $ne: true },
        }).populate('serviceId', 'name').select('_id price date unitId serviceId').lean(),
        TransactionModel.find({
          employeeId: empOid,
          type: 'commission',
        }).select('appointmentId').lean(),
      ]);

      const coveredApptIds = new Set(existingTxs.map(tx => tx.appointmentId?.toString()).filter(Boolean));
      const missing = completedAppts.filter(a => !coveredApptIds.has(a._id.toString()));

      if (missing.length > 0) {
        await TransactionModel.insertMany(
          missing.map(appt => ({
            unitId: appt.unitId,
            appointmentId: appt._id,
            employeeId: empOid,
            type: 'commission',
            category: 'commission',
            amount: Math.round((appt.price ?? 0) * commissionRate / 100 * 100) / 100,
            description: `Comissão: ${(appt.serviceId as PopulatedService | undefined)?.name || 'Serviço'} (${commissionRate}%)`,
            date: appt.date,
            createdBy: empOid,
            isPaid: false,
          })),
          { ordered: false },
        );
      }
    }

    const dateFilter = start || end
      ? { date: { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) } }
      : {};

    const query: FilterQuery<ITransaction> = {
      unitId: { $in: unitIds },
      type: 'commission',
      category: 'commission',
      employeeId: empOid,
      ...dateFilter,
      ...(role === 'employee' ? { isPaid: { $ne: true } } : {}),
    };

    const commissions = await TransactionModel.find(query)
      .sort({ date: -1 })
      .populate({
        path: 'appointmentId',
        select: 'date startTime clientId serviceId price',
        populate: [
          { path: 'clientId', select: 'name' },
          { path: 'serviceId', select: 'name' },
        ],
      })
      .lean();

    const appointmentIds = commissions
      .map(tx => {
        const appointment = tx.appointmentId as unknown as { _id?: mongoose.Types.ObjectId } | mongoose.Types.ObjectId | undefined;
        if (!appointment) return null;
        if (appointment instanceof mongoose.Types.ObjectId) return appointment.toString();
        return appointment._id?.toString() ?? null;
      })
      .filter((id): id is string => Boolean(id));

    const discountedVales = await TransactionModel.find({
      unitId: { $in: unitIds },
      type: 'expense',
      category: 'voucher',
      employeeId: empOid,
      isPaid: true,
      ...dateFilter,
      ...(appointmentIds.length > 0
        ? {
            $or: [
              { appointmentId: { $in: appointmentIds.map(id => new mongoose.Types.ObjectId(id)) } },
              { appointmentId: { $exists: false } },
              { appointmentId: null },
            ],
          }
        : {
            $or: [
              { appointmentId: { $exists: false } },
              { appointmentId: null },
            ],
          }),
    }).select('appointmentId amount date').lean() as Array<{ appointmentId?: mongoose.Types.ObjectId; amount: number; date?: string }>;

    const valesByAppointment = new Map<string, number>();
    const unlinkedValesByDate = new Map<string, number>();
    for (const vale of discountedVales) {
      const appointmentId = vale.appointmentId?.toString();
      if (appointmentId) {
        valesByAppointment.set(appointmentId, (valesByAppointment.get(appointmentId) ?? 0) + vale.amount);
        continue;
      }
      if (!vale.date) continue;
      unlinkedValesByDate.set(vale.date, (unlinkedValesByDate.get(vale.date) ?? 0) + vale.amount);
    }

    return commissions.map(tx => {
      const appointment = tx.appointmentId as unknown as { _id?: mongoose.Types.ObjectId } | mongoose.Types.ObjectId | undefined;
      const appointmentId = appointment instanceof mongoose.Types.ObjectId
        ? appointment.toString()
        : appointment?._id?.toString();
      const linkedVales = appointmentId ? (valesByAppointment.get(appointmentId) ?? 0) : 0;
      const unlinkedVales = Math.min(Math.max(0, tx.amount - linkedVales), unlinkedValesByDate.get(tx.date) ?? 0);
      if (unlinkedVales > 0) {
        unlinkedValesByDate.set(tx.date, (unlinkedValesByDate.get(tx.date) ?? 0) - unlinkedVales);
      }
      const deductedVales = linkedVales + unlinkedVales;
      return {
        ...tx,
        deductedVales,
        payableAmount: Math.max(0, tx.amount - deductedVales),
      };
    });
  }

  async getRemunerationsSummary(
    userId: string,
    role: string,
    unitId: string,
    appScope?: string,
    jwtUnitId?: string,
    start?: string,
    end?: string,
  ): Promise<RemunSummaryItem[]> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId, appScope, jwtUnitId);

    // Get employees (same filter as Finance)
    const employees = await (
      role !== 'employee'
        ? UserModel.find({ unitId: { $in: unitIds }, role: 'employee', isActive: true })
            .select('_id name avatar commissionRate').lean()
        : UserModel.findById(userId).select('_id name avatar commissionRate').lean().then(u => u ? [u] : [])
    ) as EmployeeLean[];

    const commissionTxQuery: Record<string, unknown> = {
      employeeId: { $in: employees.map(e => e._id) },
      type: 'commission',
      category: 'commission',
    };
    if (start || end) {
      commissionTxQuery['date'] = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    }

    type TxRow = { employeeId?: mongoose.Types.ObjectId; appointmentId?: mongoose.Types.ObjectId; amount: number; date?: string; isPaid?: boolean };
    type ApptRevenueRow = { employeeId?: mongoose.Types.ObjectId; price?: number; isBilled?: boolean; billingSkipped?: boolean };

    const commissionTxs = await TransactionModel.find(commissionTxQuery).select('employeeId appointmentId amount date isPaid').lean() as TxRow[];

    const apptQuery: Record<string, unknown> = {
      unitId: { $in: unitIds },
      employeeId: { $in: employees.map(e => e._id) },
      status: { $in: ['pending', 'confirmed', 'completed'] },
    };
    if (start || end) {
      apptQuery['date'] = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    }

    const appts = await AppointmentModel.find(apptQuery)
      .select('employeeId price isBilled billingSkipped')
      .lean() as ApptRevenueRow[];

    // Vouchers are split by payment state so discounted vales reduce the payable amount.
    const valesQuery: Record<string, unknown> = {
      unitId: { $in: unitIds },
      type: 'expense',
      category: 'voucher',
      employeeId: { $in: employees.map(e => e._id) },
    };
    if (start || end) {
      valesQuery['date'] = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    }

    const valesTxs = await TransactionModel.find(valesQuery).select('employeeId appointmentId amount date isPaid').lean() as TxRow[];

    // Build map seeded with all employees (guarantees every employee appears)
    const empMap = new Map<string, { name: string; avatar?: string; grossRevenue: number; total: number; paid: number; unpaid: number; unpaidAppointmentIds: Set<string>; vales: number; valesDiscounted: number; linkedValesDiscounted: number }>(
      employees.map(e => [e._id.toString(), { name: e.name, avatar: e.avatar, grossRevenue: 0, total: 0, paid: 0, unpaid: 0, unpaidAppointmentIds: new Set<string>(), vales: 0, valesDiscounted: 0, linkedValesDiscounted: 0 }]),
    );

    for (const appt of appts) {
      if (!appt.isBilled || appt.billingSkipped) continue;
      const empId = appt.employeeId?.toString();
      if (!empId) continue;
      const entry = empMap.get(empId);
      if (!entry) continue;
      entry.grossRevenue += appt.price ?? 0;
    }

    const discountedValesByAppointment = new Map<string, number>();
    const discountedUnlinkedValesByEmployeeDate = new Map<string, number>();
    for (const tx of valesTxs) {
      if (!tx.isPaid) continue;
      const appointmentId = tx.appointmentId?.toString();
      if (appointmentId) {
        discountedValesByAppointment.set(
          appointmentId,
          (discountedValesByAppointment.get(appointmentId) ?? 0) + tx.amount,
        );
        continue;
      }
      const empId = tx.employeeId?.toString();
      if (!empId || !tx.date) continue;
      const key = `${empId}:${tx.date}`;
      discountedUnlinkedValesByEmployeeDate.set(
        key,
        (discountedUnlinkedValesByEmployeeDate.get(key) ?? 0) + tx.amount,
      );
    }

    // Commission totals come from recorded commission transactions to match Finance.
    for (const tx of commissionTxs) {
      const empId = tx.employeeId?.toString();
      if (!empId) continue;
      const entry = empMap.get(empId);
      if (!entry) continue;
      const appointmentId = tx.appointmentId?.toString();
      const linkedValeAmount = appointmentId ? (discountedValesByAppointment.get(appointmentId) ?? 0) : 0;
      const unlinkedKey = tx.date ? `${empId}:${tx.date}` : '';
      const availableUnlinkedValeAmount = unlinkedKey ? (discountedUnlinkedValesByEmployeeDate.get(unlinkedKey) ?? 0) : 0;
      const unlinkedValeAmount = Math.min(Math.max(0, tx.amount - linkedValeAmount), availableUnlinkedValeAmount);
      if (unlinkedKey && unlinkedValeAmount > 0) {
        discountedUnlinkedValesByEmployeeDate.set(unlinkedKey, availableUnlinkedValeAmount - unlinkedValeAmount);
      }
      const deductedValeAmount = linkedValeAmount + unlinkedValeAmount;
      const netAmount = Math.max(0, tx.amount - deductedValeAmount);
      entry.total += tx.amount;
      if (tx.isPaid) {
        entry.paid += netAmount;
      } else {
        entry.unpaid += netAmount;
        if (appointmentId) entry.unpaidAppointmentIds.add(appointmentId);
      }
    }

    // Vales: split into pending (not discounted) and discounted (manually marked isPaid=true)
    for (const tx of valesTxs) {
      const empId = tx.employeeId?.toString();
      if (!empId) continue;
      const entry = empMap.get(empId);
      if (!entry) continue;
      if (tx.isPaid) {
        entry.valesDiscounted += tx.amount;
        const appointmentId = tx.appointmentId?.toString();
        if (appointmentId && entry.unpaidAppointmentIds.has(appointmentId)) {
          entry.linkedValesDiscounted += tx.amount;
        }
      } else {
        entry.vales += tx.amount;
      }
    }

    return Array.from(empMap.entries()).map(([id, d]) => ({
      employeeId: id,
      name: d.name,
      avatar: d.avatar,
      grossRevenue: d.grossRevenue,
      totalAmount: d.total,
      paidAmount: d.paid,
      pendingAmount: Math.max(0, d.unpaid),
      valesAmount: d.vales,
      valesDiscountedAmount: d.valesDiscounted,
      commissionRate: employees.find(e => e._id.toString() === id)?.commissionRate ?? 0,
    }));
  }

  async registerPayment(
    userId: string,
    role: string,
    unitId: string,
    employeeId: string,
    commissionIds: string[],
    amount: number,
    description: string,
    date: string,
    appScope?: string,
    jwtUnitId?: string,
  ): Promise<ITransaction> {
    const unitIds = await this.resolveUnitIds(userId, role, unitId, appScope, jwtUnitId);

    // Mark selected commissions as paid
    await TransactionModel.updateMany(
      {
        _id: { $in: commissionIds },
        unitId: { $in: unitIds },
        employeeId: new mongoose.Types.ObjectId(employeeId),
      },
      { $set: { isPaid: true } },
    );

    // Create a salary/payment expense transaction
    const payment = await TransactionModel.create({
      unitId: unitIds[0],
      employeeId: new mongoose.Types.ObjectId(employeeId),
      type: 'expense',
      category: 'salary',
      amount,
      description,
      date,
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    return payment;
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

  private async resolveUnitIds(userId: string, role: string, unitId?: string, appScope?: string, jwtUnitId?: string): Promise<string[]> {
    // Soul540 Rule 1: JWT unitId locks the user to exactly that unit.
    // Franchise owners always have jwtUnitId set; global admin never does.
    // Exception: owner role must never be locked by jwtUnitId — they can see all units.
    if (jwtUnitId && role !== 'owner') {
      return [jwtUnitId];
    }

    // Global admin (owner with no JWT unitId): can see ALL active units.
    // This bypasses ownerId dependency which may not survive database migrations.
    if (role === 'owner') {
      if (appScope === 'franchise') {
        // Admin switching into franchise view: look up franchise units via FranchiseModel,
        // or return all units as fallback.
        const ownerObjectId = new mongoose.Types.ObjectId(userId);
        const { FranchiseModel } = await import('../franchise/franchise.model');
        const franchise = await FranchiseModel.findOne({ franchisors: ownerObjectId });
        if (franchise && franchise.units.length > 0) {
          const ids = franchise.units.map(u => u.toString());
          if (unitId && unitId !== 'all') return ids.includes(unitId) ? [unitId] : [unitId];
          return ids;
        }
      }

      // Admin scope or no scope: return ALL active units.
      const allUnits = await UnitModel.find({ isActive: true }).select('_id');
      const allIds = allUnits.map(u => u._id.toString());

      if (unitId && unitId !== 'all') {
        // Trust a specific unit selection from the admin — they can see any unit.
        return [unitId];
      }
      return allIds;
    }

    const allowedIds = await this.getAllowedUnitIds(userId, role, appScope);

    if (unitId && unitId !== 'all') {
      if (allowedIds.includes(unitId)) return [unitId];
      // Employees created before the unitId fix may have no unitId in DB/JWT.
      // The client always sends the franchise-selected unit in the query param — trust it
      // and backfill the DB so this only happens once.
      if (role === 'employee' && allowedIds.length === 0) {
        await UserModel.findByIdAndUpdate(userId, { $set: { unitId } });
        return [unitId];
      }
      return [];
    }

    return allowedIds;
  }

  private async getAllowedUnitIds(userId: string, role: string, _appScope?: string): Promise<string[]> {
    if (role === 'owner') {
      // Note: owner case is fully handled in resolveUnitIds above.
      return [];
    }

    if (role === 'employee') {
      const user = await UserModel.findById(userId).select('unitId');
      return user?.unitId ? [user.unitId.toString()] : [];
    }

    if (role === 'cashier') {
      const user = await UserModel.findById(userId).select('unitId allowedApps');
      const allowedApps: string[] = user?.allowedApps || [];
      const primaryUnitId = user?.unitId?.toString();

      if (allowedApps.length === 0) return primaryUnitId ? [primaryUnitId] : [];

      const primaryUnit = primaryUnitId ? await UnitModel.findById(primaryUnitId).select('ownerId') : null;
      const ownerId = primaryUnit?.ownerId;
      if (!ownerId) return primaryUnitId ? [primaryUnitId] : [];

      const unitIds = new Set<string>();

      if (allowedApps.includes('admin')) {
        const adminUnits = await UnitModel.find({ ownerId, isActive: true }).select('_id');
        adminUnits.forEach(u => unitIds.add(u._id.toString()));
      }

      if (allowedApps.includes('franchise')) {
        const { FranchiseModel } = await import('../franchise/franchise.model');
        const franchise = await FranchiseModel.findOne({ franchisors: ownerId });
        if (franchise?.units.length) franchise.units.forEach(u => unitIds.add(u.toString()));
      }

      return unitIds.size > 0 ? [...unitIds] : (primaryUnitId ? [primaryUnitId] : []);
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

  private buildSummary(transactions: TxLean[], appointments: ApptLean[], unitsInfo: UnitLean[] = [], allEmployees: IUser[] = []): FinanceSummary {
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
    const byPaymentMap = new Map<string, { amount: number; count: number }>();
    const byProductMap = new Map<string, { amount: number; quantity: number; count: number }>();
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

        if (t.paymentMethod && t.paymentMethod !== 'package') {
          const pm = t.paymentMethod;
          const prev = byPaymentMap.get(pm) ?? { amount: 0, count: 0 };
          byPaymentMap.set(pm, { amount: prev.amount + t.amount, count: prev.count + 1 });
        }

        // Track product sales (description: "Produto: Name (xQty)")
        if (t.category === 'product') {
          const match = t.description?.match(/^Produto:\s*(.+?)\s*\(x(\d+)\)/);
          const productName = match ? match[1] : (t.description || 'Produto');
          const qty = match ? parseInt(match[2], 10) : 1;
          const prev = byProductMap.get(productName) ?? { amount: 0, quantity: 0, count: 0 };
          byProductMap.set(productName, {
            amount: prev.amount + t.amount,
            quantity: prev.quantity + qty,
            count: prev.count + 1,
          });
        }
      } else if (t.type === 'expense' || t.type === 'commission') {
        totalExpense += t.amount;
        unit.expense += t.amount;
        day.expense += t.amount;
      }
      const prev = byCategoryMap.get(t.category) ?? 0;
      byCategoryMap.set(t.category, prev + t.amount);

      // Track vouchers per employee
      if (t.category === 'voucher' && t.employeeId) {
        const empId = t.employeeId._id.toString();
        if (!byEmployeeMap.has(empId)) {
          byEmployeeMap.set(empId, {
            id: empId,
            name: t.employeeId.name || 'Funcionário',
            unitId: t.unitId._id.toString(),
            unitName: t.unitId.name || '',
            appointments: 0,
            grossRevenue: 0,
            totalVouchers: 0,
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
      const status = appt.status;

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
      const empId = appt.employeeId?._id?.toString() || appt.employeeId?.toString();
      if (!empId) continue;
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
      if (appt.employeeId?.commissionRate !== undefined) empEntry.commissionRate = appt.employeeId.commissionRate;

      // Only count billed appointments for commission/attendance metrics.
      // Exclude billingSkipped (package sessions marked done without a financial transaction).
      if (appt.isBilled && !appt.billingSkipped) {
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

    // 3. Ensure all active employees appear (zero-value rows for new employees with no appointments)
    const unitNameMap = new Map(unitsInfo.map(u => [u._id.toString(), u.name]));
    for (const emp of allEmployees) {
      const empId = emp._id.toString();
      if (!byEmployeeMap.has(empId)) {
        const empUnitId = emp.unitId?.toString() || '';
        byEmployeeMap.set(empId, {
          id: empId,
          name: emp.name,
          unitId: empUnitId,
          unitName: unitNameMap.get(empUnitId) || '',
          appointments: 0,
          grossRevenue: 0,
          commissionRate: emp.commissionRate,
          totalVouchers: 0,
        });
      } else {
        const empEntry = byEmployeeMap.get(empId)!;
        const empUnitId = emp.unitId?.toString() || empEntry.unitId;
        empEntry.name = empEntry.name || emp.name;
        empEntry.unitId = empEntry.unitId || empUnitId;
        empEntry.unitName = empEntry.unitName || unitNameMap.get(empUnitId) || '';
        empEntry.commissionRate = emp.commissionRate;
      }
    }

    // 4. Compute commission amounts per employee
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
      byPaymentMethod: Array.from(byPaymentMap.entries()).map(([method, { amount, count }]) => ({ method, amount, count })),
      byProduct: Array.from(byProductMap.entries()).map(([name, { amount, quantity, count }]) => ({ name, amount, quantity, count })),
      chart,
    };
  }
}
