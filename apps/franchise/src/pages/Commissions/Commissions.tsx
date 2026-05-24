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

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return iso.split('-').reverse().join('/');
}

function formatBR(n: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function parseBR(s: string) {
  return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
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

  const [preset, setPreset] = useState<Preset>('all');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const dropdownRef    = useRef<HTMLDivElement>(null);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const [detailEmpId, setDetailEmpId] = useState<string | null>(isEmployee ? selfId : null);
  const [detailEmpName, setDetailEmpName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(toISO(new Date()));
  const [payDesc, setPayDesc] = useState('');

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

  const unpaid = commissions.filter(c => !c.isPaid);
  const paid   = commissions.filter(c => c.isPaid);
  const getPayableAmount = (commission: Commission) => commission.payableAmount ?? commission.amount;
  const selectedTotal = unpaid.filter(c => selected.has(c._id)).reduce((s, c) => s + getPayableAmount(c), 0);
  const totalPending  = unpaid.reduce((s, c) => s + getPayableAmount(c), 0);
  const currentEmpSummary = summary.find(s => s.employeeId === detailEmpId);
  const aPagar = currentEmpSummary?.pendingAmount ?? totalPending;

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openPayForm() {
    setPayAmount(formatBR(Math.max(0, aPagar)));
    setPayDesc(`Pagamento de comissões (${selected.size} atend.)`);
    setShowPayForm(true);
  }

  const registerPayment = useMutation({
    mutationFn: (payload: any) => api.post('/finance/payment', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions-detail'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setShowPayForm(false); setSelected(new Set());
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseBR(payAmount);
    if (!amount || selected.size === 0) return;
    registerPayment.mutate({ employeeId: detailEmpId, unitId, commissionIds: Array.from(selected), amount, description: payDesc, date: payDate });
  }

  function openDetail(empId: string, empName: string) {
    setDetailEmpId(empId); setDetailEmpName(empName); setSelected(new Set()); setShowPayForm(false);
  }

  function backToTable() {
    setDetailEmpId(null); setDetailEmpName(''); setSelected(new Set()); setShowPayForm(false);
  }

  return (
    <div className={styles.page}>
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
        {detailEmpId && !isEmployee && selected.size > 0 && !showPayForm && aPagar > 0 && (
          <button className={styles.payBtn} onClick={openPayForm}>
            Registrar Pagamento · {formatCurrency(aPagar)}
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
          <p className={styles.empty}>Carregando...</p>
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
                    <span className={styles.summaryLbl}>{formatCurrency(selectedTotal)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {!isEmployee && unpaid.length > 0 && !showPayForm && (
            <div className={styles.selectBar}>
              <button className={styles.selectAllBtn} onClick={() => setSelected(new Set(unpaid.map(c => c._id)))}>Selecionar todos</button>
              {selected.size > 0 && <button className={styles.clearBtn} onClick={() => setSelected(new Set())}>Limpar</button>}
            </div>
          )}

          {showPayForm && (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Valor pago (R$)</label>
                  <input type="text" inputMode="decimal" value={payAmount}
                    onChange={e => setPayAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                    onBlur={() => { const n = parseBR(payAmount); if (n > 0) setPayAmount(formatBR(n)); }}
                    required />
                </div>
                <div className={styles.field}>
                  <label>Data</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
                </div>
              </div>
              <div className={styles.field}>
                <label>Descrição</label>
                <input type="text" value={payDesc} onChange={e => setPayDesc(e.target.value)} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>Cancelar</button>
                <button type="submit" className={styles.submitBtn} disabled={registerPayment.isPending}>
                  {registerPayment.isPending ? 'Salvando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          )}

          <div className={styles.detailColumns}>
            <div>
              {detailLoading ? (
                <p className={styles.empty}>Carregando...</p>
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
                                <span className={styles.commAmount}>{formatCurrency(getPayableAmount(c))}</span>
                                {(c.deductedVales ?? 0) > 0 && (
                                  <span className={styles.valeDeduction}>Vale -{formatCurrency(c.deductedVales ?? 0)}</span>
                                )}
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
                                <span className={styles.commAmount}>{formatCurrency(getPayableAmount(c))}</span>
                                {(c.deductedVales ?? 0) > 0 && (
                                  <span className={styles.valeDeduction}>Vale -{formatCurrency(c.deductedVales ?? 0)}</span>
                                )}
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

            {!isEmployee && (
              <EmployeeVales employeeId={detailEmpId} unitId={unitId} availableCommissions={unpaid} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
