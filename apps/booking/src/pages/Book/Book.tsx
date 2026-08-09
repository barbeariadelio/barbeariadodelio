import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { api, publicRequestConfig, resolveApiBaseUrl, setupInterceptors } from '../../api/client';
import styles from './Book.module.scss';

interface Unit { _id: string; name: string; apiUrl?: string; workingDays?: number[]; }
interface Service { _id: string; name: string; description?: string; price: number; durationMinutes: number; isActive?: boolean; image?: string; showPrice?: boolean; showPricePrefix?: boolean; }
type ServiceIdRef = string | { _id: string };
interface Employee { _id: string; name: string; hasAvatar?: boolean; serviceIds?: ServiceIdRef[]; daySchedules?: { day: number; slots: { start: string; end: string }[] }[]; workSchedule?: { workDays?: number[] }; }
interface AnySlot { time: string; employeeId: string; employeeName: string; }

// Sentinel employee object used when the user picks "Qualquer Barbeiro"
const ANY_EMPLOYEE: Employee = { _id: '__any__', name: 'Qualquer Barbeiro' };

type Step = 'barber' | 'service' | 'datetime' | 'confirm';
const STEPS: Step[] = ['barber', 'service', 'datetime', 'confirm'];
const STEP_LABELS = ['Barbeiro', 'Serviço', 'Data & Hora', 'Confirmação'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const WEEK_SHORT = ['D','S','T','Q','Q','S','S'];
const DAY_SHORT_BOOKING = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function fmt(v: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : '';
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function initials(name: string) { return name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase(); }
function normalizeId(id: ServiceIdRef | undefined): string {
  if (!id) return '';
  return typeof id === 'string' ? id : id._id;
}
function fmtDateLong(iso: string) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS_SHORT[m-1]} de ${y}`;
}

/* ── Calendar ── */
function Calendar({ value, onChange, workingDays }: { value: string; onChange: (d: string) => void; workingDays?: number[] }) {
  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.split('-')[0]) : todayY);
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.split('-')[1]) - 1 : todayM);

  const cells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [viewYear, viewMonth]);

  const selY = value ? parseInt(value.split('-')[0]) : -1;
  const selM = value ? parseInt(value.split('-')[1]) - 1 : -1;
  const selD = value ? parseInt(value.split('-')[2]) : -1;

  const isPast = (d: number) => new Date(viewYear, viewMonth, d) < new Date(todayY, todayM, todayD);
  const isSelected = (d: number) => viewYear === selY && viewMonth === selM && d === selD;
  const isToday = (d: number) => viewYear === todayY && viewMonth === todayM && d === todayD;
  const isWorkingDay = (d: number) => {
    if (!workingDays || workingDays.length === 0) return true;
    const dow = new Date(viewYear, viewMonth, d).getDay();
    return workingDays.includes(dow);
  };

  const prevM = () => {
    if (viewYear === todayY && viewMonth === todayM) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  };
  const nextM = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  };
  const pick = (d: number) => {
    if (!d || isPast(d)) return;
    onChange(`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  };

  return (
    <div className={styles.cal}>
      <div className={styles.calHead}>
        <button className={styles.calChev} onClick={prevM} disabled={viewYear === todayY && viewMonth === todayM}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className={styles.calTitle}>{MONTHS_PT[viewMonth]} {viewYear}</span>
        <button className={styles.calChev} onClick={nextM}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className={styles.calDow}>
        {WEEK_SHORT.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className={styles.calGrid}>
        {cells.map((d, i) => (
          <button
            key={i}
            disabled={!d || isPast(d) || !isWorkingDay(d)}
            onClick={() => pick(d!)}
            className={
              !d ? styles.calEmpty :
              isSelected(d) ? styles.calSel :
              isToday(d) ? styles.calToday :
              isPast(d) || !isWorkingDay(d) ? styles.calPast :
              styles.calCell
            }
          >{d ?? ''}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Summary sidebar ── */
function Summary({ service, employee, date, time, notes, anyBarber, resolvedEmployeeName }: { service: Service|null; employee: Employee|null; date: string; time: string; notes?: string; anyBarber?: boolean; resolvedEmployeeName?: string }) {
  const hasAny = !!(service || employee || (date && date !== todayISO()) || time || notes);

  const barberLabel = anyBarber
    ? (resolvedEmployeeName ? resolvedEmployeeName : 'Qualquer disponível')
    : employee?.name ?? null;

  return (
    <aside className={styles.sidebar}>
      <p className={styles.sidebarLabel}>Resumo</p>
      {!hasAny
        ? <p className={styles.sidebarEmpty}>Suas seleções aparecerão aqui</p>
        : <>
            {service && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Serviço</span>
                <span className={styles.sidebarVal}>{service.name}</span>
                {service.durationMinutes > 0 && <span className={styles.sidebarMeta}>{service.durationMinutes} min</span>}
              </div>
            )}
            {(employee || anyBarber) && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Barbeiro</span>
                <span className={styles.sidebarVal}>{barberLabel}</span>
              </div>
            )}
            {date && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Data</span>
                <span className={styles.sidebarVal}>{fmtDateLong(date)}</span>
              </div>
            )}
            {time && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Horário</span>
                <span className={styles.sidebarVal}>{time}</span>
              </div>
            )}
            {notes && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Observações</span>
                <span className={styles.sidebarVal} style={{ fontSize: '0.75rem', opacity: 0.8 }}>{notes}</span>
              </div>
            )}
          </>
      }
      {service && (
        <div className={styles.sidebarTotal}>
          <span className={styles.sidebarTotalLabel}>Total</span>
          <span className={styles.sidebarTotalVal}>A partir de {fmt(service.price)}</span>
        </div>
      )}
    </aside>
  );
}

