export type TransactionType = 'income' | 'expense' | 'royalty' | 'commission';
export type TransactionCategory = 'service' | 'product' | 'salary' | 'rent' | 'voucher' | 'commission' | 'package_use' | 'package_sale' | 'sale' | 'other';
export type PaymentMethod = 'money' | 'debit' | 'credit' | 'pix' | 'package' | 'other';

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
  paymentMethod?: PaymentMethod;
  isPaid?: boolean;
  createdBy: string;
  createdAt: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  realizedIncome: number;
  projectedIncome: number;
  byUnit: UnitFinance[];
  byCategory: CategoryFinance[];
  byService: ServiceFinance[];
  byEmployee: EmployeeFinance[];
  byPaymentMethod: PaymentMethodFinance[];
  byProduct: ProductFinance[];
  chart: ChartPoint[];
}

export interface PaymentMethodFinance {
  method: string;
  amount: number;
  count: number;
}

export interface ProductFinance {
  name: string;
  amount: number;
  quantity: number;
  count: number;
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
