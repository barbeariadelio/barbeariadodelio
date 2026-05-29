import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, apiBaseUrl, getSelectedUnitId } from '../../api/client';
import { 
  StaffSchedule, 
  type ScheduleAppointment, 
  type ScheduleEmployee 
} from '@barber/ui';
import AppointmentForm from '../../components/AppointmentForm/AppointmentForm';
import styles from './Dashboard.module.scss';

function dateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface UnitConfig {
  name?: string;
  workingDays?: number[];
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
}

type EditableAppointment = ScheduleAppointment;
type StatusOptions = {
  price?: number;
  paymentMethod?: 'money' | 'card' | 'pix' | 'other';
};
type AppointmentPayload = Record<string, unknown>;

function getRefId(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '_id' in value) {
    const id = (value as { _id?: unknown })._id;
    if (typeof id === 'string') return id;
    if (typeof id === 'number') return String(id);
  }
  return undefined;
}

function getErrorMessage(err: unknown) {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return 'Erro ao atualizar agendamento. Tente novamente.';
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isStaff = user?.role === 'employee';
  const isCashier = user?.role === 'cashier';
  const unitId = isCashier
    ? user?.unitId
    : getSelectedUnitId() || import.meta.env.VITE_UNIT_ID || user?.unitId;
  const userId = user?._id;

  const [selectedDay, setSelectedDay] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editAppt, setEditAppt] = useState<EditableAppointment | null>(null);
  const [slotEmployeeId, setSlotEmployeeId] = useState<string | undefined>();
  const [slotTime, setSlotTime] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ── Day appointments + employees (schedule view) ── */
  const dayISO = dateISO(selectedDay);

  const { data: dayAppointmentsRaw = [] } = useQuery<ScheduleAppointment[]>({
    queryKey: ['appointments-day', dayISO, unitId],
    queryFn: () =>
      api.get(`/appointments?date=${dayISO}&unitId=${unitId}&limit=1000`)
         .then(r => Array.isArray(r.data) ? r.data : r.data?.appointments ?? []),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const dayAppointments = useMemo(() => {
    if (!isStaff || !userId) return dayAppointmentsRaw;
    const currentUserIdStr = userId.toString();
    return dayAppointmentsRaw.filter(a => {
      const empId = getRefId(a.employeeId);
      return empId === currentUserIdStr;
    });
  }, [dayAppointmentsRaw, isStaff, userId]);

  const { data: employeesRaw = [] } = useQuery<ScheduleEmployee[]>({
    queryKey: ['employees', unitId, 'schedule'],
    queryFn: () =>
      api.get(`/employees${unitId ? `?unitId=${unitId}&` : '?'}light=schedule`)
         .then(r => {
           const list = Array.isArray(r.data) ? r.data : r.data?.employees ?? [];
           return list.map((emp: ScheduleEmployee & { hasAvatar?: boolean }) => ({
             ...emp,
             avatar: emp.avatar || (emp.hasAvatar ? `${apiBaseUrl}/employees/public/${emp._id}/avatar` : undefined),
           }));
         }),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const employees = useMemo(() => {
    let list = employeesRaw;
    if (isStaff && userId) {
      list = list.filter(e => e._id === userId);
    }
    return list;
  }, [employeesRaw, isStaff, userId]);

  const { data: unitConfig } = useQuery<UnitConfig>({
    queryKey: ['unit-config', unitId],
    queryFn: () => api.get(`/units/${unitId}`).then(r => r.data as UnitConfig),
    enabled: !!unitId,
    staleTime: 5 * 60 * 1000,
  });

  function handleScheduleUpdate() {
    qc.invalidateQueries({ queryKey: ['appointments-day'] });
    qc.invalidateQueries({ queryKey: ['unit-config', unitId] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  }

  function handleAppointmentSaved(updatedAppointment?: unknown) {
    if (updatedAppointment && typeof updatedAppointment === 'object' && '_id' in updatedAppointment) {
      const updated = updatedAppointment as ScheduleAppointment;
      if (updated.date === dayISO) {
        qc.setQueryData<ScheduleAppointment[]>(['appointments-day', dayISO, unitId], current =>
          current?.map(appointment => appointment._id === updated._id ? updated : appointment) ?? current,
        );
      }
    }
    setShowForm(false);
    setEditAppt(null);
    setSlotEmployeeId(undefined);
    setSlotTime(undefined);
    handleScheduleUpdate();
  }

  /* ── Mutations for Shared Components ── */
  const statusMut = useMutation({
    mutationFn: ({ id, status, options }: { id: string; status: string; options?: StatusOptions }) =>
      api.patch(`/appointments/${id}/status`, { status, ...options }),
    onSuccess: async () => {
      await Promise.all([
        qc.refetchQueries({ queryKey: ['appointments-day'] })
      ]);
      handleScheduleUpdate();
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err));
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: string }) =>
      api.delete(`/appointments/${id}`, { params: mode ? { mode } : undefined }),
    onSuccess: () => { handleScheduleUpdate(); },
  });

  const blockMut = useMutation({
    mutationFn: (payload: AppointmentPayload) => api.post('/appointments', payload),
    onSuccess: () => { handleScheduleUpdate(); },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err));
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  const updateApptMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AppointmentPayload }) => api.patch(`/appointments/${id}`, data),
    onSuccess: () => { handleScheduleUpdate(); },
  });

  type DeleteMode = 'single' | 'this-and-future';
  const handleDelete = async (id: string, mode?: DeleteMode) => {
    await deleteMut.mutateAsync({ id, mode });
  };

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
        unitId={unitId}
        workingDays={unitConfig?.workingDays}
        workingHours={unitConfig?.workingHours}
        onStatusChange={async (id, s, opts) => { await statusMut.mutateAsync({ id, status: s, options: opts }); }}
        onDelete={handleDelete}
        onBlock={async (payload) => { await blockMut.mutateAsync(payload); }}
        onUpdateAppt={async (id, data) => { await updateApptMut.mutateAsync({ id, data }); }}
        isProcessing={statusMut.isPending || blockMut.isPending || updateApptMut.isPending}
        isDeleting={deleteMut.isPending}
        businessName="Barbearia do Délio"
        onProfileClick={!isStaff ? (clientId) => navigate(`/clients?id=${clientId}`) : undefined}
        onEmployeeClick={!isCashier ? (employeeId) => navigate(`/employees?id=${employeeId}`) : undefined}
        canManageAppointments={!isStaff}
        canBill={!isStaff}
      />

      {showForm && !isStaff && (
        <AppointmentForm
          appointment={editAppt}
          initialDate={!editAppt ? dateISO(selectedDay) : undefined}
          initialEmployeeId={!editAppt ? slotEmployeeId : undefined}
          initialTime={!editAppt ? slotTime : undefined}
          onClose={() => {
            setShowForm(false);
            setEditAppt(null);
            setSlotEmployeeId(undefined);
            setSlotTime(undefined);
          }}
          onSuccess={handleAppointmentSaved}
        />
      )}
    </div>
  );
}
