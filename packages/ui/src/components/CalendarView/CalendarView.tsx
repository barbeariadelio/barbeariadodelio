import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, addMonths, subMonths, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './CalendarView.module.scss';

export interface CalendarAppointment {
  _id: string;
  clientId: { _id?: string; name: string } | null;
  employeeId: { name: string } | null;
  serviceId: { name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
  isPackage?: boolean;
  isBilled?: boolean;
  usedPackageId?: string;
  price: number;
  notes?: string;
}

export interface CalendarEmployee {
  _id: string;
  name: string;
  blockedDays?: string[];
  vacations?: { start: string; end: string }[];
}

const PACKAGE_COLOR = { bg: 'rgba(255,109,0,0.12)', text: '#FF6D00', border: 'rgba(255,109,0,0.3)', solid: '#FF6D00' };

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; solid: string }> = {
  confirmed: { bg: 'rgba(34,197,94,0.12)',   text: '#22C55E', border: 'rgba(34,197,94,0.3)',   solid: '#22C55E' },
  completed: { bg: 'rgba(21,101,192,0.12)',   text: '#1565C0', border: 'rgba(21,101,192,0.3)',  solid: '#1565C0' },
  pending:   { bg: 'rgba(245,158,11,0.12)',   text: '#F59E0B', border: 'rgba(245,158,11,0.3)',  solid: '#F59E0B' },
  cancelled: { bg: 'rgba(239,68,68,0.12)',    text: '#EF4444', border: 'rgba(239,68,68,0.3)',   solid: '#C62828' },
  blocked:   { bg: 'rgba(107,114,128,0.15)',  text: '#6B7280', border: 'rgba(107,114,128,0.3)', solid: '#6B7280' },
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  pending:   'Pendente',
  cancelled: 'Cancelado',
  blocked:   'Bloqueado',
};

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type ViewMode = 'month' | 'day';

