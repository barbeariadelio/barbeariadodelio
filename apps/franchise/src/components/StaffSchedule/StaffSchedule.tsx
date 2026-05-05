import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './StaffSchedule.module.scss';

const SLOT_H = 54;
const START_HOUR = 8;
const END_HOUR = 21;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2;
const TOTAL_H = TOTAL_SLOTS * SLOT_H;
const HEADER_H = 72;

const TIME_SLOTS = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
  const mins = START_HOUR * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

const PALETTES = [
  { bg: 'rgba(21,101,192,0.18)',  border: '#1565C0', text: '#90CAF9', avatar: '#1565C0' },
  { bg: 'rgba(46,125,50,0.18)',   border: '#2E7D32', text: '#A5D6A7', avatar: '#2E7D32' },
  { bg: 'rgba(106,27,154,0.18)',  border: '#6A1B9A', text: '#CE93D8', avatar: '#6A1B9A' },
  { bg: 'rgba(230,81,0,0.18)',    border: '#E65100', text: '#FFCC80', avatar: '#E65100' },
  { bg: 'rgba(0,96,100,0.18)',    border: '#006064', text: '#80DEEA', avatar: '#006064' },
  { bg: 'rgba(136,14,79,0.18)',   border: '#880E4F', text: '#F48FB1', avatar: '#880E4F' },
];

const STATUS_DOT: Record<string, string> = {
  confirmed: '#22C55E',
  completed: '#1E88E5',
  pending:   '#F59E0B',
  cancelled: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  pending:   'Pendente',
  cancelled: 'Cancelado',
};

export interface ScheduleEmployee { _id: string; name: string; }

