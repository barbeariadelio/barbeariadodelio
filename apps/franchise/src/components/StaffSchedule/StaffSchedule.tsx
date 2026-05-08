import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './StaffSchedule.module.scss';

const SLOT_H = 54;
const HEADER_H = 72;

function buildGrid(startHour: number, endHour: number) {
  const totalSlots = (endHour - startHour) * 2;
  const totalH = totalSlots * SLOT_H;
  const timeSlots = Array.from({ length: totalSlots }, (_, i) => {
    const mins = startHour * 60 + i * 30;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  });
  return { totalSlots, totalH, timeSlots };
}

function makeTimeToTop(startHour: number) {
  return (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return Math.max(0, ((h * 60 + m) - startHour * 60) / 30 * SLOT_H);
  };
}

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

export interface ScheduleEmployee { 
  _id: string; 
  name: string; 
  avatar?: string;
  workSchedule?: {
    start: string;
    end: string;
    lunchStart?: string;
    lunchEnd?: string;
  };
  vacations?: { start: string; end: string }[];
  blockedDays?: string[];
}

export interface ScheduleAppointment {
  _id: string;
  clientId:   { _id?: string; name: string } | null;
  employeeId: { _id: string;  name: string } | null;
  serviceId:  { name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
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
      <div className={styles.panel} style={{ borderTopColor: appt.status === 'blocked' ? '#6B7280' : palette.border }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>{appt.clientId?.name ?? (appt.status === 'blocked' ? 'Bloqueio de Horário' : 'Cliente')}</span>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div className={styles.panelBody}>
          {[
            ['Data',     appt.date.split('-').reverse().join('/')],
            ['Horário',  `${appt.startTime} – ${appt.endTime}`],
            ...(appt.status !== 'blocked' ? [
              ['Serviço',  appt.serviceId?.name ?? '—'],
              ['Barbeiro', appt.employeeId?.name ?? '—']
            ] : [
              ['Barbeiro', appt.employeeId?.name ?? '—']
            ])
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
        {others.length > 0 && appt.status !== 'blocked' && (
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
            {appt.status === 'blocked' ? 'Remover Bloqueio' : 'Excluir agendamento'}
          </button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title={appt.status === 'blocked' ? 'Remover Bloqueio?' : 'Excluir agendamento?'}
          message={appt.status === 'blocked' ? 'O horário voltará a ficar disponível para agendamento.' : `O agendamento de ${appt.clientId?.name ?? 'cliente'} será excluído permanentemente.`}
          confirmLabel={appt.status === 'blocked' ? 'Remover Bloqueio' : 'Excluir'}
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

function BlockModal({ prompt, duration, onDurationChange, onConfirm, onCancel, isPending }: any) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.panel} style={{ maxWidth: 400 }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>Bloquear Horário</span>
          <button className={styles.closeBtn} onClick={onCancel}><XIcon /></button>
        </div>
        <div className={styles.panelBody} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>
            Deseja bloquear a agenda de <strong>{prompt.employeeName}</strong> a partir das <strong>{prompt.time}</strong>?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4B5563' }}>Duração do bloqueio:</label>
            <select
              value={duration}
              onChange={e => onDurationChange(Number(e.target.value))}
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#F9FAFB', fontSize: '0.95rem' }}
            >
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora e 30 minutos</option>
              <option value={120}>2 horas</option>
              <option value={180}>3 horas</option>
              <option value={240}>4 horas</option>
              <option value={480}>O resto do dia (8h)</option>
            </select>
          </div>
        </div>
        <div className={styles.panelFooter} style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #E5E7EB' }}>
          <button onClick={onCancel} disabled={isPending} style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#6B7280' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={isPending} style={{ padding: '0.5rem 1rem', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
            {isPending ? 'Bloqueando...' : 'Confirmar Bloqueio'}
          </button>
        </div>
      </div>
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
  unitId?: string;
  workingDays?: number[];
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
}

export default function StaffSchedule({ appointments, employees, selectedDate, onDateChange, onUpdate, onNewAppt, onBack, unitId, workingDays, workingHours }: Props) {
  // ── Dynamic grid based on unit working hours ──
  const startHour = workingHours?.start ? parseInt(workingHours.start.split(':')[0], 10) : 8;
  const endHour   = workingHours?.end   ? parseInt(workingHours.end.split(':')[0], 10) + (parseInt(workingHours.end.split(':')[1], 10) > 0 ? 1 : 0) : 21;
  const { totalH: TOTAL_H, timeSlots: TIME_SLOTS } = buildGrid(startHour, Math.max(endHour, startHour + 1));
  const timeToTop = makeTimeToTop(startHour);

  const [selectedAppt, setSelectedAppt] = useState<ScheduleAppointment | null>(null);
  const [blockPrompt, setBlockPrompt] = useState<{ employeeId: string; employeeName: string; time: string } | null>(null);
  const [blockDuration, setBlockDuration] = useState(30);

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

  const blockMut = useMutation({
    mutationFn: (payload: any) => api.post('/appointments', payload),
    onSuccess: () => { setBlockPrompt(null); setBlockDuration(30); onUpdate?.(); },
  });

  function confirmBlock() {
    if (!blockPrompt) return;
    const [h, m] = blockPrompt.time.split(':').map(Number);
    const totalMins = h * 60 + m + blockDuration;
    const endH = Math.floor(totalMins / 60).toString().padStart(2, '0');
    const endM = (totalMins % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;
    
    blockMut.mutate({
      employeeId: blockPrompt.employeeId,
      unitId,
      date: format(selectedDate, 'yyyy-MM-dd'),
      startTime: blockPrompt.time,
      endTime,
      status: 'blocked',
      price: 0
    });
  }

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
                <div className={styles.avatar} style={{ background: pal.avatar }}>{emp.avatar ? <img src={emp.avatar} alt={emp.name} className={styles.avatarImg} /> : initials(emp.name)}</div>
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
            const isoDate = format(selectedDate, 'yyyy-MM-dd');
            const isBlockedDay = emp.blockedDays?.includes(isoDate) || emp.vacations?.some(v => isoDate >= v.start && isoDate <= v.end);

            return (
              <div key={emp._id} className={styles.empCol} style={{ height: TOTAL_H }}>
                {TIME_SLOTS.map((t, si) => {
                  const endMins = startHour * 60 + (si + 1) * 30;
                  const endT = `${Math.floor(endMins / 60).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}`;
                  return (
                    <div
                      key={t}
                      className={`${styles.slot} ${si % 2 === 0 ? styles.slotHour : ''}`}
                      style={{ height: SLOT_H, cursor: isBlockedDay ? 'default' : 'pointer' }}
                      data-time={`${t} – ${endT}`}
                      onClick={() => {
                        if (!isBlockedDay) {
                          setBlockPrompt({ employeeId: emp._id, employeeName: emp.name.split(' ')[0], time: t });
                        }
                      }}
                    />
                  );
                })}

                {isBlockedDay ? (
                  <div
                    className={styles.lunchBreak}
                    style={{ top: 0, height: TOTAL_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', pointerEvents: 'none' }}
                  >
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, opacity: 0.8 }}>FOLGA / INDISPONÍVEL</span>
                  </div>
                ) : (
                  <>
                    {/* ── Work Schedule Overlays ── */}
                    {emp.workSchedule && (
                      <>
                        {/* Before start */}
                        {timeToTop(emp.workSchedule.start) > 0 && (
                          <div
                            className={styles.offHours}
                            style={{ top: 0, height: timeToTop(emp.workSchedule.start), pointerEvents: 'none' }}
                          />
                        )}
                        {/* After end */}
                        {timeToTop(emp.workSchedule.end) < TOTAL_H && (
                          <div
                            className={styles.offHours}
                            style={{ top: timeToTop(emp.workSchedule.end), height: TOTAL_H - timeToTop(emp.workSchedule.end), pointerEvents: 'none' }}
                          />
                        )}
                        {/* Lunch break */}
                        {emp.workSchedule.lunchStart && emp.workSchedule.lunchEnd && (
                          <div
                            className={styles.lunchBreak}
                            style={{
                              top: timeToTop(emp.workSchedule.lunchStart),
                              height: timeToHeight(emp.workSchedule.lunchStart, emp.workSchedule.lunchEnd),
                              pointerEvents: 'none'
                            }}
                          >
                            <span>ALMOÇO</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {!isBlockedDay && isT && <div className={styles.nowLine} style={{ top: nowTop }} />}
                {!isBlockedDay && appts.map(appt => (
                  <div
                    key={appt._id}
                    className={styles.apptCard}
                    style={{
                      top: timeToTop(appt.startTime),
                      height: timeToHeight(appt.startTime, appt.endTime),
                      background: appt.status === 'blocked' ? '#374151' : pal.bg,
                      borderLeftColor: appt.status === 'blocked' ? '#6B7280' : pal.border,
                      color: appt.status === 'blocked' ? '#E5E7EB' : pal.text,
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                  >
                    <div className={styles.apptTime}>{appt.startTime} – {appt.endTime}</div>
                    <div className={styles.apptClient}>{appt.status === 'blocked' ? 'BLOQUEADO' : (appt.clientId?.name ?? '—')}</div>
                    {appt.serviceId?.name && appt.status !== 'blocked' && (
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

      {blockPrompt && (
        <BlockModal
          prompt={blockPrompt}
          duration={blockDuration}
          onDurationChange={setBlockDuration}
          onConfirm={confirmBlock}
          onCancel={() => setBlockPrompt(null)}
          isPending={blockMut.isPending}
        />
      )}
    </div>
  );
}