interface Props {
  appointments: CalendarAppointment[];
  employees?: CalendarEmployee[];
  month?: Date;
  onMonthChange?: (m: Date) => void;
  onUpdate?: () => void;
  onDayClick?: (day: Date) => void;
  // Feature flags / permissions
  canEdit?: boolean;
  canDelete?: boolean;
  onStatusChange?: (id: string, status: string, options?: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isProcessing?: boolean;
}

function IconChevronLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface ModalProps {
  appt: CalendarAppointment;
  onClose: () => void;
  onStatusChange?: (id: string, status: string, options?: any) => void;
  onDelete?: (id: string) => void;
  isPending: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

function AppointmentModal({ appt, onClose, onStatusChange, onDelete, isPending, canEdit, canDelete }: ModalProps) {
  const c = appt.isPackage && appt.status !== 'cancelled' ? PACKAGE_COLOR : STATUS_COLORS[appt.status] || STATUS_COLORS.confirmed;
  const otherStatuses = (['confirmed', 'completed', 'cancelled'] as const).filter(s => s !== appt.status);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isBilling, setIsBilling] = useState(false);
  const [localPrice, setLocalPrice] = useState(appt.price?.toString().replace('.', ',') || '0,00');
  const [paymentMethod, setPaymentMethod] = useState<'money' | 'card' | 'pix' | 'other'>('pix');
  const [registerPayment, setRegisterPayment] = useState(true);

  const dateFmt = format(parseISO(appt.date), "EEEE, dd 'de' MMMM", { locale: ptBR });

  if (isBilling) {
    return (
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.panel} style={{ maxWidth: 400 }}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Finalizar Atendimento</div>
            <button className={styles.closeBtn} onClick={() => setIsBilling(false)}><IconX /></button>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.billingField}>
              <label className={styles.detailLabel}>Valor Final</label>
              <div className={styles.billingInputRow}>
                <span>R$</span>
                <input 
                  type="text" 
                  className={styles.billingInput}
                  value={localPrice}
                  onChange={e => setLocalPrice(e.target.value.replace(/[^0-9,]/g, ''))}
                  autoFocus
                />
              </div>
            </div>
            {appt.usedPackageId ? (
              <div style={{ marginTop: '1.5rem' }}>
                <div className={styles.packageNotice}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  <span>Sessão de Pacote</span>
                </div>
                {/* Toggle: gerar ou não cobrança financeira */}
                <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '10px', background: 'var(--surface-2, #f5f5f5)', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                    <div
                      onClick={() => setRegisterPayment(v => !v)}
                      style={{
                        width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0,
                        background: registerPayment ? '#1565C0' : '#D1D5DB',
                        transition: 'background 0.2s', position: 'relative', cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: registerPayment ? '21px' : '3px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {registerPayment ? 'Registrar pagamento' : 'Sem cobrança'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #6B7280)', marginTop: '2px' }}>
                        {registerPayment
                          ? 'Gera transação e comissão para o barbeiro'
                          : 'Apenas desconta a sessão do pacote, sem transação'}
                      </div>
                    </div>
                  </label>
                </div>
                {/* Forma de pagamento visível apenas se registerPayment */}
                {registerPayment && (
                  <div className={styles.billingField} style={{ marginTop: '1.25rem' }}>
                    <label className={styles.detailLabel}>Forma de Pagamento</label>
                    <div className={styles.paymentGrid}>
                      {['money', 'card', 'pix', 'other'].map(pm => (
                        <button
                          key={pm}
                          className={`${styles.paymentBtn} ${paymentMethod === pm ? styles.pmActive : ''}`}
                          onClick={() => setPaymentMethod(pm as any)}
                        >
                          {pm === 'money' ? 'Dinheiro' : pm === 'card' ? 'Cartão' : pm === 'pix' ? 'Pix' : 'Outro'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.billingField} style={{ marginTop: '1.5rem' }}>
                <label className={styles.detailLabel}>Forma de Pagamento</label>
                <div className={styles.paymentGrid}>
                  {['money', 'card', 'pix', 'other'].map(pm => (
                    <button
                      key={pm}
                      className={`${styles.paymentBtn} ${paymentMethod === pm ? styles.pmActive : ''}`}
                      onClick={() => setPaymentMethod(pm as any)}
                    >
                      {pm === 'money' ? 'Dinheiro' : pm === 'card' ? 'Cartão' : pm === 'pix' ? 'Pix' : 'Outro'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.billingActions} style={{ marginTop: '2rem' }}>
               <button className={styles.cancelBillingBtn} onClick={() => setIsBilling(false)}>Voltar</button>
               <button
                 className={styles.confirmBillingBtn}
                 disabled={isPending}
                 onClick={async () => {
                   await onStatusChange?.(appt._id, 'completed', {
                     price: parseFloat(localPrice.replace(',', '.')),
                     paymentMethod,
                     skipBilling: appt.usedPackageId ? !registerPayment : false,
                   });
                   setIsBilling(false);
                 }}
               >
                 {isPending ? 'Processando...' : 'Confirmar e Concluir'}
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ borderTop: `4px solid ${c.solid}` }}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle} style={{ fontSize: '1.5rem', fontWeight: 800 }}>
            {appt.clientId?.name ?? 'Cliente'}
          </div>
          <button className={styles.closeBtn} onClick={onClose}><IconX /></button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.mainInfo}>
            <div className={styles.infoRow}>
              <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
              <div className={styles.infoText}>
                <span>{dateFmt} • {appt.startTime} até {appt.endTime}</span>
                <span style={{ fontWeight: 600 }}>{appt.serviceId?.name ?? '—'}</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1565C0' }}>R$ {appt.price?.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
               <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
               <div className={styles.infoText}>
                 <span style={{ fontWeight: 600 }}>{appt.employeeId?.name ?? '—'}</span>
               </div>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
              <div className={styles.statusBadgeRow}>
                <span className={styles.statusBadge} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                  {STATUS_LABELS[appt.status]}
                </span>
                {appt.isBilled && (
                  <span className={styles.billedBadge}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    FATURADO
                  </span>
                )}
              </div>
            </div>

            {appt.notes && (
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                <div className={styles.infoText}>
                  <p style={{ margin: 0, opacity: 0.8 }}>{appt.notes}</p>
                </div>
              </div>
            )}
          </div>

          <div className={styles.panelActions} style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            {!appt.isBilled && (
              <button 
                className={styles.faturarBtn}
                onClick={() => setIsBilling(true)}
              >
                FATURAR
              </button>
            )}
          </div>

          {canEdit && otherStatuses.length > 0 && (
            <div className={styles.statusActions} style={{ marginTop: '1.5rem' }}>
              <span className={styles.detailLabel} style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>Alterar Status</span>
              <div className={styles.statusActionsBtns}>
                {otherStatuses.map(s => {
                  const sc = STATUS_COLORS[s] || STATUS_COLORS.confirmed;
                  return (
                    <button
                      key={s}
                      className={styles.statusActionBtn}
                      style={{ color: sc.text, borderColor: sc.border + '50' }}
                      onClick={() => s === 'cancelled' ? setConfirmCancel(true) : onStatusChange?.(appt._id, s)}
                      disabled={isPending}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {canDelete && !appt.isBilled && (
             <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className={styles.deleteIconBtn} onClick={() => setConfirmDelete(true)}>Excluir Agendamento</button>
             </div>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Excluir agendamento?"
          message={`O agendamento de ${appt.clientId?.name ?? 'cliente'} será excluído permanentemente.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { onDelete?.(appt._id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          isPending={isPending}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancelar agendamento?"
          message={`O atendimento de ${appt.clientId?.name ?? 'cliente'} será marcado como cancelado.`}
          confirmLabel="Cancelar agendamento"
          danger
          onConfirm={() => { onStatusChange?.(appt._id, 'cancelled'); setConfirmCancel(false); }}
          onCancel={() => setConfirmCancel(false)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

export default function CalendarView({
  appointments,
  employees = [],
  month: controlledMonth,
  onMonthChange,
  onUpdate,
  onDayClick,
  canEdit = true,
  canDelete = true,
  onStatusChange,
  onDelete,
  isProcessing = false,
}: Props) {
  const [view, setView] = useState<ViewMode>('month');
  const [internalMonth, setInternalMonth] = useState(new Date());
  const currentMonth = controlledMonth ?? internalMonth;

  const setCurrentMonth = (m: Date) => {
    setInternalMonth(m);
    onMonthChange?.(m);
  };

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentMonth.getFullYear());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const apptForDay = (day: Date) =>
    appointments.filter(a => isSameDay(parseISO(a.date), day));

  const dayAppts = useMemo(() => apptForDay(selectedDay), [appointments, selectedDay]);

  const openDay = (day: Date) => {
    if (onDayClick) { onDayClick(day); return; }
    setSelectedDay(day);
    setView('day');
  };

  const goToday = () => {
    const t = new Date();
    setCurrentMonth(t);
    setSelectedDay(t);
  };

  const handleStatusChange = async (id: string, status: string, options?: any) => {
    if (onStatusChange) {
      await onStatusChange(id, status, options);
      setSelectedAppt(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (onDelete) {
      await onDelete(id);
      setSelectedAppt(null);
    }
  };

  /* ── Month view ── */
  if (view === 'month') {
    return (
      <>
        <div className={styles.wrapper}>
          <div className={styles.header}>
            <div className={styles.monthTitleWrap}>
              <button className={styles.monthTitleBtn} onClick={() => { setPickerYear(currentMonth.getFullYear()); setShowPicker(true); }}>
                <span className={styles.monthTitleText}>
                  {format(currentMonth, 'MMMM', { locale: ptBR })}
                </span>
                <span className={styles.monthYear}>{format(currentMonth, ' yyyy')}</span>
                <svg className={styles.chevronDown} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showPicker && (
                <>
                  <div className={styles.pickerOverlay} onClick={() => setShowPicker(false)} />
                  <div className={styles.picker}>
                    <div className={styles.pickerYearRow}>
                      <button className={styles.pickerYearBtn} onClick={() => setPickerYear(y => y - 1)}><IconChevronLeft /></button>
                      <span className={styles.pickerYearLabel}>{pickerYear}</span>
                      <button className={styles.pickerYearBtn} onClick={() => setPickerYear(y => y + 1)}><IconChevronRight /></button>
                    </div>
                    <div className={styles.pickerMonths}>
                      {MONTHS_PT.map((name, i) => (
                        <button
                          key={i}
                          className={`${styles.pickerMonth} ${pickerYear === currentMonth.getFullYear() && i === currentMonth.getMonth() ? styles.pickerMonthActive : ''}`}
                          onClick={() => { setCurrentMonth(new Date(pickerYear, i, 1)); setShowPicker(false); }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.headerRight}>
              <button className={styles.todayBtn} onClick={goToday}>Hoje</button>
              <div className={styles.navBtns}>
                <button className={styles.navBtn} onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><IconChevronLeft /></button>
                <button className={styles.navBtn} onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><IconChevronRight /></button>
              </div>
            </div>
          </div>

          <div className={styles.weekDays}>
            {WEEK_DAYS.map(d => <div key={d} className={styles.weekDay}>{d}</div>)}
          </div>

          <div className={styles.grid}>
            {days.map(day => {
              const isoDay = format(day, 'yyyy-MM-dd');
              const blockedStaff = employees.filter(emp => {
                if (emp.blockedDays?.includes(isoDay)) return true;
                if (emp.vacations?.some(v => isoDay >= v.start && isoDay <= v.end)) return true;
                return false;
              });

              const da = apptForDay(day);
              const inMonth = isSameMonth(day, currentMonth);
              const todayCell = isToday(day);
              
              const MAX_PILLS = 3;
              const totalItems = blockedStaff.length + da.length;
              
              return (
                <div
                  key={day.toISOString()}
                  className={`${styles.cell} ${!inMonth ? styles.cellOut : ''} ${isSameDay(day, selectedDay) ? styles.cellSel : ''}`}
                  onClick={() => openDay(day)}
                >
                  <span className={`${styles.dayNum} ${todayCell ? styles.dayToday : ''}`}>
                    {format(day, 'd')}
                  </span>
                  <div className={styles.pills}>
                    {blockedStaff.slice(0, MAX_PILLS).map(emp => (
                      <div
                        key={`block-${emp._id}`}
                        className={styles.pill}
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px dashed var(--text-muted)', opacity: 0.8 }}
                        title={`Bloqueado / Férias: ${emp.name}`}
                      >
                        Folga: {emp.name.split(' ')[0]}
                      </div>
                    ))}
                    {da.slice(0, MAX_PILLS - Math.min(blockedStaff.length, MAX_PILLS)).map(a => {
                      const c = a.isPackage && a.status !== 'cancelled' ? PACKAGE_COLOR : (STATUS_COLORS[a.status] ?? STATUS_COLORS['confirmed']);
                      return (
                        <div
                          key={a._id}
                          className={styles.pill}
                          style={{ 
                            background: c.bg, 
                            color: c.text, 
                            borderColor: c.border,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '4px'
                          }}
                          title={`${a.startTime} ${a.clientId?.name ?? (a.status === 'blocked' ? 'Bloqueado' : '')}`}
                          onClick={e => { e.stopPropagation(); setSelectedAppt(a); }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {a.status === 'blocked' ? `Bloqueado ${a.startTime}` : `${a.startTime} ${a.clientId?.name ?? ''}`}
                          </span>
                          {a.isBilled && (
                            <div className={styles.pillCheckGroup}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -4 }}><polyline points="20 6 9 17 4 12"/></svg>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                          {!a.isBilled && a.status === 'confirmed' && (
                             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </div>
                      );
                    })}
                    {totalItems > MAX_PILLS && <div className={styles.pillMore}>+{totalItems - MAX_PILLS}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedAppt && (
          <AppointmentModal
            appt={selectedAppt!}
            onClose={() => setSelectedAppt(null)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            isPending={isProcessing}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </>
    );
  }

  /* ── Day view ── */
  return (
    <>
      <div className={`${styles.wrapper} ${styles.wrapperDay}`}>
        <div className={styles.dayHeader}>
          <button className={styles.backBtn} onClick={() => setView('month')}>
            <IconChevronLeft /><span>Mês</span>
          </button>
          <div className={styles.dayTitle}>
            <span className={styles.dayTitleWeekday}>{format(selectedDay, 'EEEE', { locale: ptBR })}</span>
            <span className={styles.dayTitleDate}>{format(selectedDay, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            {isToday(selectedDay) && <span className={styles.todayChip}>Hoje</span>}
          </div>
          <div className={styles.dayNav}>
            <button className={styles.navBtn} onClick={() => setSelectedDay(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; })}><IconChevronLeft /></button>
            <button className={styles.navBtn} onClick={() => setSelectedDay(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; })}><IconChevronRight /></button>
          </div>
        </div>

        <div className={styles.dayBody}>
          {dayAppts.length === 0 ? (
            <p className={styles.dayEmpty}>Nenhum agendamento neste dia.</p>
          ) : (
            dayAppts.map(a => {
              const c = a.isPackage && a.status !== 'cancelled' ? PACKAGE_COLOR : STATUS_COLORS[a.status];
              return (
                <div
                  key={a._id}
                  className={styles.dayAppt}
                  style={{ borderLeftColor: c.solid }}
                  onClick={() => setSelectedAppt(a)}
                >
                  <div className={styles.dayApptTime}>{a.startTime} – {a.endTime}</div>
                  <div className={styles.dayApptInfo}>
                    <span className={styles.dayApptClient}>{a.clientId?.name ?? '—'}</span>
                    <span className={styles.dayApptMeta}>{a.serviceId?.name ?? '—'} · {a.employeeId?.name ?? '—'}</span>
                  </div>
                  <span className={styles.statusBadge} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                    {STATUS_LABELS[a.status]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedAppt && (
        <AppointmentModal
          appt={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          isPending={isProcessing}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </>
  );
}