export interface ScheduleAppointment {
  _id: string;
  clientId:   { _id?: string; name: string } | null;
  employeeId: { _id: string;  name: string } | null;
  serviceId:  { name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
}

function timeToTop(t: string) {
  const [h, m] = t.split(':').map(Number);
  return Math.max(0, ((h * 60 + m) - START_HOUR * 60) / 30 * SLOT_H);
}
function timeToHeight(s: string, e: string) {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return Math.max(SLOT_H * 0.6, ((eh * 60 + em) - (sh * 60 + sm)) / 30 * SLOT_H - 2);
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function ChevL() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevR() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface ModalProps {
  appt: ScheduleAppointment;
  palette: typeof PALETTES[number];
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isDeleting: boolean;
}

function ApptModal({ appt, palette, onClose, onStatusChange, onDelete, isPending, isDeleting }: ModalProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const others = (['confirmed', 'completed', 'cancelled'] as const).filter(s => s !== appt.status);
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ borderTopColor: palette.border }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>{appt.clientId?.name ?? 'Cliente'}</span>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div className={styles.panelBody}>
          {[
            ['Data',     appt.date.split('-').reverse().join('/')],
            ['Horário',  `${appt.startTime} – ${appt.endTime}`],
            ['Serviço',  appt.serviceId?.name ?? '—'],
            ['Barbeiro', appt.employeeId?.name ?? '—'],
          ].map(([label, val]) => (
            <div key={label} className={styles.panelRow}>
              <span className={styles.rowLabel}>{label}</span>
              <span className={styles.rowValue}>{val}</span>
            </div>
          ))}
          <div className={styles.panelRow}>
            <span className={styles.rowLabel}>Status</span>
            <span className={styles.rowStatus} style={{ color: STATUS_DOT[appt.status] }}>
              <span className={styles.dot} style={{ background: STATUS_DOT[appt.status] }} />
              {STATUS_LABELS[appt.status]}
            </span>
          </div>
        </div>
        {others.length > 0 && (
          <div className={styles.panelFooter}>
            <span className={styles.footerLabel}>Alterar status</span>
            <div className={styles.footerBtns}>
              {others.map(s => (
                <button
                  key={s}
                  className={styles.statusBtn}
                  style={{ color: STATUS_DOT[s], borderColor: STATUS_DOT[s] + '50' }}
                  onClick={() => s === 'cancelled' ? setConfirmCancel(true) : onStatusChange(appt._id, s)}
                  disabled={isPending || isDeleting}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.panelDelete}>
          <button
            className={styles.deleteBtn}
            onClick={() => setConfirmDelete(true)}
            disabled={isPending || isDeleting}
          >
            Excluir agendamento
          </button>
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

interface Props {
  appointments: ScheduleAppointment[];
  employees: ScheduleEmployee[];
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  onUpdate?: () => void;
  onNewAppt?: () => void;
  onBack?: () => void;
}

export default function StaffSchedule({ appointments, employees, selectedDate, onDateChange, onUpdate, onNewAppt, onBack }: Props) {
  const [selectedAppt, setSelectedAppt] = useState<ScheduleAppointment | null>(null);

  const palette = selectedAppt
    ? PALETTES[employees.findIndex(e => e._id === selectedAppt.employeeId?._id) % PALETTES.length] ?? PALETTES[0]
    : PALETTES[0];

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/appointments/${id}/status`, { status }),
    onSuccess: () => { setSelectedAppt(null); onUpdate?.(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => { setSelectedAppt(null); onUpdate?.(); },
  });

  const isT = isToday(selectedDate);
  const dateLabel = format(selectedDate, "EEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const nowTop = useMemo(() => {
    const h = now.getHours();
    const m = now.getMinutes();
    return timeToTop(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }, [now]);

  useEffect(() => {
    if (isT && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 160);
    }
  }, [isT, selectedDate]);

  const byEmployee = useMemo(() => {
    const map: Record<string, ScheduleAppointment[]> = {};
    for (const a of appointments) {
      const eid = a.employeeId?._id ?? '__none__';
      (map[eid] ??= []).push(a);
    }
    return map;
  }, [appointments]);

  const cols = employees.length || 1;
  const gridCols = `56px repeat(${cols}, minmax(150px, 1fr))`;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {onBack && (
            <button className={styles.backBtn} onClick={onBack}>
              <ChevL /><span>Calendário</span>
            </button>
          )}
          <button
            className={`${styles.todayBtn} ${isT ? styles.todayActive : ''}`}
            onClick={() => onDateChange(new Date())}
          >
            Hoje
          </button>
          <div className={styles.navGroup}>
            <button className={styles.navBtn} onClick={() => onDateChange(subDays(selectedDate, 1))}><ChevL /></button>
            <button className={styles.navBtn} onClick={() => onDateChange(addDays(selectedDate, 1))}><ChevR /></button>
          </div>
          <span className={styles.dateLabel}>{dateLabel}</span>
        </div>
        <button className={styles.newBtn} onClick={onNewAppt}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo Agendamento
        </button>
      </div>

      <div className={styles.scheduleOuter} ref={scrollRef}>
        <div className={styles.grid} style={{ gridTemplateColumns: gridCols }}>

          <div className={styles.corner} style={{ height: HEADER_H }} />
          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            return (
              <div key={emp._id} className={styles.empHeader} style={{ height: HEADER_H }}>
                <div className={styles.avatar} style={{ background: pal.avatar }}>{initials(emp.name)}</div>
                <span className={styles.empName}>{emp.name.split(' ')[0]}</span>
              </div>
            );
          })}
          {employees.length === 0 && <div className={styles.corner} style={{ height: HEADER_H }} />}

          <div className={styles.timeCol} style={{ height: TOTAL_H }}>
            {TIME_SLOTS.map((t, i) => (
              <div key={t} className={`${styles.timeCell} ${i % 2 === 0 ? styles.timeCellHour : ''}`} style={{ height: SLOT_H }}>
                {i % 2 === 0 && <span className={styles.timeLabel}>{t}</span>}
              </div>
            ))}
            {isT && (
              <div className={styles.nowDot} style={{ top: nowTop }} />
            )}
          </div>

          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            const appts = byEmployee[emp._id] ?? [];
            return (
              <div key={emp._id} className={styles.empCol} style={{ height: TOTAL_H }}>
                {TIME_SLOTS.map((t, si) => (
                  <div
                    key={t}
                    className={`${styles.slot} ${si % 2 === 0 ? styles.slotHour : ''}`}
                    style={{ height: SLOT_H }}
                  />
                ))}
                {isT && <div className={styles.nowLine} style={{ top: nowTop }} />}
                {appts.map(appt => (
                  <div
                    key={appt._id}
                    className={styles.apptCard}
                    style={{
                      top: timeToTop(appt.startTime),
                      height: timeToHeight(appt.startTime, appt.endTime),
                      background: pal.bg,
                      borderLeftColor: pal.border,
                      color: pal.text,
                    }}
                    onClick={() => setSelectedAppt(appt)}
                  >
                    <div className={styles.apptTime}>{appt.startTime} – {appt.endTime}</div>
                    <div className={styles.apptClient}>{appt.clientId?.name ?? '—'}</div>
                    {appt.serviceId?.name && (
                      <div className={styles.apptService}>{appt.serviceId.name}</div>
                    )}
                    <span className={styles.statusDot} style={{ background: STATUS_DOT[appt.status] }} />
                  </div>
                ))}
              </div>
            );
          })}

          {employees.length === 0 && (
            <div className={styles.emptyCol} style={{ height: TOTAL_H }}>
              <span>Nenhum funcionário cadastrado.</span>
            </div>
          )}
        </div>
      </div>

      {selectedAppt && (
        <ApptModal
          appt={selectedAppt}
          palette={palette}
          onClose={() => setSelectedAppt(null)}
          onStatusChange={(id, status) => statusMut.mutate({ id, status })}
          onDelete={(id) => deleteMut.mutate(id)}
          isPending={statusMut.isPending}
          isDeleting={deleteMut.isPending}
        />
      )}
    </div>
  );
}