/* ── Main ── */
export default function Book() {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();

  const { data: unit } = useQuery<Unit>({
    queryKey: ['unit-public', unitId],
    queryFn: async () => { const { data } = await api.get(`/units/public/${unitId}`, publicRequestConfig); return data; },
    enabled: !!unitId,
    staleTime: 5 * 60 * 1000,
  });

  const avatarBaseUrl = useMemo(() => resolveApiBaseUrl(unit?.apiUrl), [unit?.apiUrl]);

  const unitApi = useMemo(() => {
    const instance = axios.create({ baseURL: avatarBaseUrl, withCredentials: true });
    setupInterceptors(instance);
    return instance;
  }, [avatarBaseUrl]);

  const [step, setStep] = useState<Step>('barber');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTime, setSelectedTime] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // "Any barber" mode: user chose the sentinel card; resolvedEmployee is filled
  // once the user picks a specific time slot (the slot carries employeeId/employeeName)
  const [anyBarber, setAnyBarber] = useState(false);
  const [resolvedEmployee, setResolvedEmployee] = useState<{ id: string; name: string } | null>(null);

  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editId');
  const targetStep = searchParams.get('step') as Step | null;

  useEffect(() => {
    if (editId) setIsInitializing(true);
  }, [editId]);



  const stepIdx = STEPS.indexOf(step);

  const { data: services = [], isLoading: svcLoading } = useQuery<Service[]>({
    queryKey: ['services', unitId, unit?.apiUrl],
    queryFn: async () => { const { data } = await unitApi.get(`/services?unitId=${unitId}&online=true`, publicRequestConfig); return Array.isArray(data) ? data : data.services ?? []; },
    enabled: !!unitId && !!unit,
    staleTime: 5 * 60 * 1000,
  });

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ['employees', unitId, unit?.apiUrl],
    queryFn: async () => { const { data } = await unitApi.get(`/employees/public?unitId=${unitId}`, publicRequestConfig); return Array.isArray(data) ? data : data.employees ?? []; },
    enabled: !!unitId && !!unit,
    staleTime: 5 * 60 * 1000,
  });

  const selectedEmployeeServiceIds = selectedEmployee?.serviceIds?.map(normalizeId).filter(Boolean) ?? [];
  const matchedEmployeeServices = selectedEmployeeServiceIds.length
    ? services.filter(s => selectedEmployeeServiceIds.includes(s._id))
    : services;
  // When anyBarber is selected we show all online services (the server will filter by employee eligibility)
  const visibleServices = anyBarber
    ? services
    : (selectedEmployeeServiceIds.length && matchedEmployeeServices.length === 0
        ? services
        : matchedEmployeeServices);

  const { data: slots = [], isFetching: slotsLoading } = useQuery<string[]>({
    queryKey: ['slots', unitId, selectedEmployee?._id, selectedDate, selectedService?.durationMinutes, unit?.apiUrl, editId],
    queryFn: async () => {
      // Editing an existing appointment: exclude it from the conflict check,
      // or its own current time window never shows up as available again.
      const excludeParam = editId ? `&excludeAppointmentId=${editId}` : '';
      const { data } = await unitApi.get(`/appointments/slots?unitId=${unitId}&employeeId=${selectedEmployee!._id}&date=${selectedDate}&durationMinutes=${selectedService!.durationMinutes}&source=guest${excludeParam}`, publicRequestConfig);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!unitId && !!selectedEmployee && selectedEmployee._id !== '__any__' && !!selectedDate && !!selectedService && step === 'datetime',
    staleTime: 60 * 1000,
  });

  const { data: anySlots = [], isFetching: anySlotsLoading } = useQuery<AnySlot[]>({
    queryKey: ['slots-any', unitId, selectedDate, selectedService?._id, unit?.apiUrl],
    queryFn: async () => {
      const { data } = await unitApi.get(`/appointments/slots-any?unitId=${unitId}&serviceId=${selectedService!._id}&date=${selectedDate}&source=guest`, publicRequestConfig);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!unitId && anyBarber && !!selectedDate && !!selectedService && step === 'datetime',
    staleTime: 60 * 1000,
  });

  const slotsLoadingCombined = slotsLoading || anySlotsLoading;

  const availableSlots = useMemo((): AnySlot[] | string[] => {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const isToday = selectedDate === todayISO();

    if (anyBarber) {
      return anySlots.filter(s => {
        if (!isToday) return true;
        const [sh, sm] = s.time.split(':').map(Number);
        return sh * 60 + sm >= nowMins + 30;
      });
    }

    return slots.filter(s => {
      if (!isToday) return true;
      const [sh, sm] = s.split(':').map(Number);
      return sh * 60 + sm >= nowMins + 30;
    });
  }, [slots, anySlots, anyBarber, selectedDate]);

  // Fetch appointment if editing
  const { data: editAppt } = useQuery<any>({
    queryKey: ['appointment', editId],
    queryFn: () => unitApi.get(`/appointments/${editId}`).then(r => r.data),
    enabled: !!editId && !!unit,
  });

  // Pre-fill if editing
  useEffect(() => {
    if (editId && editAppt && !svcLoading && !empLoading && isInitializing) {
      const svc = services.find(s => s._id === (editAppt.serviceId?._id || editAppt.serviceId));
      const emp = employees.find(e => e._id === (editAppt.employeeId?._id || editAppt.employeeId));
      
      if (svc) setSelectedService(svc);
      if (editAppt.date) setSelectedDate(editAppt.date);
      if (editAppt.startTime) setSelectedTime(editAppt.startTime);
      if (editAppt.notes) setNotes(editAppt.notes);

      if (emp) {
        // Employee found in the active list — select them directly (clears anyBarber)
        setSelectedEmployee(emp);
        setAnyBarber(false);
        setResolvedEmployee(null);
      } else if (editAppt.employeeId) {
        // Employee no longer in the public list (deactivated / moved unit).
        // Restore the name from the populated field so the confirm screen still shows it,
        // and mark as resolved so handleBook can still submit with the right id.
        const empId = editAppt.employeeId?._id || editAppt.employeeId;
        const empName = editAppt.employeeId?.name ?? '';
        setSelectedEmployee(ANY_EMPLOYEE);
        setAnyBarber(true);
        // Only restore resolvedEmployee when we are landing on 'confirm' — if
        // targetStep is 'datetime' the user needs to pick a new slot, so we
        // intentionally leave resolvedEmployee null and clear the stale time.
        if (!targetStep || targetStep === 'confirm') {
          setResolvedEmployee({ id: empId, name: empName });
        } else {
          setResolvedEmployee(null);
          setSelectedTime('');
        }
      }
      
      setStep(targetStep || 'confirm');
      setIsInitializing(false);
    }
  }, [editId, editAppt, services, employees, svcLoading, empLoading, isInitializing, targetStep]);

  const bookMutation = useMutation({
    mutationFn: (payload: object) => editId 
      ? unitApi.patch(`/appointments/${editId}`, payload)
      : unitApi.post('/appointments', payload),
    onSuccess: () => setSuccess(true),
    onError: (error: any) => {
      if (error.response?.status === 401) {
        logout();
        setBookError('Sua sessão expirou. Você pode preencher seus dados abaixo para continuar como visitante.');
      } else {
        const serverMsg = error.response?.data?.message;
        setBookError(serverMsg || 'Erro ao agendar. Tente outro horário.');
      }
    },
  });

  const guestMutation = useMutation({
    mutationFn: (payload: object) => unitApi.post('/appointments/guest', payload, publicRequestConfig),
    onSuccess: (res) => {
      const payload = res.data as { accessToken?: string; refreshToken?: string; user?: any };
      if (payload?.accessToken) {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken ?? '');
        setUser(payload.user);
      }
      setSuccess(true);
    },
    onError: (error: any) => {
      const serverMsg = error.response?.data?.message;
      setBookError(serverMsg || 'Erro ao agendar. Tente outro horário.');
    },
  });

  function goBack() {
    if (stepIdx === 0) navigate('/');
    else {
      // Clear time/resolved-employee when leaving datetime (going back to service)
      // OR when leaving confirm back to datetime — in both cases the previously
      // selected slot may no longer be valid once the user re-enters that step.
      if (step === 'datetime' || step === 'confirm') {
        setSelectedTime('');
        setResolvedEmployee(null);
      }
      setStep(STEPS[stepIdx - 1]);
    }
  }

  const storedGuestName = user?.name?.trim() ?? '';
  const storedGuestPhone = user?.phone?.trim() ?? '';
  const effectiveGuestName = guestName.trim() || storedGuestName;
  const effectiveGuestPhone = guestPhone.trim() || storedGuestPhone;
  const needsGuestDetailsForm = !storedGuestName || !storedGuestPhone;
  const canSubmitGuest = !!effectiveGuestName && !!effectiveGuestPhone;

  function handleBook() {
    setBookError(null);

    // When anyBarber mode, resolvedEmployee must be set (it's set on slot selection)
    const effectiveEmployeeId = anyBarber ? resolvedEmployee?.id : selectedEmployee?._id;
    if (!effectiveEmployeeId) {
      setBookError('Nenhum barbeiro disponível para o horário selecionado.');
      return;
    }

    const payload = { 
      unitId, 
      serviceId: selectedService!._id, 
      employeeId: effectiveEmployeeId, 
      date: selectedDate, 
      startTime: selectedTime, 
      notes: notes.trim() || undefined
    };

    if (editId) {
      // PATCH accepts a narrower set than POST: unitId is create-only, and the
      // API rejects an unexpected field with 403 instead of ignoring it.
      bookMutation.mutate({
        serviceId: payload.serviceId,
        employeeId: payload.employeeId,
        date: payload.date,
        startTime: payload.startTime,
        notes: payload.notes,
      });
      return;
    }

    if (!canSubmitGuest) {
      setBookError('Preencha seu nome e telefone para continuar.');
      return;
    }

    guestMutation.mutate({ ...payload, guestName: effectiveGuestName, guestPhone: effectiveGuestPhone });
  }

  const isBooking = bookMutation.isPending || guestMutation.isPending;

  if (success) {
    const displayEmployeeName = anyBarber
      ? (resolvedEmployee?.name ?? selectedEmployee?.name ?? '')
      : (selectedEmployee?.name ?? '');

    return (
      <div className={styles.successPage}>
        <div className={styles.successRing}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className={styles.successTitle}>Agendamento<br/>Confirmado</h2>
        <div className={styles.successDetails}>
          <span>{selectedService?.name} com {displayEmployeeName}</span>
          <span>{fmtDateLong(selectedDate)} às {selectedTime}</span>
          <span className={styles.successPrice}>{fmt(selectedService?.price ?? 0)}</span>
        </div>
        <div className={styles.successActions}>
          <button className={styles.successPrimary} onClick={() => navigate('/profile')}>Ver meus agendamentos</button>
          <button className={styles.successSecondary} onClick={() => navigate('/')}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={goBack}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span>{stepIdx === 0 ? 'Início' : STEP_LABELS[stepIdx - 1]}</span>
        </button>

        <nav className={styles.stepper}>
          <div className={styles.stepTrack}>
            <div className={styles.stepTrackFill} style={{ width: `${(stepIdx / (STEPS.length - 1)) * 100}%` }} />
          </div>
          {STEPS.map((s, i) => (
            <div key={s} className={`${styles.stepNode} ${i === stepIdx ? styles.stepActive : ''} ${i < stepIdx ? styles.stepDone : ''}`}>
              {i < stepIdx
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <span>{i + 1}</span>
              }
              <div className={styles.stepTooltip}>{STEP_LABELS[i]}</div>
            </div>
          ))}
        </nav>

        <button className={styles.profileBtn} onClick={() => navigate('/profile')} title="Minha conta">
          {user
            ? <span>{initials((user as { name: string }).name)}</span>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          }
        </button>
      </header>

      {/* ── Body ── */}
      <div className={styles.body}>
        <div className={styles.stepMeta}>
          <span className={styles.stepCounter}>{stepIdx + 1} de {STEPS.length}</span>
          <h1 className={styles.stepHeading}>
            {editId ? `Editar ${STEP_LABELS[stepIdx]}` : STEP_LABELS[stepIdx]}
          </h1>
        </div>

        {isInitializing ? (
          <div className={styles.initializing}>
            <p>Carregando dados do agendamento...</p>
          </div>
        ) : (
          <div className={styles.layout}>
          <main className={styles.main}>

            {/* ── Service ── */}
            {step === 'service' && (
              <div className={styles.serviceList}>
                {svcLoading && <p className={styles.loading}>Carregando serviços...</p>}
                {visibleServices.filter(s => s.isActive !== false).map(svc => (
                  <button
                    key={svc._id}
                    className={`${styles.svcRow} ${selectedService?._id === svc._id ? styles.svcRowSel : ''}`}
                    onClick={() => {
                      // Clear time/resolved employee whenever service changes so stale
                      // slot+employee from a previous service doesn't reach the payload
                      if (svc._id !== selectedService?._id) {
                        setSelectedTime('');
                        setResolvedEmployee(null);
                      }
                      setSelectedService(svc);
                      setStep(editId ? 'confirm' : 'datetime');
                    }}
                  >
                    <div className={styles.svcIcon}>
                      {svc.image ? (
                        <img src={svc.image} alt={svc.name} className={styles.svcImg} />
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 3v18M18 3v18M3 9h18M3 15h18"/>
                        </svg>
                      )}
                    </div>
                    <div className={styles.svcInfo}>
                      <span className={styles.svcName}>{svc.name}</span>
                      {svc.description && <span className={styles.svcDesc}>{svc.description}</span>}
                    </div>
                    <div className={styles.svcRight}>
                      {svc.showPrice !== false && (
                        <span className={styles.svcPrice}>
                          {svc.showPricePrefix !== false ? 'A partir de ' : ''}{fmt(svc.price)}
                        </span>
                      )}
                      {svc.durationMinutes > 0 && <span className={styles.svcDur}>{svc.durationMinutes}min</span>}
                    </div>
                    <svg className={styles.svcArrow} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            )}

            {/* ── Barber ── */}
            {step === 'barber' && (
              <div className={styles.empGrid}>
                {empLoading && <p className={styles.loading}>Carregando...</p>}

                {/* Any barber card */}
                <button
                  className={`${styles.empCard} ${styles.empCardAny} ${anyBarber ? styles.empCardSel : ''}`}
                  onClick={() => {
                    setAnyBarber(true);
                    setSelectedEmployee(ANY_EMPLOYEE);
                    setResolvedEmployee(null);
                    setSelectedTime('');
                    setStep(editId ? 'confirm' : 'service');
                  }}
                >
                  <div className={styles.empAvatarWrap}>
                    <div className={`${styles.empAvatar} ${styles.empAvatarAny}`}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 1l4 4-4 4"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <path d="M7 23l-4-4 4-4"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                      </svg>
                    </div>
                  </div>
                  <span className={styles.empName}>Qualquer</span>
                  <span className={styles.empRole}>Primeiro disponível</span>
                </button>

                {employees.map(emp => (
                  <button
                    key={emp._id}
                    className={`${styles.empCard} ${!anyBarber && selectedEmployee?._id === emp._id ? styles.empCardSel : ''}`}
                    onClick={() => {
                      setAnyBarber(false);
                      setSelectedEmployee(emp);
                      setResolvedEmployee(null);
                      setSelectedTime('');
                      setStep(editId ? 'confirm' : 'service');
                    }}
                  >
                    <div className={styles.empAvatarWrap}>
                      <div className={styles.empAvatar}>
                        {emp.hasAvatar ? (
                          <img src={`${avatarBaseUrl}/employees/public/${emp._id}/avatar`} alt={emp.name} className={styles.avatarImg} />
                        ) : (
                          initials(emp.name)
                        )}
                      </div>
                    </div>
                    <span className={styles.empName}>{emp.name}</span>
                    <span className={styles.empRole}>Barbeiro</span>
                    {emp.daySchedules && emp.daySchedules.length > 0 && (
                      <span className={styles.empDays}>
                        {[...emp.daySchedules].sort((a, b) => a.day - b.day).map(ds => DAY_SHORT_BOOKING[ds.day]).join(' · ')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Date & Time ── */}
            {step === 'datetime' && (
              <div className={styles.dtWrap}>
                <Calendar
                  value={selectedDate}
                  onChange={d => { setSelectedDate(d); setSelectedTime(''); setResolvedEmployee(null); }}
                  workingDays={
                    anyBarber
                      ? unit?.workingDays
                      : (selectedEmployee?.daySchedules && selectedEmployee.daySchedules.length > 0
                          ? selectedEmployee.daySchedules.map(ds => ds.day)
                          : selectedEmployee?.workSchedule?.workDays ?? unit?.workingDays)
                  }
                />
                <div className={styles.slotsWrap}>
                  <p className={styles.slotsLabel}>
                    Horários disponíveis
                    {selectedDate && <span> — {fmtDateLong(selectedDate)}</span>}
                  </p>
                  {slotsLoadingCombined ? (
                    <p className={styles.loading}>Verificando disponibilidade...</p>
                  ) : availableSlots.length === 0 ? (
                    <p className={styles.slotsEmpty}>Nenhum horário disponível para este dia.</p>
                  ) : (
                    <>
                      <div className={styles.slotsGrid}>
                        {anyBarber
                          ? (availableSlots as AnySlot[]).map(s => (
                              <button
                                key={`${s.time}-${s.employeeId}`}
                                className={`${styles.slot} ${selectedTime === s.time && resolvedEmployee?.id === s.employeeId ? styles.slotSel : ''}`}
                                onClick={() => {
                                  setSelectedTime(s.time);
                                  setResolvedEmployee({ id: s.employeeId, name: s.employeeName });
                                }}
                              >{s.time}</button>
                            ))
                          : (availableSlots as string[]).map(s => (
                              <button
                                key={s}
                                className={`${styles.slot} ${selectedTime === s ? styles.slotSel : ''}`}
                                onClick={() => setSelectedTime(s)}
                              >{s}</button>
                            ))
                        }
                      </div>
                      {selectedTime && anyBarber && resolvedEmployee && (
                        <p className={styles.resolvedBarberNote}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          Barbeiro: <strong>{resolvedEmployee.name}</strong>
                        </p>
                      )}
                    </>
                  )}
                  {/* Only show "Continuar" when there is a fully resolved selection:
                      - normal mode: a time is selected
                      - anyBarber mode: a time AND a resolved employee are both set */}
                  {selectedTime && (!anyBarber || resolvedEmployee) && (
                    <button className={styles.continueBtn} onClick={() => setStep('confirm')}>
                      Continuar
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Confirm ── */}
            {step === 'confirm' && (
              <div className={styles.confirmWrap}>
                <div className={styles.confirmCard}>
                  <div className={styles.confirmCardHead}>
                    <span>Detalhes do agendamento</span>
                  </div>
                  {([
                    ['Serviço', selectedService?.name],
                    ['Duração', selectedService?.durationMinutes ? `${selectedService.durationMinutes} min` : null],
                    ['Barbeiro', anyBarber ? (resolvedEmployee?.name ?? 'A definir') : selectedEmployee?.name],
                    ['Data', fmtDateLong(selectedDate)],
                    ['Horário', selectedTime],
                  ] as [string, string | null | undefined][]).filter(([, v]) => !!v).map(([label, val]) => (
                    <div key={label} className={styles.confirmRow}>
                      <span className={styles.confirmLabel}>{label}</span>
                      <span className={styles.confirmVal}>{val}</span>
                    </div>
                  ))}
                  <div className={styles.confirmTotal}>
                    <span className={styles.confirmTotalLabel}>Total</span>
                    <span className={styles.confirmTotalVal}>A partir de {fmt(selectedService?.price ?? 0)}</span>
                  </div>
                </div>

                {needsGuestDetailsForm && (
                  <div className={styles.guestForm}>
                    <div className={styles.guestFormHead}>
                      <p className={styles.guestFormTitle}>Seus dados</p>
                      <p className={styles.guestFormSub}>Sem login necessário</p>
                    </div>
                    <div className={styles.guestFields}>
                      <div className={styles.guestField}>
                        <label className={styles.guestLabel}>Nome *</label>
                        <input
                          className={styles.guestInput}
                          placeholder="Seu nome completo"
                          value={guestName}
                          onChange={e => setGuestName(e.target.value)}
                        />
                      </div>
                      <div className={styles.guestField}>
                        <label className={styles.guestLabel}>Telefone *</label>
                        <input
                          className={styles.guestInput}
                          placeholder="(19) 9XXXX-XXXX"
                          value={guestPhone}
                          onChange={e => setGuestPhone(maskPhone(e.target.value))}
                          inputMode="tel"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.guestForm} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.guestFormHead}>
                    <p className={styles.guestFormTitle}>Observações</p>
                  </div>
                  <div className={styles.guestFields}>
                    <div className={styles.guestField}>
                      <textarea
                        className={styles.guestTextarea}
                        placeholder="Algum detalhe adicional sobre o seu atendimento?"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {bookError && <div className={styles.error}>{bookError}</div>}
                <button
                  className={styles.confirmBtn}
                  disabled={isBooking || !selectedTime || (anyBarber && !resolvedEmployee) || (!editId && !canSubmitGuest)}
                  onClick={handleBook}
                >
                  {isBooking ? 'Agendando...' : 'Confirmar Agendamento'}
                </button>
                {user && !needsGuestDetailsForm && !editId && (
                  <p className={styles.loggedAsNote}>
                    Agendando como <strong>{(user as { name: string }).name}</strong>
                  </p>
                )}
              </div>
            )}

          </main>
          <Summary service={selectedService} employee={selectedEmployee} date={selectedDate} time={selectedTime} notes={notes} anyBarber={anyBarber} resolvedEmployeeName={resolvedEmployee?.name} />
        </div>
        )}
      </div>
    </div>
  );
}
