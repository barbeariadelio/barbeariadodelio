export type TransactionType = 'income' | 'expense' | 'royalty';
export type TransactionCategory = 'service' | 'product' | 'salary' | 'rent' | 'other';

export interface Transaction {
  _id: string;
  unitId: string;
  appointmentId?: string;
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
}

export interface EmployeeFinance {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  appointments: number;
  grossRevenue: number;
}

export interface ChartPoint {
  date: string;
  income: number;
  expense: number;
}
