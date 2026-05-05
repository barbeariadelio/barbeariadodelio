import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import CalendarView, { type CalendarAppointment } from '../../components/CalendarView/CalendarView';
import StaffSchedule, { type ScheduleAppointment, type ScheduleEmployee } from '../../components/StaffSchedule/StaffSchedule';
import AppointmentForm from '../../components/AppointmentForm/AppointmentForm';
import styles from './Dashboard.module.scss';

function dateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting(name?: string | null) {
  const h = new Date().getHours();
  const first = name?.split(' ')[0] ?? '';
  const suffix = first ? `, ${first}` : '';
  if (h < 12) return `Bom dia${suffix}`;
  if (h < 18) return `Boa tarde${suffix}`;
  return `Boa noite${suffix}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const unitId = (user as unknown as { unitId?: string })?.unitId;
  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const [view, setView] = useState<'calendar' | 'schedule'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [showForm, setShowForm] = useState(false);

  /* ── Month appointments (calendar view) ── */
  const monthStart = dateISO(startOfMonth(calendarMonth));
  const monthEnd   = dateISO(endOfMonth(calendarMonth));

  const { data: monthAppointments = [] } = useQuery<CalendarAppointment[]>({
    queryKey: ['appointments-month', monthStart, monthEnd],
    queryFn: () =>
      api.get(`/appointments?start=${monthStart}&end=${monthEnd}`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.appointments ?? []),
  });

  /* ── Day appointments + employees (schedule view) ── */
  const dayISO = dateISO(selectedDay);

  const { data: dayAppointments = [] } = useQuery<ScheduleAppointment[]>({
    queryKey: ['appointments-day', dayISO],
    queryFn: () =>
      api.get(`/appointments?date=${dayISO}`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.appointments ?? []),
    enabled: view === 'schedule',
  });

  const { data: employees = [] } = useQuery<ScheduleEmployee[]>({
    queryKey: ['employees', unitId],
    queryFn: () =>
      api.get(`/employees${unitId ? `?unitId=${unitId}` : ''}`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.employees ?? []),
    enabled: view === 'schedule',
  });

  function handleDayClick(day: Date) {
    setSelectedDay(day);
    setView('schedule');
  }

  function handleScheduleUpdate() {
    qc.invalidateQueries({ queryKey: ['appointments-day'] });
  }

  function handleMonthUpdate() {
    qc.invalidateQueries({ queryKey: ['appointments-month'] });
  }

  const currentMonthLabel = format(calendarMonth, 'MMMM', { locale: ptBR });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.dateLabel}>{dateLabel}</p>
        <h1 className={styles.greeting}>{getGreeting(user?.name)}</h1>
        <p className={styles.subtitle}>
          {view === 'calendar'
            ? `${monthAppointments.length} agendamento${monthAppointments.length !== 1 ? 's' : ''} em ${currentMonthLabel}.`
            : dayAppointments.length === 0
              ? 'Nenhum agendamento neste dia.'
              : `${dayAppointments.length} agendamento${dayAppointments.length > 1 ? 's' : ''} no dia selecionado.`}
        </p>
      </header>

      {view === 'calendar' && (
        <div className={styles.calendarSection}>
          <div className={styles.calendarMeta}>
            <div className={styles.calendarMetaLeft}>
              <span className={styles.calendarMonth}>{currentMonthLabel}</span>
              <span className={styles.calendarCount}>
                {monthAppointments.length} agendamento{monthAppointments.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button className={styles.newApptBtn} onClick={() => setShowForm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo Agendamento
            </button>
          </div>
          <CalendarView
            appointments={monthAppointments}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            onUpdate={handleMonthUpdate}
            onDayClick={handleDayClick}
          />
        </div>
      )}

      {view === 'schedule' && (
        <StaffSchedule
          appointments={dayAppointments}
          employees={employees}
          selectedDate={selectedDay}
          onDateChange={day => { setSelectedDay(day); }}
          onUpdate={handleScheduleUpdate}
          onNewAppt={() => setShowForm(true)}
          onBack={() => setView('calendar')}
        />
      )}

      {showForm && (
        <AppointmentForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            if (view === 'calendar') handleMonthUpdate();
            else handleScheduleUpdate();
          }}
        />
      )}
    </div>
  );
}
