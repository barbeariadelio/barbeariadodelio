import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend, Cell, PieChart, Pie } from 'recharts';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import TransactionForm from './TransactionForm';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Finance.module.scss';

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Serviço',
  product: 'Produto',
  salary: 'Salário',
  rent: 'Aluguel',
  voucher: 'Vale',
  other: 'Outro',
};

const PERIOD_OPTIONS = [
  { label: 'Dia', value: 'day' },
  { label: 'Semana', value: 'week' },
  { label: 'Mês', value: 'month' },
  { label: 'Ano', value: 'year' },
];

// --- Local Components for Soul Style ---

interface GaugeProps { label: string; value: number; max?: number; color?: string; }
function Gauge({ label, value, max = 100, color = '#1565C0' }: GaugeProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const status = pct >= 25 ? 'good' : pct >= 15 ? 'warning' : 'danger';
  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeVisual}>
        <div className={styles.gaugeTrack}>
          <div className={styles.gaugeFill} style={{ width: `${pct}%`, background: color }} />
        </div>
        <div className={styles.gaugeInfo}>
          <span className={styles.gaugeValue}>{value.toFixed(1)}%</span>
          <span className={styles.gaugeLabel}>{label}</span>
        </div>
      </div>
      <div className={`${styles.gaugeStatus} ${styles[status]}`}>
        {status === 'good' ? 'Saudável' : status === 'warning' ? 'Atenção' : 'Crítico'}
      </div>
    </div>
  );
}

