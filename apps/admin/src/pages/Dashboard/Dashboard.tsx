import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { api, getSelectedUnitId } from '../../api/client';
import { 
  CalendarView, 
  StaffSchedule, 
  type CalendarAppointment, 
  type ScheduleAppointment, 
  type ScheduleEmployee 
} from '@barber/ui';
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

interface UnitConfig {
  workingDays?: number[];
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
  slotInterval?: number;
  calendarGrid?: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const unitId = getSelectedUnitId() || (user as any)?.unitId;
  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const isStaff = user?.role === 'employee';
  const userId = (user as any)?.id || (user as any)?._id;

  const [view, setView] = useState<'calendar' | 'schedule'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editAppt, setEditAppt] = useState<any>(null);
  const [slotEmployeeId, setSlotEmployeeId] = useState<string | undefined>();
  const [slotTime, setSlotTime] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ── Month appointments (calendar view) ── */
  const monthStart = dateISO(startOfMonth(calendarMonth));
  const monthEnd   = dateISO(endOfMonth(calendarMonth));

  const { data: monthAppointmentsRaw = [] } = useQuery<CalendarAppointment[]>({
    queryKey: ['appointments-month', monthStart, monthEnd, unitId],
    queryFn: () =>
      api.get(`/appointments?start=${monthStart}&end=${monthEnd}&limit=1000`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.appointments ?? []),
    enabled: !!user,
    refetchInterval: 15000, // Auto refresh every 15s
  });

  const monthAppointments = useMemo(() => {
    if (!isStaff || !userId) return monthAppointmentsRaw;
    return monthAppointmentsRaw.filter(a => {
      const empId = (a.employeeId as any)?._id || a.employeeId;
      return empId === userId;
    });
  }, [monthAppointmentsRaw, isStaff, userId]);

  /* ── Day appointments + employees (schedule view) ── */
  const dayISO = dateISO(selectedDay);

  const { data: dayAppointmentsRaw = [] } = useQuery<ScheduleAppointment[]>({
    queryKey: ['appointments-day', dayISO, unitId],
    queryFn: () =>
      api.get(`/appointments?date=${dayISO}&limit=1000`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.appointments ?? []),
    enabled: view === 'schedule' && !!user,
    refetchInterval: 15000, // Auto refresh every 15s
  });

  const dayAppointments = useMemo(() => {
    if (!isStaff || !userId) return dayAppointmentsRaw;
    return dayAppointmentsRaw.filter(a => {
      const empId = a.employeeId?._id || a.employeeId;
      return empId === userId;
    });
  }, [dayAppointmentsRaw, isStaff, userId]);

  const { data: employeesRaw = [] } = useQuery<ScheduleEmployee[]>({
    queryKey: ['employees', unitId],
    queryFn: () =>
      api.get(`/employees${unitId ? `?unitId=${unitId}` : ''}`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.employees ?? []),
    enabled: !!user,
  });

  const employees = useMemo(() => {
    if (!isStaff || !userId) return employeesRaw;
    return employeesRaw.filter(e => {
      const empId = e._id;
      return empId === userId;
    });
  }, [employeesRaw, isStaff, userId]);

  const { data: unitConfig } = useQuery<UnitConfig>({
    queryKey: ['unit-config', unitId],
    queryFn: () => api.get(`/units/${unitId}`).then(r => r.data as UnitConfig),
    enabled: !!unitId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  function handleDayClick(day: Date) {
    setSelectedDay(day);
    setView('schedule');
  }

  function handleScheduleUpdate() {
    qc.invalidateQueries({ queryKey: ['appointments-day'] });
    qc.invalidateQueries({ queryKey: ['appointments-month'] });
    qc.invalidateQueries({ queryKey: ['unit-config', unitId] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  }

  function handleMonthUpdate() {
    qc.invalidateQueries({ queryKey: ['appointments-month'] });
    qc.invalidateQueries({ queryKey: ['appointments-day'] });
  }

  /* ── Mutations for Shared Components ── */
  const statusMut = useMutation({
    mutationFn: ({ id, status, options }: { id: string; status: string; options?: any }) =>
      api.patch(`/appointments/${id}/status`, { status, ...options }),
    onSuccess: async () => { 
      await Promise.all([
        qc.refetchQueries({ queryKey: ['appointments-day'] }),
        qc.refetchQueries({ queryKey: ['appointments-month'] })
      ]);
      handleScheduleUpdate(); 
      handleMonthUpdate(); 
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao atualizar agendamento. Tente novamente.';
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: string }) =>
      api.delete(`/appointments/${id}`, { params: mode ? { mode } : undefined }),
    onSuccess: () => { handleScheduleUpdate(); handleMonthUpdate(); },
  });

  const blockMut = useMutation({
    mutationFn: (payload: any) => api.post('/appointments', payload),
    onSuccess: () => { handleScheduleUpdate(); handleMonthUpdate(); },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao bloquear horário. Tente novamente.';
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  const updateApptMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/appointments/${id}`, data),
    onSuccess: () => { handleScheduleUpdate(); handleMonthUpdate(); },
  });

  const currentMonthLabel = format(calendarMonth, 'MMMM', { locale: ptBR });

  return (
    <div className={styles.page}>
      {errorMsg && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px',
          padding: '0.75rem 1rem', color: '#991B1B', fontSize: '0.875rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '360px'
        }}>
          ⚠️ {errorMsg}
        </div>
      )}
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
            employees={employees}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            onUpdate={handleMonthUpdate}
            onDayClick={handleDayClick}
            onStatusChange={async (id, s, opts) => { await statusMut.mutateAsync({ id, status: s, options: opts }); }}
            onDelete={async (id: string, mode?: 'single' | 'this-and-future') => { await deleteMut.mutateAsync({ id, mode }); }}
            isDeleting={deleteMut.isPending}
            isProcessing={statusMut.isPending || deleteMut.isPending}
            onEdit={(appt: any) => { setEditAppt(appt); setShowForm(true); }}
            onViewProfile={(clientId) => navigate(`/clients?id=${clientId}`)}
            canBill={!isStaff}
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
          onNewAppt={() => {
            setEditAppt(null);
            setShowForm(true);
          }}
          onEdit={(appt) => {
            setEditAppt(appt);
            setShowForm(true);
          }}
          onNewApptAtSlot={(empId, time) => {
            setEditAppt(null);
            setSlotEmployeeId(empId);
            setSlotTime(time);
            setShowForm(true);
          }}
          onBack={() => setView('calendar')}
          unitId={unitId}
          workingDays={unitConfig?.workingDays}
          workingHours={unitConfig?.workingHours}
          slotDuration={unitConfig?.calendarGrid || 15}
          onStatusChange={async (id, s, opts) => { await statusMut.mutateAsync({ id, status: s, options: opts }); }}
          onDelete={async (id: string, mode?: 'single' | 'this-and-future') => { await deleteMut.mutateAsync({ id, mode }); }}
          onBlock={async (payload) => { await blockMut.mutateAsync(payload); }}
          onUpdateAppt={async (id, data) => { await updateApptMut.mutateAsync({ id, data }); }}
          isProcessing={statusMut.isPending || blockMut.isPending || updateApptMut.isPending}
          isDeleting={deleteMut.isPending}
          businessName="Barber Admin"
          onProfileClick={(clientId) => navigate(`/clients?id=${clientId}`)}
          canBill={!isStaff}
        />
      )}

      {showForm && (
        <AppointmentForm
          appointment={editAppt}
          initialDate={!editAppt && view === 'schedule' ? dateISO(selectedDay) : undefined}
          initialEmployeeId={!editAppt ? slotEmployeeId : undefined}
          initialTime={!editAppt ? slotTime : undefined}
          onClose={() => {
            setShowForm(false);
            setEditAppt(null);
            setSlotEmployeeId(undefined);
            setSlotTime(undefined);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditAppt(null);
            setSlotEmployeeId(undefined);
            setSlotTime(undefined);
            if (view === 'calendar') handleMonthUpdate();
            else handleScheduleUpdate();
          }}
        />
      )}
    </div>
  );
}
