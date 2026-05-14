import { useState, useMemo } from 'react';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import { useMutation } from '@tanstack/react-query';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  format, addMonths, subMonths, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../../api/client';
import styles from './CalendarView.module.scss';

export interface CalendarAppointment {
  _id: string;
  clientId: { name: string } | null;
  employeeId: { name: string } | null;
  serviceId: { name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
  isPackage?: boolean;
}

const PACKAGE_COLOR = { bg: 'rgba(255,109,0,0.12)', text: '#FF6D00', border: 'rgba(255,109,0,0.3)', solid: '#FF6D00' };

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; solid: string }> = {
  confirmed: { bg: 'rgba(34,197,94,0.12)',   text: '#22C55E', border: 'rgba(34,197,94,0.3)',   solid: '#22C55E' },
  completed: { bg: 'rgba(21,101,192,0.12)',   text: '#1E88E5', border: 'rgba(21,101,192,0.3)',  solid: '#1565C0' },
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

export interface CalendarEmployee {
  _id: string;
  name: string;
  blockedDays?: string[];
  vacations?: { start: string; end: string }[];
}

interface Props {
  appointments: CalendarAppointment[];
  employees?: CalendarEmployee[];
  month?: Date;
  onMonthChange?: (m: Date) => void;
  onUpdate?: () => void;
  onDayClick?: (day: Date) => void;
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
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isDeleting: boolean;
}

function AppointmentModal({ appt, onClose, onStatusChange, onDelete, isPending, isDeleting }: ModalProps) {
  const c = appt.isPackage && appt.status !== 'cancelled' ? PACKAGE_COLOR : STATUS_COLORS[appt.status];
  const otherStatuses = (['confirmed', 'completed', 'cancelled'] as const).filter(s => s !== appt.status);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ borderLeftColor: c.solid }}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            {appt.clientId?.name ?? 'Cliente'}
          </div>
          <button className={styles.closeBtn} onClick={onClose}><IconX /></button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Data</span>
              <span className={styles.detailValue}>
                {format(parseISO(appt.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Horário</span>
              <span className={styles.detailValue}>{appt.startTime} – {appt.endTime}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Serviço</span>
              <span className={styles.detailValue}>{appt.serviceId?.name ?? '—'}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Barbeiro</span>
              <span className={styles.detailValue}>{appt.employeeId?.name ?? '—'}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.statusBadge} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                {STATUS_LABELS[appt.status]}
              </span>
            </div>
          </div>

          {otherStatuses.length > 0 && (
            <div className={styles.statusActions}>
              <span className={styles.statusActionsLabel}>Alterar para</span>
              <div className={styles.statusActionsBtns}>
                {otherStatuses.map(s => {
                  const sc = STATUS_COLORS[s];
                  return (
                    <button
                      key={s}
                      className={styles.statusActionBtn}
                      style={{ color: sc.text, borderColor: sc.border, background: sc.bg }}
                      onClick={() => s === 'cancelled' ? setConfirmCancel(true) : onStatusChange(appt._id, s)}
                      disabled={isPending || isDeleting}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className={styles.deleteSection}>
            <button
              className={styles.deleteBtn}
              onClick={() => setConfirmDelete(true)}
              disabled={isPending || isDeleting}
            >
              Excluir agendamento
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Excluir agendamento?"
          message={`O agendamento de ${appt.clientId?.name ?? 'cliente'} será excluído permanentemente.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { onDelete(appt._id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          isPending={isDeleting}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancelar agendamento?"
          message={`O atendimento de ${appt.clientId?.name ?? 'cliente'} será marcado como cancelado.`}
          confirmLabel="Cancelar agendamento"
          danger
          onConfirm={() => { onStatusChange(appt._id, 'cancelled'); setConfirmCancel(false); }}
          onCancel={() => setConfirmCancel(false)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

export default function CalendarView({ appointments, employees = [], month: controlledMonth, onMonthChange, onUpdate, onDayClick }: Props) {
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

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/appointments/${id}/status`, { status }),
    onSuccess: () => {
      setSelectedAppt(null);
      onUpdate?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      setSelectedAppt(null);
      onUpdate?.();
    },
  });

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
              
              const MAX_PILLS = 5;
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
                          style={{ background: c.bg, color: c.text, borderColor: c.border }}
                          title={`${a.startTime} ${a.clientId?.name ?? (a.status === 'blocked' ? 'Bloqueado' : '')}`}
                          onClick={e => { e.stopPropagation(); setSelectedAppt(a); }}
                        >
                          {a.status === 'blocked' ? `Bloqueado ${a.startTime}` : `${a.startTime} ${a.clientId?.name ?? ''}`}
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
            appt={selectedAppt}
            onClose={() => setSelectedAppt(null)}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            onDelete={(id) => deleteMutation.mutate(id)}
            isPending={statusMutation.isPending}
            isDeleting={deleteMutation.isPending}
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
          onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
          onDelete={(id) => deleteMutation.mutate(id)}
          isPending={statusMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </>
  );
}