function HorizontalBar({ title, items }: { title: string, items: any[] }) {
  const max = Math.max(...items.map(i => i.amount), 1);
  return (
    <div className={styles.hBarChart}>
      <div className={styles.hBarHeader}>
        <h3 className={styles.hBarTitle}>{title}</h3>
      </div>
      <div className={styles.hBarList}>
        {items.map(item => (
          <div key={item.category} className={styles.hBarRow}>
            <span className={styles.hBarLabel}>{CATEGORY_LABELS[item.category] || item.category}</span>
            <div className={styles.hBarTrack}>
              <div className={styles.hBarFill} style={{ width: `${(item.amount / max) * 100}%` }} />
            </div>
            <span className={styles.hBarVal}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


interface Unit { _id: string; name: string; }

interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  realizedIncome: number;
  projectedIncome: number;
  royaltiesPaid?: number;
  byUnit?: Array<{ unitId: string; name: string; income: number; expense: number; profit: number }>;
  byCategory?: Array<{ category: string; amount: number }>;
  byService?: Array<{ name: string; revenue: number; count: number }>;
  byEmployee?: Array<{ id: string; name: string; unitId: string; unitName: string; appointments: number; grossRevenue: number; totalVouchers: number }>;
  byPaymentMethod?: Array<{ method: string; amount: number; count: number }>;
  byProduct?: Array<{ name: string; amount: number; quantity: number; count: number }>;
  chart?: Array<{ date: string; income: number; expense: number }>;
}

interface Transaction {
  _id: string;
  unitId: string | { _id: string; name: string };
  type: 'income' | 'expense' | 'royalty';
  category: string;
  amount: number;
  description: string;
  date: string;
  createdBy?: string | { _id: string; name: string };
  employeeId?: string | { _id: string; name: string };
  paymentMethod?: 'money' | 'card' | 'pix' | 'other';
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

const TYPE_COLORS: Record<string, string> = {
  income: '#22C55E',
  expense: '#EF4444',
  royalty: '#F59E0B',
};

const TYPE_LABELS: Record<string, string> = {
  income: 'Receita',
  expense: 'Despesa',
  royalty: 'Royalty',
  commission: 'Comissão',
};

const PAYMENT_LABELS: Record<string, string> = {
  money: 'Dinheiro',
  debit: 'Débito',
  credit: 'Crédito',
  card: 'Cartão',
  pix: 'Pix',
  other: 'Outro',
};

const PAYMENT_COLORS: Record<string, string> = {
  money: '#22C55E',
  debit: '#3B82F6',
  credit: '#6366F1',
  card: '#8B5CF6',
  pix: '#06B6D4',
  other: '#9CA3AF',
};

type TabType = 'geral' | 'mensal' | 'despesas' | 'lancamentos';

export default function Finance() {
  const { user } = useAuth();
  const isStaff = user?.role === 'employee';
  const userId = (user as any)?.id || (user as any)?._id;
  const activeUnitId = getSelectedUnitId() || import.meta.env.VITE_UNIT_ID || 'all';
  const [unitId, setUnitId] = useState(activeUnitId);
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState<TabType>('geral');
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [commissionRate, setCommissionRate] = useState(55);   // %
  const [individualRates, setIndividualRates] = useState<Record<string, number>>({});
  const qc = useQueryClient();

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await api.get('/units');
      return Array.isArray(data) ? data : data.units ?? [];
    },
    enabled: !isStaff,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', unitId, period],
    queryFn: async () => {
      const { data } = await api.get('/finance/summary', { params: { unitId, period } });
      return data;
    },
    staleTime: 60 * 1000,
  });

  const remunerationDateRange = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (period === 'day') { const t = iso(now); return { start: t, end: t }; }
    if (period === 'week') {
      const day = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: iso(mon), end: iso(sun) };
    }
    if (period === 'year') return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    // month (default)
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: iso(first), end: iso(last) };
  }, [period]);

  const { data: remunerationSummary } = useQuery<{ employeeId: string; paidAmount: number; pendingAmount: number; valesDiscountedAmount: number }[]>({
    queryKey: ['remuneration-summary', unitId, remunerationDateRange],
    queryFn: async () => {
      const { data } = await api.get('/finance/remunerations/summary', { params: { unitId, ...remunerationDateRange } });
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 1000,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['finance-transactions', unitId],
    queryFn: async () => {
      const { data } = await api.get('/finance/transactions', { params: { unitId, limit: 1000 } });
      return Array.isArray(data) ? data : data.data ?? [];
    },
    staleTime: 30 * 1000,
  });

  const paymentPieData = useMemo(() => {
    const map = new Map<string, { method: string; amount: number; count: number }>();
    for (const tx of transactions) {
      if (tx.type !== 'income') continue;
      const pm = (tx.paymentMethod as string) || 'other';
      if (pm === 'package') continue;
      const prev = map.get(pm) ?? { method: pm, amount: 0, count: 0 };
      map.set(pm, { method: pm, amount: prev.amount + tx.amount, count: prev.count + 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const productTableData = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; quantity: number; count: number }>();
    for (const tx of transactions) {
      if (tx.type !== 'income' || tx.category !== 'product') continue;
      const match = tx.description?.match(/^Produto:\s*(.+?)\s*\(x(\d+)\)/);
      const name = match ? match[1] : (tx.description || 'Produto');
      const qty  = match ? parseInt(match[2], 10) : 1;
      const prev = map.get(name) ?? { name, amount: 0, quantity: 0, count: 0 };
      map.set(name, { name, amount: prev.amount + tx.amount, quantity: prev.quantity + qty, count: prev.count + 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/transactions/${id}`),
    onSuccess: () => {
      setDeletingTxId(null);
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-transactions'] });
    },
  });

  const handleExportExcel = async () => {
    if (transactions.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transações');

    worksheet.columns = [
      { header: 'Data', key: 'date', width: 15 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'Categoria', key: 'category', width: 15 },
      { header: 'Descrição', key: 'description', width: 30 },
      { header: 'Valor', key: 'amount', width: 12 },
      { header: 'Unidade', key: 'unit', width: 20 },
      { header: 'Meio de Pagamento', key: 'payment', width: 18 },
      { header: 'Responsável', key: 'creator', width: 20 },
      { header: 'Profissional', key: 'employee', width: 20 },
    ];

    transactions.forEach(tx => {
      worksheet.addRow({
        date: tx.date,
        type: TYPE_LABELS[tx.type] || tx.type,
        category: CATEGORY_LABELS[tx.category] || tx.category,
        description: tx.description,
        amount: tx.amount,
        unit: typeof tx.unitId === 'object' ? tx.unitId.name : '',
        payment: tx.paymentMethod ? PAYMENT_LABELS[tx.paymentMethod] : '',
        creator: typeof tx.createdBy === 'object' ? tx.createdBy.name : '',
        employee: typeof tx.employeeId === 'object' ? tx.employeeId.name : ''
      });
    });

    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `financeiro_${unitId}_${period}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (summaryLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Carregando dados financeiros...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>FINANCEIRO</h1>
          <p className={styles.subtitle}>Gestão de fluxo de caixa e indicadores de desempenho</p>
        </div>
        {!isStaff && (
          <div className={styles.headerRight}>
            <button className={styles.excelBtn} onClick={handleExportExcel}>
              Exportar Excel
            </button>
            <button className={styles.newBtn} onClick={() => setShowForm(true)}>
              + Novo Lançamento
            </button>
          </div>
        )}
      </div>

      {!isStaff && (
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={unitId}
            onChange={e => setUnitId(e.target.value)}
          >
            {units.map(u => (
              <option key={u._id} value={u._id}>{u.name}</option>
            ))}
          </select>

          <div className={styles.periodTabs}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.periodBtn} ${period === opt.value ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className={styles.tabs}>
            {(['geral', 'mensal', 'despesas', 'lancamentos'] as TabType[]).map(tab => (
              <button
                key={tab}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'geral' ? 'Visão Geral' : tab === 'mensal' ? 'Painel Mensal' : tab === 'despesas' ? 'Painel Despesas' : 'Lançamentos'}
              </button>
            ))}
          </div>
        </div>
      )}

      {isStaff && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 className={styles.sectionTitle}>Meu Salário e Comissões</h3>
          <p className={styles.subtitle}>Acompanhe seus rendimentos no período selecionado</p>
          <div className={styles.periodTabs} style={{ marginTop: '1rem' }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.periodBtn} ${period === opt.value ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'geral' && (
        <>
          {!isStaff && (
            <div className={styles.summaryBar}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Receita Realizada</span>
                <span className={`${styles.summaryValue} ${styles.green}`}>{formatCurrency(summary?.realizedIncome ?? 0)}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Receita Prevista</span>
                <span className={`${styles.summaryValue} ${styles.amber}`}>{formatCurrency(summary?.projectedIncome ?? 0)}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Lucro Líquido</span>
                <span className={`${styles.summaryValue} ${styles.blue}`}>{formatCurrency(summary?.netProfit ?? 0)}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Margem</span>
                <span className={`${styles.summaryValue} ${styles.amber}`}>
                  {summary?.totalIncome ? ((summary.netProfit / summary.totalIncome) * 100).toFixed(1) : '0'}%
                </span>
              </div>
            </div>
          )}

          {!isStaff && (
            <div className={styles.chartSection}>
              <h3 className={styles.sectionTitle}>Tendência de Receita x Despesa</h3>
              <div className={styles.mainChart}>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={summary?.chart ?? []}>
                    <defs>
                      <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f87171" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={d => d.split('-').slice(2).join('/')}
                      stroke="#5A5448" fontSize={11} tickLine={false} axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: any) => [formatCurrency(Number(v) || 0), '']}
                    />
                    <Area type="monotone" dataKey="income" name="Receita" stroke="#4ade80" strokeWidth={2} fill="url(#colorInc)" />
                    <Area type="monotone" dataKey="expense" name="Despesa" stroke="#f87171" strokeWidth={2} fill="url(#colorExp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {!isStaff && (
            <div className={styles.quickStatsGrid} style={{ marginBottom: '0' }}>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>Receita por Meio de Pagamento</h3>
                {paymentPieData.length === 0 ? (
                  <p className={styles.empty} style={{ paddingTop: '3rem' }}>Nenhuma receita faturada ainda.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={paymentPieData}
                          dataKey="amount"
                          nameKey="method"
                          cx="50%" cy="50%"
                          innerRadius={55} outerRadius={85}
                          paddingAngle={3}
                          label={({ method, percent }: { method?: string; percent?: number }) =>
                            `${PAYMENT_LABELS[method ?? ''] || method || ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                        >
                          {paymentPieData.map((entry, i) => (
                            <Cell key={i} fill={PAYMENT_COLORS[entry.method] ?? '#9CA3AF'} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(v: any, name: any) => [formatCurrency(Number(v) || 0), PAYMENT_LABELS[name] || name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {paymentPieData.map(p => {
                        const total = paymentPieData.reduce((s, x) => s + x.amount, 0);
                        const pct = total > 0 ? ((p.amount / total) * 100).toFixed(1) : '0';
                        return (
                          <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: PAYMENT_COLORS[p.method] ?? '#9CA3AF', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {PAYMENT_LABELS[p.method] || p.method}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.count} trans.</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', minWidth: 80, textAlign: 'right' }}>
                              {formatCurrency(p.amount)}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>Distribuição de Despesas</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={summary?.byCategory ?? []}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                      paddingAngle={4}
                    >
                      {(summary?.byCategory ?? []).map((_, i) => (
                        <Cell key={i} fill={['#F87171', '#F59E0B', '#3B82F6', '#10B981', '#6366F1'][i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: any, name: any) => [formatCurrency(v), CATEGORY_LABELS[name] || name]} 
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{CATEGORY_LABELS[v] || v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>Receita por Profissional</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary?.byEmployee ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#5A5448" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: any) => [formatCurrency(v), 'Receita']} 
                    />
                    <Bar dataKey="grossRevenue" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {!isStaff && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Receita por Serviço Atendido</h3>
              {(summary?.byService ?? []).length === 0 && <p className={styles.empty}>Nenhum agendamento confirmado ou concluído no período.</p>}
              
              {(summary?.byService ?? []).length > 0 && (() => {
                type Svc = { name: string; revenue: number; count: number; unitId: string; unitName: string };
                const svcList = summary!.byService as Svc[];

                // Group by unit
                const byUnit = new Map<string, Svc[]>();
                for (const svc of svcList) {
                  const key = svc.unitId || 'sem-unidade';
                  if (!byUnit.has(key)) byUnit.set(key, []);
                  byUnit.get(key)!.push(svc);
                }

                return Array.from(byUnit.entries()).map(([, services]) => {
                  const unitName = services[0]?.unitName || 'Sem unidade';
                  return (
                    <div key={services[0]?.unitId || 'none'} className={styles.serviceUnitGroup}>
                      <div className={styles.serviceUnitHeader}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        {unitName}
                      </div>
                      <div className={styles.serviceGrid}>
                        {services.map(svc => (
                          <div key={svc.name} className={styles.serviceCard}>
                            <div className={styles.svcHead}>
                              <span className={styles.svcName}>{svc.name}</span>
                              <span className={styles.svcCount}>{svc.count} atendimentos</span>
                            </div>
                            <div className={styles.svcBody}>
                              <span className={styles.svcLabel}>Total Gerado</span>
                              <span className={styles.svcValue}>{formatCurrency(svc.revenue)}</span>
                            </div>
                            <div className={styles.svcTrack}>
                              <div className={styles.svcFill} style={{ width: `${Math.min((svc.revenue / (summary?.totalIncome || 1)) * 200, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {!isStaff && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Venda de Produtos</h3>
              {productTableData.length === 0 ? (
                <p className={styles.empty}>Nenhuma venda de produto registrada.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    <div className={styles.summaryItem} style={{ flex: 1, minWidth: 140 }}>
                      <span className={styles.summaryLabel}>Total Produtos</span>
                      <span className={`${styles.summaryValue} ${styles.green}`}>
                        {formatCurrency(productTableData.reduce((s, p) => s + p.amount, 0))}
                      </span>
                    </div>
                    <div className={styles.summaryItem} style={{ flex: 1, minWidth: 140 }}>
                      <span className={styles.summaryLabel}>Itens Vendidos</span>
                      <span className={`${styles.summaryValue} ${styles.blue}`}>
                        {productTableData.reduce((s, p) => s + p.quantity, 0)}
                      </span>
                    </div>
                    <div className={styles.summaryItem} style={{ flex: 1, minWidth: 140 }}>
                      <span className={styles.summaryLabel}>Produtos Distintos</span>
                      <span className={`${styles.summaryValue} ${styles.amber}`}>
                        {productTableData.length}
                      </span>
                    </div>
                  </div>

                  <div className={styles.chartCard} style={{ marginBottom: '1.25rem' }}>
                    <h3 className={styles.chartTitle}>Receita por Produto</h3>
                    <ResponsiveContainer width="100%" height={Math.max(productTableData.slice(0, 10).length * 44, 120)}>
                      <BarChart
                        layout="vertical"
                        data={productTableData.slice(0, 10)}
                        margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke="#5A5448" fontSize={11} axisLine={false} tickLine={false} width={130} />
                        <Tooltip
                          contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(v: any, name: any) =>
                            name === 'amount' ? [formatCurrency(Number(v)), 'Receita'] : [`${v} unid.`, 'Qtd. vendida']
                          }
                        />
                        <Bar dataKey="amount" name="amount" radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: '#9A9080', formatter: (v: any) => formatCurrency(Number(v)) }}>
                          {productTableData.slice(0, 10).map((_, i) => (
                            <Cell key={i} fill={['#3B82F6','#6366F1','#8B5CF6','#06B6D4','#10B981','#F59E0B','#EF4444','#EC4899','#14B8A6','#84CC16'][i % 10]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={styles.serviceGrid}>
                    {productTableData.map(p => {
                      const total = productTableData.reduce((s, x) => s + x.amount, 0);
                      const pct = total > 0 ? (p.amount / total) * 100 : 0;
                      return (
                        <div key={p.name} className={styles.serviceCard}>
                          <div className={styles.svcHead}>
                            <span className={styles.svcName}>{p.name}</span>
                            <span className={styles.svcCount}>{p.quantity} unid. · {p.count} venda{p.count !== 1 ? 's' : ''}</span>
                          </div>
                          <div className={styles.svcBody}>
                            <span className={styles.svcLabel}>Total Gerado</span>
                            <span className={styles.svcValue}>{formatCurrency(p.amount)}</span>
                          </div>
                          <div className={styles.svcTrack}>
                            <div className={styles.svcFill} style={{ width: `${Math.min(pct * 2, 100)}%`, background: '#3B82F6' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.commissionSectionHead}>
              <div>
                <h3 className={styles.sectionTitle}>{isStaff ? 'Detalhamento de Ganhos' : 'Comissões por Profissional'}</h3>
                <p className={styles.commissionSubtitle}>{isStaff ? 'Resumo de seus rendimentos acumulados' : 'Agrupado por unidade de trabalho'}</p>
              </div>
              {!isStaff && (
                <div className={styles.rateControls}>
                  <div className={styles.rateField}>
                    <label className={styles.rateLabel}>Comissão</label>
                    <div className={styles.rateInputWrap}>
                      <input
                        type="number"
                        className={styles.rateInput}
                        value={commissionRate}
                        min={0} max={100} step={0.1}
                        onChange={e => {
                          const newRate = Number(e.target.value);
                          setCommissionRate(newRate);
                          const allEmps = (summary?.byEmployee ?? []) as Array<{ id: string }>;
                          if (allEmps.length > 0) {
                            setIndividualRates(Object.fromEntries(allEmps.map(emp => [emp.id, newRate])));
                          }
                        }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        onFocus={e => e.target.select()}
                      />
                      <span className={styles.rateSuffix}>%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(summary?.byEmployee ?? []).length === 0 && (
              <p className={styles.empty}>
                Nenhum profissional cadastrado para {unitId === 'all' ? 'todas as unidades' : 'esta unidade'}.
              </p>
            )}
            {(summary?.byEmployee ?? []).length > 0 && (() => {
              type Emp = { id: string; name: string; unitId: string; unitName: string; appointments: number; grossRevenue: number; totalVouchers: number; commissionRate?: number };
              let empList: Emp[] = (summary!.byEmployee as Emp[]) || [];

              if (isStaff && userId) {
                empList = empList.filter(e => (e.id || (e as any)._id) === userId);
              }

              // Group by unit
              const byUnit = new Map<string, Emp[]>();
              for (const emp of empList) {
                const key = emp.unitId || 'sem-unidade';
                if (!byUnit.has(key)) byUnit.set(key, []);
                byUnit.get(key)!.push(emp);
              }

              return Array.from(byUnit.entries()).map(([, employees]) => {
                const unitName = employees[0]?.unitName || 'Sem unidade';
                return (
                  <div key={employees[0]?.unitId || 'none'} className={styles.commissionGroup}>
                    <div className={styles.commissionGroupHeader}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      {unitName}
                    </div>
                    <div className={styles.commissionTable}>
                      <div
                        className={styles.commissionHeader}
                        style={isStaff ? { gridTemplateColumns: '2.5fr 80px 1.2fr 1fr 1.2fr 1.2fr' } : undefined}
                      >
                        <span>Profissional</span>
                        <span>Atend.</span>
                        {!isStaff && <span>Receita Gerada</span>}
                        {!isStaff && <span style={{ textAlign: 'center' }}>%</span>}
                        <span>Comissão</span>
                        <span>Vales</span>
                        <span>A Pagar</span>
                        {isStaff && <span>Pago</span>}
                        {!isStaff && <span>Parte Loja</span>}
                      </div>
                      {employees.map(emp => {
                        const rate = individualRates[emp.id] ?? emp.commissionRate ?? commissionRate;
                        const gross = emp.grossRevenue * (rate / 100);
                        const salonShare = emp.grossRevenue - gross;
                        return (
                          <div
                            key={emp.id}
                            className={styles.commissionRow}
                            style={isStaff ? { gridTemplateColumns: '2.5fr 80px 1.2fr 1fr 1.2fr 1.2fr' } : undefined}
                          >
                            <div className={styles.empName}>
                              <div className={styles.empAvatar}>{emp.name.charAt(0).toUpperCase()}</div>
                              <span>{emp.name}</span>
                            </div>
                            <span className={styles.commissionCell}>{emp.appointments}</span>
                            {!isStaff && <span className={`${styles.commissionCell} ${styles.amber}`}>{formatCurrency(emp.grossRevenue)}</span>}
                            {!isStaff && (
                              <div className={styles.miniRateInputWrap}>
                                <input
                                  type="number"
                                  className={styles.miniRateInput}
                                  value={rate}
                                  min={0} max={100} step={1}
                                  onChange={e => setIndividualRates(prev => ({ ...prev, [emp.id]: Number(e.target.value) }))}
                                  onWheel={e => (e.target as HTMLInputElement).blur()}
                                />
                                <span className={styles.miniRateSuffix}>%</span>
                              </div>
                            )}
                            <span className={`${styles.commissionCell} ${styles.blue}`}>{formatCurrency(emp.grossRevenue * (rate / 100))}</span>
                            <span className={`${styles.commissionCell} ${styles.red}`}>{formatCurrency(emp.totalVouchers || 0)}</span>
                            <span className={`${styles.commissionCell} ${styles.green}`} style={{ fontWeight: 800 }}>{formatCurrency(Math.max(0, (emp.grossRevenue * (rate / 100)) - (remunerationSummary?.find(r => r.employeeId === emp.id)?.valesDiscountedAmount ?? 0) - (remunerationSummary?.find(r => r.employeeId === emp.id)?.paidAmount ?? 0)))}</span>
                            {isStaff && <span className={styles.commissionCell} style={{ color: '#6B7280', fontWeight: 600 }}>{formatCurrency(remunerationSummary?.find(r => r.employeeId === emp.id)?.paidAmount ?? 0)}</span>}
                            {!isStaff && <span className={styles.commissionCell}>{formatCurrency(emp.grossRevenue - (emp.grossRevenue * (rate / 100)))}</span>}
                          </div>
                        );
                      })}
                      {!isStaff && (
                          <div className={styles.commissionFooter}>
                            <span>SUBTOTAL</span>
                            <span>{employees.reduce((s, e) => s + e.appointments, 0)}</span>
                            <span>{formatCurrency(employees.reduce((s, e) => s + e.grossRevenue, 0))}</span>
                            <span /> 
                            <span>{formatCurrency(employees.reduce((s, e) => s + (e.grossRevenue * ((individualRates[e.id] ?? e.commissionRate ?? commissionRate) / 100)), 0))}</span>
                            <span>{formatCurrency(employees.reduce((s, e) => s + (e.totalVouchers || 0), 0))}</span>
                            <span style={{ fontWeight: 800 }}>{formatCurrency(employees.reduce((s, e) => s + ((e.grossRevenue * ((individualRates[e.id] ?? e.commissionRate ?? commissionRate) / 100)) - (e.totalVouchers || 0)), 0))}</span>
                            <span>{formatCurrency(employees.reduce((s, e) => s + (e.grossRevenue - (e.grossRevenue * ((individualRates[e.id] ?? e.commissionRate ?? commissionRate) / 100))), 0))}</span>
                          </div>
                      )}

                      {Object.keys(individualRates).length > 0 && (
                        <div className={styles.saveBar}>
                          <p className={styles.saveText}>
                            Existem alterações de comissão não salvas para {Object.keys(individualRates).length} profissional(is).
                          </p>
                          <div className={styles.saveActions}>
                            <button className={styles.cancelLink} onClick={() => setIndividualRates({})}>Descartar</button>
                            <button className={styles.saveBtn} onClick={() => setShowSaveModal(true)}>Salvar Alterações</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {showSaveModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalIcon} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </div>
            <h3>SALVAR COMISSÕES</h3>
            <p>Você está prestes a atualizar as taxas de comissão permanentes para {Object.keys(individualRates).length} profissional(is). Deseja continuar?</p>
            
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowSaveModal(false)}>Cancelar</button>
              <button 
                className={styles.confirmBtn} 
                onClick={async () => {
                  try {
                    await Promise.all(
                      Object.entries(individualRates)
                        .filter(([id]) => id && id !== 'unknown')
                        .map(([id, rate]) =>
                          api.patch(`/employees/${id}`, { commissionRate: rate })
                        )
                    );
                    setIndividualRates({});
                    setShowSaveModal(false);
                    qc.invalidateQueries({ queryKey: ['finance-summary'] });
                  } catch (err) {
                    console.error('Failed to save rates', err);
                  }
                }}
              >
                Confirmar e Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mensal' && (
        <div className={styles.tabContent}>
          <div className={styles.analyticsGrid}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Comparativo de Unidades</h3>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={summary?.byUnit ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#5A5448" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }} itemStyle={{ color: '#fff' }} formatter={(v: any) => [formatCurrency(Number(v) || 0), '']} />
                    <Bar dataKey="income" name="Receita" fill="#4ade80" radius={[4,4,0,0]} />
                    <Bar dataKey="expense" name="Despesa" fill="#f87171" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Distribuição de Receita por Profissional</h3>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={summary?.byEmployee ?? []}
                      dataKey="grossRevenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                    >
                      {(summary?.byEmployee ?? []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#F59E0B', '#3B82F6', '#10B981', '#6366F1', '#EC4899'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: any) => [formatCurrency(Number(v) || 0), '']}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Top 5 Serviços (Por Receita)</h3>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    layout="vertical" 
                    data={([...(summary?.byService ?? [])].sort((a,b) => b.revenue - a.revenue).slice(0, 5))}
                    margin={{ left: 20, right: 30, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" stroke="#5A5448" fontSize={11} axisLine={false} tickLine={false} width={100} />
                    <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px', color: '#fff' }} itemStyle={{ color: '#fff' }} formatter={(v: any) => [formatCurrency(Number(v) || 0), '']} />
                    <Bar dataKey="revenue" name="Receita" fill="#6366F1" radius={[0,4,4,0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Categorias de Gastos</h3>
              <HorizontalBar title="Distribuição" items={summary?.byCategory ?? []} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'despesas' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Relatório Detalhado</h2>
            <div className={styles.reportGrid}>
              <div className={styles.reportBox}>
                <h4 className={styles.reportBoxTitle}>Categorias de Gastos</h4>
                {summary?.byCategory?.map(c => (
                  <div key={c.category} className={styles.reportRow}>
                    <span className={styles.reportLabel}>{CATEGORY_LABELS[c.category] || c.category}</span>
                    <span className={styles.reportVal}>{formatCurrency(c.amount)}</span>
                  </div>
                ))}
              </div>
              <div className={styles.reportBox}>
                <h4 className={styles.reportBoxTitle}>Resumo Financeiro</h4>
                <div className={styles.reportRow}>
                  <span className={styles.reportLabel}>Receita Bruta</span>
                  <span className={styles.reportVal}>{formatCurrency(summary?.totalIncome ?? 0)}</span>
                </div>
                <div className={styles.reportRow}>
                  <span className={styles.reportLabel}>Despesas Totais</span>
                  <span className={styles.reportVal} style={{ color: '#f87171' }}>{formatCurrency(summary?.totalExpense ?? 0)}</span>
                </div>
                <div className={styles.reportRow}>
                  <span className={styles.reportLabel}>Resultado Líquido</span>
                  <span className={styles.reportVal} style={{ color: '#4ade80' }}>{formatCurrency(summary?.netProfit ?? 0)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'lancamentos' && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Lançamentos Recentes</h2>
            <button className={styles.reportBtn} onClick={() => window.print()}>
              Imprimir PDF
            </button>
          </div>

          <div className={styles.txList}>
            {transactions.length === 0 && <p className={styles.empty}>Nenhum lançamento recente encontrado.</p>}
            {transactions.map(tx => (
              <div key={tx._id} className={styles.txRow}>
                <span className={styles.txType} style={{ background: `${TYPE_COLORS[tx.type]}22`, color: TYPE_COLORS[tx.type], border: `1px solid ${TYPE_COLORS[tx.type]}55` }}>
                  {TYPE_LABELS[tx.type]}
                </span>
                <div className={styles.txInfo}>
                  <span className={styles.txDesc}>{tx.description}</span>
                  <span className={styles.txMeta}>
                    {typeof tx.unitId === 'object' && tx.unitId?.name && <span className={styles.txUnitBadge}>{tx.unitId.name}</span>}
                    {tx.paymentMethod && <span className={styles.txPaymentBadge}>{PAYMENT_LABELS[tx.paymentMethod]}</span>}
                    {CATEGORY_LABELS[tx.category] || tx.category} 
                    {tx.employeeId && ' · Funcionario'} · {tx.date}
                  </span>
                </div>
                <div className={styles.txRight}>
                  <span className={styles.txAmount} style={{ color: TYPE_COLORS[tx.type] }}>
                    {tx.type === 'expense' ? '−' : '+'}{formatCurrency(tx.amount)}
                  </span>
                  <div className={styles.txActions}>
                    <button className={styles.actionBtn} onClick={() => { setEditingTx(tx); setShowForm(true); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className={`${styles.actionBtn} ${styles.delete}`} onClick={() => setDeletingTxId(tx._id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {deletingTxId && (
        <div className={styles.modalOverlay} onClick={() => setDeletingTxId(null)}>
          <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
            <h3>EXCLUIR LANÇAMENTO</h3>
            <p>Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeletingTxId(null)}>Cancelar</button>
              <button className={styles.deleteBtn} onClick={() => deleteMutation.mutate(deletingTxId)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <TransactionForm
          units={units}
          initialData={editingTx || undefined}
          onClose={() => { setShowForm(false); setEditingTx(null); }}
          onSuccess={() => {
            setShowForm(false);
            setEditingTx(null);
            qc.invalidateQueries({ queryKey: ['finance-summary'] });
            qc.invalidateQueries({ queryKey: ['finance-transactions'] });
          }}
        />
      )}
    </div>
  );
}
