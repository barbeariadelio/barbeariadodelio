import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend, Cell, PieChart, Pie } from 'recharts';
import TransactionForm from './TransactionForm';
import styles from './Finance.module.scss';

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Serviço',
  product: 'Produto',
  salary: 'Salário',
  rent: 'Aluguel',
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
  royaltiesPaid?: number;
  byUnit?: Array<{ unitId: string; name: string; income: number; expense: number; profit: number }>;
  byCategory?: Array<{ category: string; amount: number }>;
  byService?: Array<{ name: string; revenue: number; count: number }>;
  byEmployee?: Array<{ id: string; name: string; unitId: string; unitName: string; appointments: number; grossRevenue: number }>;
  chart?: Array<{ date: string; income: number; expense: number }>;
}

interface Transaction {
  _id: string;
  type: 'income' | 'expense' | 'royalty';
  category: string;
  amount: number;
  description: string;
  date: string;
  createdBy?: { name: string };
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
};

export default function Finance() {
  const [unitId, setUnitId] = useState('all');
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('geral');
  const [showForm, setShowForm] = useState(false);
  const [commissionRate, setCommissionRate] = useState(55);   // %
  const [taxRate, setTaxRate] = useState(27.5);               // %
  const qc = useQueryClient();

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await api.get('/units');
      return Array.isArray(data) ? data : data.units ?? [];
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', unitId, period],
    queryFn: async () => {
      const { data } = await api.get(`/finance/summary?unitId=${unitId}&period=${period}`);
      return data;
    },
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ['finance-transactions', unitId],
    queryFn: async () => {
      const params = unitId !== 'all' ? `?unitId=${unitId}` : '';
      const { data } = await api.get(`/finance/transactions${params}`);
      return Array.isArray(data) ? data : data.transactions ?? [];
    },
  });

  const kpis = [
    { label: 'Receita', value: summary?.totalIncome ?? 0, color: '#22C55E' },
    { label: 'Despesas', value: summary?.totalExpense ?? 0, color: '#EF4444' },
    { label: 'Lucro Líquido', value: summary?.netProfit ?? 0, color: (summary?.netProfit ?? 0) >= 0 ? '#22C55E' : '#EF4444' },
    { label: 'Royalties', value: summary?.royaltiesPaid ?? 0, color: '#F59E0B' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>FINANCEIRO</h1>
          <p className={styles.subtitle}>Gestão de fluxo de caixa e indicadores de desempenho</p>
        </div>
        <button className={styles.newBtn} onClick={() => setShowForm(true)}>
          + Novo Lançamento
        </button>
      </div>

      <div className={styles.filters}>
        <select
          className={styles.select}
          value={unitId}
          onChange={e => setUnitId(e.target.value)}
        >
          <option value="all">Todas as Unidades</option>
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
          {['geral', 'mensal', 'despesas', 'lancamentos'].map(tab => (
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

      {activeTab === 'geral' && (
        <>
          <div className={styles.summaryBar}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Receita Total</span>
              <span className={`${styles.summaryValue} ${styles.green}`}>{formatCurrency(summary?.totalIncome ?? 0)}</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Despesa Total</span>
              <span className={`${styles.summaryValue} ${styles.red}`}>{formatCurrency(summary?.totalExpense ?? 0)}</span>
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
                    contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px' }}
                    formatter={(v: any) => [formatCurrency(Number(v) || 0), '']}
                  />
                  <Area type="monotone" dataKey="income" name="Receita" stroke="#4ade80" strokeWidth={2} fill="url(#colorInc)" />
                  <Area type="monotone" dataKey="expense" name="Despesa" stroke="#f87171" strokeWidth={2} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Receita por Serviço Atendido</h3>
            <div className={styles.serviceGrid}>
              {(summary?.byService ?? []).length === 0 && <p className={styles.empty}>Nenhum agendamento confirmado no período.</p>}
              {summary?.byService?.map(svc => (
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

          <div className={styles.section}>
            <div className={styles.commissionSectionHead}>
              <div>
                <h3 className={styles.sectionTitle}>Comissões por Profissional</h3>
                <p className={styles.commissionSubtitle}>Agrupado por unidade de trabalho</p>
              </div>
              <div className={styles.rateControls}>
                <div className={styles.rateField}>
                  <label className={styles.rateLabel}>Comissão</label>
                  <div className={styles.rateInputWrap}>
                    <input
                      type="number"
                      className={styles.rateInput}
                      value={commissionRate}
                      min={0} max={100} step={0.5}
                      onChange={e => setCommissionRate(Number(e.target.value))}
                    />
                    <span className={styles.rateSuffix}>%</span>
                  </div>
                </div>
                <div className={styles.rateField}>
                  <label className={styles.rateLabel}>Dedução (IRRF)</label>
                  <div className={styles.rateInputWrap}>
                    <input
                      type="number"
                      className={styles.rateInput}
                      value={taxRate}
                      min={0} max={100} step={0.5}
                      onChange={e => setTaxRate(Number(e.target.value))}
                    />
                    <span className={styles.rateSuffix}>%</span>
                  </div>
                </div>
              </div>
            </div>

            {(summary?.byEmployee ?? []).length === 0 && <p className={styles.empty}>Nenhum agendamento confirmado no período.</p>}
            {(summary?.byEmployee ?? []).length > 0 && (() => {
              type Emp = { id: string; name: string; unitId: string; unitName: string; appointments: number; grossRevenue: number };
              const empList: Emp[] = summary!.byEmployee as Emp[];

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
                      <div className={styles.commissionHeader}>
                        <span>Profissional</span>
                        <span>Atend.</span>
                        <span>Receita Gerada</span>
                        <span>Sal. Bruto ({commissionRate}%)</span>
                        <span>Sal. Líquido (-{taxRate}%)</span>
                      </div>
                      {employees.map(emp => {
                        const gross = emp.grossRevenue * (commissionRate / 100);
                        const net = gross * (1 - taxRate / 100);
                        return (
                          <div key={emp.id} className={styles.commissionRow}>
                            <div className={styles.empName}>
                              <div className={styles.empAvatar}>{emp.name.charAt(0).toUpperCase()}</div>
                              <span>{emp.name}</span>
                            </div>
                            <span className={styles.commissionCell}>{emp.appointments}</span>
                            <span className={`${styles.commissionCell} ${styles.amber}`}>{formatCurrency(emp.grossRevenue)}</span>
                            <span className={`${styles.commissionCell} ${styles.blue}`}>{formatCurrency(gross)}</span>
                            <span className={`${styles.commissionCell} ${styles.green}`}>{formatCurrency(net)}</span>
                          </div>
                        );
                      })}
                      <div className={styles.commissionFooter}>
                        <span>SUBTOTAL</span>
                        <span>{employees.reduce((s, e) => s + e.appointments, 0)}</span>
                        <span>{formatCurrency(employees.reduce((s, e) => s + e.grossRevenue, 0))}</span>
                        <span>{formatCurrency(employees.reduce((s, e) => s + e.grossRevenue * (commissionRate / 100), 0))}</span>
                        <span>{formatCurrency(employees.reduce((s, e) => s + e.grossRevenue * (commissionRate / 100) * (1 - taxRate / 100), 0))}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {activeTab === 'mensal' && (
        <div className={styles.tabContent}>
          <div className={styles.monthlyGrid}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Comparativo de Unidades</h3>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={summary?.byUnit ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#5A5448" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2C2C2C', borderRadius: '8px' }} formatter={(v: any) => [formatCurrency(Number(v) || 0), '']} />
                    <Bar dataKey="income" name="Receita" fill="#4ade80" radius={[4,4,0,0]} />
                    <Bar dataKey="expense" name="Despesa" fill="#f87171" radius={[4,4,0,0]} />
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
            {transactions.map(tx => (
              <div key={tx._id} className={styles.txRow}>
                <span className={styles.txType} style={{ background: `${TYPE_COLORS[tx.type]}22`, color: TYPE_COLORS[tx.type], border: `1px solid ${TYPE_COLORS[tx.type]}55` }}>
                  {TYPE_LABELS[tx.type]}
                </span>
                <div className={styles.txInfo}>
                  <span className={styles.txDesc}>{tx.description}</span>
                  <span className={styles.txMeta}>{CATEGORY_LABELS[tx.category] || tx.category} · {tx.date}</span>
                </div>
                <span className={styles.txAmount} style={{ color: TYPE_COLORS[tx.type] }}>
                  {tx.type === 'expense' ? '−' : '+'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <TransactionForm
          units={units}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['finance-summary'] });
            qc.invalidateQueries({ queryKey: ['finance-transactions'] });
          }}
        />
      )}
    </div>
  );
}
