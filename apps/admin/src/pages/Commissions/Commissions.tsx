import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import EmployeeVales from '../Employees/EmployeeVales';
import styles from './Commissions.module.scss';

interface EmployeeSummary {
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

interface Commission {
  _id: string;
  amount: number;
  payableAmount?: number;
  deductedVales?: number;
  description: string;
  date: string;
  isPaid?: boolean;
  appointmentId?: {
    _id?: string;
    date?: string;
    startTime?: string;
    clientId?: { name: string } | null;
    serviceId?: { name: string } | null;
    price?: number;
  };
}

interface PaymentHistoryItem {
  _id: string;
  amount: number;
  description?: string;
  date: string;
}

/** Mirrors PaymentPreview in @barber/types — computed by the server, never here. */
interface PaymentPreview {
  commissionCount: number;
  commissionTotal: number;
  voucherDeduction: number;
  netAmount: number;
  vouchers: Array<{ voucherId: string; description: string; date: string; outstandingAmount: number; deduction: number }>;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return iso.split('-').reverse().join('/');
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_FULL  = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmtDayMonth(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(d)}/${MONTHS_SHORT[parseInt(m) - 1]}`;
}

function getMonthsList(count = 18) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    return {
      label: `${MONTHS_FULL[m]}/${y}`,
      start: toISO(new Date(y, m, 1)),
      end:   toISO(new Date(y, m + 1, 0)),
    };
  });
}

const PRESETS = [
  { key: 'all',    label: 'Todos' },
  { key: 'day',    label: 'Dia' },
  { key: 'week',   label: 'Semana' },
  { key: 'month',  label: 'Mês' },
  { key: 'custom', label: 'Personalizado' },
] as const;

type Preset = typeof PRESETS[number]['key'];

function getInitialRange(p: Preset): { start: string; end: string } {
  const today = new Date();
  if (p === 'day') return { start: toISO(today), end: toISO(today) };
  if (p === 'week') {
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: toISO(mon), end: toISO(sun) };
  }
  if (p === 'month') {
    return {
      start: toISO(new Date(today.getFullYear(), today.getMonth(), 1)),
      end:   toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  return { start: '', end: '' };
}

export default function Commissions() {
  const { user } = useAuth();
  const isEmployee = (user as any)?.role === 'employee';
  const selfId = (user as any)?.id || (user as any)?._id;
  const qc = useQueryClient();
  const unitId = getSelectedUnitId() || (user as any)?.unitId;

  const initialWeekRange = getInitialRange('week');
  const [preset, setPreset] = useState<Preset>('week');
  const [filterStart, setFilterStart] = useState(initialWeekRange.start);
  const [filterEnd, setFilterEnd] = useState(initialWeekRange.end);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const dropdownRef    = useRef<HTMLDivElement>(null);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const [detailEmpId, setDetailEmpId] = useState<string | null>(isEmployee ? selfId : null);
  const [detailEmpName, setDetailEmpName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPayForm, setShowPayForm] = useState(false);
  const [payDate, setPayDate] = useState(toISO(new Date()));
  const [payDesc, setPayDesc] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState<string | null>(null);

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [customDay, setCustomDay] = useState('');
  const dayPickerRef = useRef<HTMLDivElement>(null);

  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const weekPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) setMonthPickerOpen(false);
      if (dayPickerRef.current && !dayPickerRef.current.contains(e.target as Node)) setDayPickerOpen(false);
      if (weekPickerRef.current && !weekPickerRef.current.contains(e.target as Node)) setWeekPickerOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function getPeriodLabel() {
    if (!filterStart) return '';
    if (preset === 'month') {
      const [y, m] = filterStart.split('-');
      return `${MONTHS_FULL[parseInt(m) - 1]}/${y}`;
    }
    if (preset === 'day') return fmtDayMonth(filterStart);
    return `${fmtDayMonth(filterStart)} – ${fmtDayMonth(filterEnd)}`;
  }

  function applyPreset(p: Preset) {
    setDropdownOpen(false); setSelected(new Set());
    if (p === 'custom') {
      setPreset(p);
      setCustomFrom(filterStart || toISO(new Date()));
      setCustomTo(filterEnd || toISO(new Date()));
      setShowCustomModal(true);
      return;
    }
    setPreset(p);
    const r = getInitialRange(p);
    setFilterStart(r.start); setFilterEnd(r.end);
  }

  function applyCustomRange() {
    if (customFrom && customTo) {
      setFilterStart(customFrom); setFilterEnd(customTo);
    }
    setShowCustomModal(false);
  }

  function applyDayOption(opt: 'today' | 'yesterday' | 'other') {
    setDayPickerOpen(false);
    if (opt === 'today') {
      const d = toISO(new Date()); setFilterStart(d); setFilterEnd(d); setSelected(new Set());
    } else if (opt === 'yesterday') {
      const y = new Date(); y.setDate(y.getDate() - 1); const d = toISO(y);
      setFilterStart(d); setFilterEnd(d); setSelected(new Set());
    } else {
      setCustomDay(filterStart || toISO(new Date())); setShowDayModal(true);
    }
  }

  function applyDayModal() {
    if (customDay) { setFilterStart(customDay); setFilterEnd(customDay); setSelected(new Set()); }
    setShowDayModal(false);
  }

  function applyWeekOption(opt: 'this' | 'last') {
    setWeekPickerOpen(false);
    const today = new Date();
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    if (opt === 'last') mon.setDate(mon.getDate() - 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    setFilterStart(toISO(mon)); setFilterEnd(toISO(sun)); setSelected(new Set());
  }

  function shiftPeriod(dir: -1 | 1) {
    if (!filterStart) return;
    const base = new Date(filterStart + 'T12:00:00');
    if (preset === 'day') {
      base.setDate(base.getDate() + dir);
      setFilterStart(toISO(base)); setFilterEnd(toISO(base));
    } else if (preset === 'week') {
      base.setDate(base.getDate() + dir * 7);
      const end = new Date(base); end.setDate(base.getDate() + 6);
      setFilterStart(toISO(base)); setFilterEnd(toISO(end));
    } else if (preset === 'month') {
      const s = new Date(base.getFullYear(), base.getMonth() + dir, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      setFilterStart(toISO(s)); setFilterEnd(toISO(e));
    }
    setSelected(new Set());
  }

  const canNavigate = preset === 'day' || preset === 'week' || preset === 'month';
  const currentLabel = PRESETS.find(p => p.key === preset)?.label ?? 'Todos';
  const monthsList = useMemo(() => getMonthsList(18), []);

  /* ── Queries ── */
  const summaryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (unitId) p.set('unitId', unitId);
    if (filterStart) p.set('start', filterStart);
    if (filterEnd) p.set('end', filterEnd);
    return p.toString();
  }, [unitId, filterStart, filterEnd]);

  const { data: summary = [], isLoading: summaryLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ['commissions-summary', unitId, filterStart, filterEnd],
    queryFn: async () => {
      const { data } = await api.get(`/finance/remunerations/summary?${summaryQs}`);
      return Array.isArray(data) ? data : [];
    },
  });

  const detailQs = useMemo(() => {
    const p = new URLSearchParams();
    if (detailEmpId) p.set('employeeId', detailEmpId);
    if (unitId) p.set('unitId', unitId);
    if (filterStart) p.set('start', filterStart);
    if (filterEnd) p.set('end', filterEnd);
    return p.toString();
  }, [detailEmpId, unitId, filterStart, filterEnd]);

  const { data: commissions = [], isLoading: detailLoading } = useQuery<Commission[]>({
    queryKey: ['commissions-detail', detailEmpId, filterStart, filterEnd],
    queryFn: async () => {
      const { data } = await api.get(`/finance/remunerations?${detailQs}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!detailEmpId,
  });

  const paymentHistoryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (detailEmpId) p.set('employeeId', detailEmpId);
    if (unitId) p.set('unitId', unitId);
    p.set('category', 'salary');
    p.set('limit', '20');
    return p.toString();
  }, [detailEmpId, unitId]);

  const { data: paymentHistory = [], isLoading: paymentHistoryLoading } = useQuery<PaymentHistoryItem[]>({
    queryKey: ['commission-payments', detailEmpId, unitId],
    queryFn: async () => {
      const { data } = await api.get(`/finance/transactions?${paymentHistoryQs}`);
      return Array.isArray(data?.data) ? data.data : [];
    },
    enabled: !!detailEmpId,
  });

  const totalPaymentHistory = paymentHistory.reduce((sum, item) => sum + item.amount, 0);

  const unpaid = commissions.filter(c => !c.isPaid);
  const paid   = commissions.filter(c => c.isPaid);
  const currentEmpSummary = summary.find(s => s.employeeId === detailEmpId);
  const selectedGrossTotal = unpaid.filter(c => selected.has(c._id)).reduce((s, c) => s + c.amount, 0);

  // Exactly the ids handleSubmit will send, so the preview can never quote a
  // different set of commissions than the one actually paid.
  const commissionIdsToPay = useMemo(
    () => [...(selected.size > 0 ? Array.from(selected) : unpaid.map(c => c._id))].sort(),
    [selected, unpaid],
  );

  // The payout is whatever the server says it is. Deducting outstanding
  // advances here by hand is what made this screen disagree with the ledger.
  const { data: preview, isError: previewFailed } = useQuery<PaymentPreview>({
    queryKey: ['payment-preview', detailEmpId, unitId, payDate, commissionIdsToPay],
    queryFn: async () => {
      const { data } = await api.post('/finance/payment/preview', {
        employeeId: detailEmpId,
        unitId,
        commissionIds: commissionIdsToPay,
        date: payDate,
      });
      return data;
    },
    enabled: !isEmployee && !!detailEmpId && commissionIdsToPay.length > 0,
  });

  const aPagar = preview?.netAmount ?? currentEmpSummary?.pendingAmount ?? 0;
  const valeDeduction = preview?.voucherDeduction ?? 0;
  // Derived rather than read from `isPending`: a disabled React Query stays
  // `pending` forever. On failure we let the payment proceed — the server
  // computes the real figure regardless, and blocking payroll on a failed
  // read-only call would be worse than hiding the breakdown.
  const previewPending = commissionIdsToPay.length > 0 && !preview && !previewFailed;

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openPayForm() {
    if (selected.size === 0) {
      setSelected(new Set(unpaid.map(c => c._id)));
    }
    setPayDesc('Pagamento semanal de comissões');
    setPayError(null);
    setShowPayForm(true);
  }

  const registerPayment = useMutation({
    mutationFn: (payload: any) => api.post('/finance/payment', payload),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['commissions-detail'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      qc.invalidateQueries({ queryKey: ['commission-payments'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['payment-preview'] });
      qc.invalidateQueries({ queryKey: ['employee-vales'] });
      setShowPayForm(false);
      setSelected(new Set());
      // Report the amount actually recorded, not the one the screen predicted.
      const recorded: unknown = res?.data?.amount;
      setPaySuccess(
        typeof recorded === 'number'
          ? `Pagamento registrado — ${formatCurrency(recorded)} em dinheiro.`
          : 'Pagamento registrado com sucesso!',
      );
      setTimeout(() => setPaySuccess(null), 5000);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao registrar pagamento. Tente novamente.';
      setPayError(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (commissionIdsToPay.length === 0) return;
    setPayError(null);
    registerPayment.mutate({
      employeeId: detailEmpId,
      unitId,
      commissionIds: commissionIdsToPay,
      description: payDesc,
      date: payDate,
    });
  }

  function openDetail(empId: string, empName: string) {
    setDetailEmpId(empId); setDetailEmpName(empName); setSelected(new Set()); setShowPayForm(false);
  }

  function backToTable() {
    setDetailEmpId(null); setDetailEmpName(''); setSelected(new Set()); setShowPayForm(false);
  }

  return (
    <div className={styles.page}>
      {/* ── Toast de sucesso ── */}
      {paySuccess && (
        <div className={styles.successToast}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {paySuccess}
        </div>
      )}

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          {detailEmpId && !isEmployee && (
            <button className={styles.backBtn} onClick={backToTable}>← Voltar</button>
          )}
          <div>
            <h1 className={styles.pageTitle}>{detailEmpId ? (detailEmpName || 'Comissões') : 'Remunerações'}</h1>
            {!detailEmpId && <p className={styles.pageSubtitle}>Resumo por profissional</p>}
          </div>
        </div>
        {detailEmpId && !isEmployee && !showPayForm && unpaid.length > 0 && (
          <button
            className={styles.payBtn}
            onClick={openPayForm}
          >
            Registrar Pagamento Semanal · {formatCurrency(aPagar)}
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className={styles.filterBar}>
        {/* Period type dropdown */}
        <div className={styles.dropdownWrap} ref={dropdownRef}>
          <button className={styles.dropdownBtn} onClick={() => setDropdownOpen(o => !o)}>
            {currentLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {dropdownOpen && (
            <div className={styles.dropdownMenu}>
              {PRESETS.map(p => (
                <button key={p.key}
                  className={`${styles.dropdownItem} ${preset === p.key ? styles.dropdownItemActive : ''}`}
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation arrows */}
        {canNavigate && filterStart && (
          <div className={styles.navBar}>
            <button className={styles.navBtn} onClick={() => shiftPeriod(-1)}>‹</button>

            {/* Day picker */}
            {preset === 'day' ? (
              <div className={styles.monthPickerWrap} ref={dayPickerRef}>
                <button className={styles.navLabelBtn} onClick={() => setDayPickerOpen(o => !o)}>
                  {getPeriodLabel()}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {dayPickerOpen && (
                  <div className={styles.monthPickerMenu}>
                    <button className={styles.monthPickerBack} onClick={() => setDayPickerOpen(false)}>← Voltar</button>
                    <button className={styles.monthPickerItem} onClick={() => applyDayOption('today')}>Hoje</button>
                    <button className={styles.monthPickerItem} onClick={() => applyDayOption('yesterday')}>Ontem</button>
                    <button className={styles.monthPickerItem} onClick={() => applyDayOption('other')}>Outro...</button>
                  </div>
                )}
              </div>
            ) : preset === 'week' ? (
              <div className={styles.monthPickerWrap} ref={weekPickerRef}>
                <button className={styles.navLabelBtn} onClick={() => setWeekPickerOpen(o => !o)}>
                  {getPeriodLabel()}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {weekPickerOpen && (
                  <div className={styles.monthPickerMenu}>
                    <button className={styles.monthPickerBack} onClick={() => setWeekPickerOpen(false)}>← Voltar</button>
                    <button className={styles.monthPickerItem} onClick={() => applyWeekOption('this')}>Esta semana</button>
                    <button className={styles.monthPickerItem} onClick={() => applyWeekOption('last')}>Semana passada</button>
                  </div>
                )}
              </div>
            ) : preset === 'month' ? (
              <div className={styles.monthPickerWrap} ref={monthPickerRef}>
                <button className={styles.navLabelBtn} onClick={() => setMonthPickerOpen(o => !o)}>
                  {getPeriodLabel()}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {monthPickerOpen && (
                  <div className={styles.monthPickerMenu}>
                    <button className={styles.monthPickerBack} onClick={() => setMonthPickerOpen(false)}>
                      ← Voltar
                    </button>
                    {monthsList.map(m => (
                      <button
                        key={m.start}
                        className={`${styles.monthPickerItem} ${m.start === filterStart ? styles.monthPickerItemActive : ''}`}
                        onClick={() => {
                          setFilterStart(m.start); setFilterEnd(m.end);
                          setMonthPickerOpen(false); setSelected(new Set());
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={styles.navLabel}>{getPeriodLabel()}</span>
            )}

            <button className={styles.navBtn} onClick={() => shiftPeriod(1)}>›</button>
          </div>
        )}

        {/* Custom range label */}
        {preset === 'custom' && filterStart && filterEnd && (
          <button className={styles.customRangeLabel} onClick={() => { setCustomFrom(filterStart); setCustomTo(filterEnd); setShowCustomModal(true); }}>
            {formatDate(filterStart)} – {formatDate(filterEnd)}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Day modal ── */}
      {showDayModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDayModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Escolher Dia</h2>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Data</label>
              <input type="date" className={styles.modalInput} value={customDay} onChange={e => setCustomDay(e.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalVoltar} onClick={() => setShowDayModal(false)}>VOLTAR</button>
              <button className={styles.modalPesquisar} onClick={applyDayModal} disabled={!customDay}>PESQUISAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom period modal ── */}
      {showCustomModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCustomModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Escolher Período</h2>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>De</label>
              <input type="date" className={styles.modalInput} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Até</label>
              <input type="date" className={styles.modalInput} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalVoltar} onClick={() => setShowCustomModal(false)}>VOLTAR</button>
              <button className={styles.modalPesquisar} onClick={applyCustomRange} disabled={!customFrom || !customTo}>PESQUISAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary table ── */}
      {!detailEmpId && (
        summaryLoading ? (
          <div className={styles.loadingWrap}>
            <span className={styles.spinner} />
            <span className={styles.loadingText}>Carregando remunerações...</span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thEmp}>Profissional</th>
                  <th className={styles.thNum}>Taxa %</th>
                  <th className={styles.thNum}>Receita Gerada (R$)</th>
                  <th className={styles.thNum}>Comissão Total (R$)</th>
                  <th className={styles.thNum}>Valor Pago (R$)</th>
                  <th className={styles.thNum}>Pendente Pagamento (R$)</th>
                  <th className={styles.thNum}>Vales Pendentes (R$)</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr><td colSpan={7} className={styles.emptyCell}>Nenhum dado no período.</td></tr>
                ) : summary.map(row => (
                  <tr key={row.employeeId}
                    className={`${styles.tableRow} ${!isEmployee ? styles.tableRowClickable : ''}`}
                    onClick={() => !isEmployee && openDetail(row.employeeId, row.name)}
                  >
                    <td className={styles.tdEmp}>
                      {row.avatar
                        ? <img src={row.avatar} className={styles.empAvatar} alt={row.name} />
                        : <div className={styles.empInitial}>{row.name[0]?.toUpperCase()}</div>
                      }
                      <span className={styles.empName}>{row.name}</span>
                    </td>
                    <td className={styles.tdNum}>{(row.commissionRate ?? 0).toLocaleString('pt-BR')}%</td>
                    <td className={styles.tdNum}>{formatCurrency(row.grossRevenue ?? 0)}</td>
                    <td className={styles.tdNum}>{formatCurrency(row.totalAmount)}</td>
                    <td className={styles.tdNum}>{formatCurrency(row.paidAmount)}</td>
                    <td className={`${styles.tdNum} ${row.pendingAmount > 0 ? styles.tdPending : ''}`}>
                      {formatCurrency(row.pendingAmount)}
                    </td>
                    <td className={`${styles.tdNum} ${(row.valesAmount ?? 0) > 0 ? styles.tdPending : ''}`}>
                      {formatCurrency(row.valesAmount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Detail view ── */}
      {detailEmpId && (
        <>
          {!detailLoading && unpaid.length > 0 && (
            <div className={styles.summaryBar}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryVal}>{unpaid.length}</span>
                <span className={styles.summaryLbl}>pendente{unpaid.length !== 1 ? 's' : ''}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryItem}>
                <span className={styles.summaryVal} style={{ color: '#16a34a' }}>{formatCurrency(aPagar)}</span>
                <span className={styles.summaryLbl}>a pagar</span>
              </div>
              {selected.size > 0 && (
                <>
                  <div className={styles.summaryDivider} />
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryVal}>{selected.size} sel.</span>
                    <span className={styles.summaryLbl}>{formatCurrency(selectedGrossTotal)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {!isEmployee && unpaid.length > 0 && !showPayForm && (
            <div className={styles.selectBar}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.selectBarIcon}>
                <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <span className={styles.selectBarHint}>
                {selected.size === 0
                  ? 'Selecione as comissões abaixo para registrar um pagamento'
                  : `${selected.size} de ${unpaid.length} selecionada${selected.size !== 1 ? 's' : ''} · ${formatCurrency(selectedGrossTotal)}`}
              </span>
              <button className={styles.selectAllBtn} onClick={() => setSelected(new Set(unpaid.map(c => c._id)))}>Selecionar todas</button>
              {selected.size > 0 && <button className={styles.clearBtn} onClick={() => setSelected(new Set())}>Limpar</button>}
            </div>
          )}

          {showPayForm && (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Data do pagamento</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
                </div>
              </div>
              <div className={styles.field}>
                <label>Descrição</label>
                <input type="text" value={payDesc} onChange={e => setPayDesc(e.target.value)} />
              </div>
              <div className={styles.payBreakdown}>
                <div className={styles.payBreakdownRow}>
                  <span>Comissões selecionadas ({preview?.commissionCount ?? commissionIdsToPay.length})</span>
                  <span>{formatCurrency(preview?.commissionTotal ?? selectedGrossTotal)}</span>
                </div>
                {valeDeduction > 0 && (
                  <div className={`${styles.payBreakdownRow} ${styles.payBreakdownDeduction}`}>
                    <span>Vales abatidos ({preview?.vouchers.length ?? 0})</span>
                    <span>− {formatCurrency(valeDeduction)}</span>
                  </div>
                )}
                <div className={`${styles.payBreakdownRow} ${styles.payBreakdownTotal}`}>
                  <span>A pagar em dinheiro</span>
                  {/* Only the server's figure — the period-wide fallback would
                      overstate a partial selection, the original bug. */}
                  <span>{preview ? formatCurrency(preview.netAmount) : previewFailed ? '—' : 'calculando...'}</span>
                </div>
              </div>
              {valeDeduction > 0 && (
                <div className={styles.payFormSummary}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  As comissões serão marcadas como pagas integralmente; {formatCurrency(valeDeduction)} quitam vales em aberto e não saem do caixa.
                </div>
              )}
              {payError && (
                <div className={styles.payFormError}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {payError}
                </div>
              )}
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>Cancelar</button>
                <button type="submit" className={styles.submitBtn} disabled={registerPayment.isPending || selected.size === 0 || previewPending}>
                  {registerPayment.isPending ? 'Salvando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          )}

          <div className={styles.detailColumns}>
            <div>
              {detailLoading ? (
                <div className={styles.loadingWrap}>
                  <span className={styles.spinner} />
                  <span className={styles.loadingText}>Carregando comissões...</span>
                </div>
              ) : unpaid.length === 0 && paid.length === 0 ? (
                <p className={styles.empty}>Nenhuma comissão no período selecionado.</p>
              ) : (
                <div className={styles.lists}>
                  {unpaid.length > 0 && (
                    <section>
                      <div className={styles.sectionLabel}>Pendentes ({unpaid.length})</div>
                      <div className={styles.list}>
                        {unpaid.map(c => {
                          const isSelected = selected.has(c._id);
                          const appt = c.appointmentId;
                          const label = appt?.serviceId?.name || c.description;
                          const dateStr = appt?.date ? formatDate(appt.date) : formatDate(c.date);
                          const clientName = appt?.clientId?.name;
                          return (
                            <div key={c._id}
                              className={`${styles.commRow} ${isSelected ? styles.commRowSelected : ''} ${!isEmployee ? styles.commRowClickable : ''}`}
                              onClick={() => !isEmployee && toggleSelect(c._id)}
                            >
                              {!isEmployee && (
                                <input type="checkbox" className={styles.checkbox} checked={isSelected}
                                  onChange={() => toggleSelect(c._id)} onClick={e => e.stopPropagation()} />
                              )}
                              <div className={styles.commInfo}>
                                <span className={styles.commDesc}>{label}</span>
                                {clientName && <span className={styles.commClient}>{clientName}</span>}
                                <span className={styles.commDate}>{dateStr}{appt?.startTime ? ` · ${appt.startTime}` : ''}</span>
                              </div>
                              <div className={styles.commRight}>
                                <span className={styles.commAmount}>{formatCurrency(c.amount)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {!isEmployee && paid.length > 0 && (
                    <section style={{ marginTop: '1.5rem' }}>
                      <div className={styles.sectionLabel}>Pagos ({paid.length})</div>
                      <div className={styles.list}>
                        {paid.map(c => {
                          const appt = c.appointmentId;
                          const label = appt?.serviceId?.name || c.description;
                          const dateStr = appt?.date ? formatDate(appt.date) : formatDate(c.date);
                          const clientName = appt?.clientId?.name;
                          return (
                            <div key={c._id} className={`${styles.commRow} ${styles.commRowPaid}`}>
                              <div className={styles.commInfo}>
                                <span className={styles.commDesc}>{label}</span>
                                {clientName && <span className={styles.commClient}>{clientName}</span>}
                                <span className={styles.commDate}>{dateStr}{appt?.startTime ? ` · ${appt.startTime}` : ''}</span>
                              </div>
                              <div className={styles.commRight}>
                                <span className={styles.commAmount}>{formatCurrency(c.amount)}</span>
                                <span className={styles.paidBadge}>Pago</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            <div className={styles.sideStack}>
              <section className={styles.paymentHistory}>
                <div className={styles.paymentHistoryHeader}>
                  <div>
                    <h2 className={styles.paymentHistoryTitle}>Historico de pagamentos</h2>
                    <p className={styles.paymentHistorySubtitle}>Valores pagos ao barbeiro</p>
                  </div>
                  <span className={styles.paymentHistoryTotal}>{formatCurrency(totalPaymentHistory)}</span>
                </div>
                {paymentHistoryLoading ? (
                  <p className={styles.paymentHistoryEmpty}>Carregando pagamentos...</p>
                ) : paymentHistory.length === 0 ? (
                  <p className={styles.paymentHistoryEmpty}>Nenhum pagamento registrado.</p>
                ) : (
                  <div className={styles.paymentHistoryList}>
                    {paymentHistory.map(payment => (
                      <div key={payment._id} className={styles.paymentHistoryItem}>
                        <div>
                          <span className={styles.paymentHistoryDesc}>{payment.description || 'Pagamento de comissoes'}</span>
                          <span className={styles.paymentHistoryDate}>{formatDate(payment.date)}</span>
                        </div>
                        <strong>{formatCurrency(payment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {!isEmployee && (
                <EmployeeVales employeeId={detailEmpId} unitId={unitId} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
