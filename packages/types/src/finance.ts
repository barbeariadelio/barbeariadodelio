export type TransactionType = 'income' | 'expense' | 'royalty' | 'commission';
export type TransactionCategory = 'service' | 'product' | 'salary' | 'rent' | 'voucher' | 'commission' | 'other';

export interface Transaction {
  _id: string;
  unitId: string;
  appointmentId?: string;
  employeeId?: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  date: string;
  createdBy: string;
  createdAt: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  realizedIncome: number;    // completed only
  projectedIncome: number;   // confirmed (not yet completed)
  byUnit: UnitFinance[];
  byCategory: CategoryFinance[];
  byService: ServiceFinance[];
  byEmployee: EmployeeFinance[];
  chart: ChartPoint[];
}

export interface UnitFinance {
  unitId: string;
  name: string;
  income: number;
  expense: number;
  profit: number;
}

export interface CategoryFinance {
  category: TransactionCategory;
  amount: number;
}

export interface ServiceFinance {
  name: string;
  revenue: number;
  count: number;
  unitId: string;
  unitName: string;
}

export interface EmployeeFinance {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  appointments: number;
  grossRevenue: number;
  commissionRate?: number;
  commissionAmount?: number;
  totalVouchers?: number;
}

export interface ChartPoint {
  date: string;
  income: number;
  expense: number;
}
