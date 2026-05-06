import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { api, resolveApiBaseUrl } from '../../api/client';
import styles from './Book.module.scss';

interface Unit { _id: string; name: string; apiUrl?: string; }
interface Service { _id: string; name: string; description?: string; price: number; durationMinutes: number; isActive?: boolean; image?: string; }
interface Employee { _id: string; name: string; avatar?: string; }

type Step = 'service' | 'barber' | 'datetime' | 'confirm';
const STEPS: Step[] = ['service', 'barber', 'datetime', 'confirm'];
const STEP_LABELS = ['Serviço', 'Barbeiro', 'Data & Hora', 'Confirmação'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const WEEK_SHORT = ['D','S','T','Q','Q','S','S'];

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
function fmtDateLong(iso: string) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS_SHORT[m-1]} de ${y}`;
}

/* ── Calendar ── */
function Calendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
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
            disabled={!d || isPast(d)}
            onClick={() => pick(d!)}
            className={
              !d ? styles.calEmpty :
              isSelected(d) ? styles.calSel :
              isToday(d) ? styles.calToday :
              isPast(d) ? styles.calPast :
              styles.calCell
            }
          >{d ?? ''}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Summary sidebar ── */
function Summary({ service, employee, date, time }: { service: Service|null; employee: Employee|null; date: string; time: string }) {
  const hasAny = !!(service || employee || (date && date !== todayISO()) || time);
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
                <span className={styles.sidebarMeta}>{service.durationMinutes} min</span>
              </div>
            )}
            {employee && (
              <div className={styles.sidebarBlock}>
                <span className={styles.sidebarKey}>Barbeiro</span>
                <span className={styles.sidebarVal}>{employee.name}</span>
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
          </>
      }
      {service && (
        <div className={styles.sidebarTotal}>
          <span className={styles.sidebarTotalLabel}>Total</span>
          <span className={styles.sidebarTotalVal}>{fmt(service.price)}</span>
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
    queryFn: async () => { const { data } = await api.get(`/units/public/${unitId}`); return data; },
    enabled: !!unitId,
  });

  const unitApi = useMemo(() => {
    const base = resolveApiBaseUrl(unit?.apiUrl);
    const instance = axios.create({ baseURL: base });
    instance.interceptors.request.use(cfg => {
      const token = localStorage.getItem('accessToken');
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });
    instance.interceptors.response.use(res => {
      if (res.data && typeof res.data === 'object' && 'data' in res.data) res.data = res.data.data;
      return res;
    });
    return instance;
  }, [unit?.apiUrl]);

  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedTime, setSelectedTime] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [success, setSuccess] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const stepIdx = STEPS.indexOf(step);

  const { data: services = [], isLoading: svcLoading } = useQuery<Service[]>({
    queryKey: ['services', unitId, unit?.apiUrl],
    queryFn: async () => { const { data } = await unitApi.get(`/services?unitId=${unitId}`); return Array.isArray(data) ? data : data.services ?? []; },
    enabled: !!unitId && !!unit,
  });

  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ['employees', unitId, unit?.apiUrl],
    queryFn: async () => { const { data } = await unitApi.get(`/employees/public?unitId=${unitId}`); return Array.isArray(data) ? data : data.employees ?? []; },
    enabled: !!unitId && !!unit,
  });

  const { data: slots = [], isFetching: slotsLoading } = useQuery<string[]>({
    queryKey: ['slots', unitId, selectedEmployee?._id, selectedDate, selectedService?.durationMinutes, unit?.apiUrl],
    queryFn: async () => {
      const { data } = await unitApi.get(`/appointments/slots?unitId=${unitId}&employeeId=${selectedEmployee!._id}&date=${selectedDate}&durationMinutes=${selectedService!.durationMinutes}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!unitId && !!unit && !!selectedEmployee && !!selectedDate && !!selectedService && step === 'datetime',
  });

  const bookMutation = useMutation({
    mutationFn: (payload: object) => unitApi.post('/appointments', payload),
    onSuccess: () => setSuccess(true),
    onError: (error: any) => {
      if (error.response?.status === 401) {
        logout();
        setBookError('Sua sessão expirou. Você pode preencher seus dados abaixo para continuar como visitante.');
      } else {
        setBookError('Erro ao agendar. Tente outro horário.');
      }
    },
  });

  const guestMutation = useMutation({
    mutationFn: (payload: object) => unitApi.post('/appointments/guest', payload),
    onSuccess: (res) => {
      const payload = res.data as { accessToken?: string; refreshToken?: string; user?: any };
      if (payload?.accessToken) {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken ?? '');
        setUser(payload.user);
      }
      setSuccess(true);
    },
    onError: () => setBookError('Erro ao agendar. Tente outro horário.'),
  });

  function goBack() {
    if (stepIdx === 0) navigate('/');
    else setStep(STEPS[stepIdx - 1]);
  }

  function handleBook() {
    setBookError(null);
    if (user) {
      bookMutation.mutate({ unitId, serviceId: selectedService!._id, employeeId: selectedEmployee!._id, date: selectedDate, startTime: selectedTime, price: selectedService!.price });
    } else {
      if (!guestName.trim() || !guestPhone.trim()) {
        setBookError('Preencha seu nome e telefone para continuar.');
        return;
      }
      guestMutation.mutate({ unitId, serviceId: selectedService!._id, employeeId: selectedEmployee!._id, date: selectedDate, startTime: selectedTime, price: selectedService!.price, guestName: guestName.trim(), guestPhone: guestPhone.trim() });
    }
  }

  const isBooking = bookMutation.isPending || guestMutation.isPending;

  if (success) {
    return (
      <div className={styles.successPage}>
        <div className={styles.successRing}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className={styles.successTitle}>Agendamento<br/>Confirmado</h2>
        <div className={styles.successDetails}>
          <span>{selectedService?.name} com {selectedEmployee?.name}</span>
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
          <h1 className={styles.stepHeading}>{STEP_LABELS[stepIdx]}</h1>
        </div>

        <div className={styles.layout}>
          <main className={styles.main}>

            {/* ── Service ── */}
            {step === 'service' && (
              <div className={styles.serviceList}>
                {svcLoading && <p className={styles.loading}>Carregando serviços...</p>}
                {services.filter(s => s.isActive !== false).map(svc => (
                  <button
                    key={svc._id}
                    className={`${styles.svcRow} ${selectedService?._id === svc._id ? styles.svcRowSel : ''}`}
                    onClick={() => { setSelectedService(svc); setStep('barber'); }}
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
                      <span className={styles.svcPrice}>{fmt(svc.price)}</span>
                      <span className={styles.svcDur}>{svc.durationMinutes}min</span>
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
                {employees.map(emp => (
                  <button
                    key={emp._id}
                    className={`${styles.empCard} ${selectedEmployee?._id === emp._id ? styles.empCardSel : ''}`}
                    onClick={() => { setSelectedEmployee(emp); setStep('datetime'); }}
                  >
                    <div className={styles.empAvatarWrap}>
                      <div className={styles.empAvatar}>
                        {emp.avatar ? (
                          <img src={emp.avatar} alt={emp.name} className={styles.avatarImg} />
                        ) : (
                          initials(emp.name)
                        )}
                      </div>
                    </div>
                    <span className={styles.empName}>{emp.name}</span>
                    <span className={styles.empRole}>Barbeiro</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Date & Time ── */}
            {step === 'datetime' && (
              <div className={styles.dtWrap}>
                <Calendar value={selectedDate} onChange={d => { setSelectedDate(d); setSelectedTime(''); }} />
                <div className={styles.slotsWrap}>
                  <p className={styles.slotsLabel}>
                    Horários disponíveis
                    {selectedDate && <span> — {fmtDateLong(selectedDate)}</span>}
                  </p>
                  {slotsLoading ? (
                    <p className={styles.loading}>Verificando disponibilidade...</p>
                  ) : slots.length === 0 ? (
                    <p className={styles.slotsEmpty}>Nenhum horário disponível para este dia.</p>
                  ) : (
                    <div className={styles.slotsGrid}>
                      {slots.filter(s => {
                        if (selectedDate !== todayISO()) return true;
                        const [sh, sm] = s.split(':').map(Number);
                        const now = new Date();
                        const nh = now.getHours();
                        const nm = now.getMinutes();
                        return sh > nh || (sh === nh && sm > nm);
                      }).map(s => (
                        <button
                          key={s}
                          className={`${styles.slot} ${selectedTime === s ? styles.slotSel : ''}`}
                          onClick={() => setSelectedTime(s)}
                        >{s}</button>
                      ))}
                    </div>
                  )}
                  {selectedTime && (
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
                    ['Duração', selectedService ? `${selectedService.durationMinutes} min` : null],
                    ['Barbeiro', selectedEmployee?.name],
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
                    <span className={styles.confirmTotalVal}>{fmt(selectedService?.price ?? 0)}</span>
                  </div>
                </div>

                {!user && (
                  <div className={styles.guestForm}>
                    <div className={styles.guestFormHead}>
                      <p className={styles.guestFormTitle}>Seus dados</p>
                      <p className={styles.guestFormSub}>
                        Sem login necessário — ou{' '}
                        <button className={styles.guestLoginLink} onClick={() => navigate('/login')}>entrar com conta</button>
                      </p>
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

                {bookError && <div className={styles.error}>{bookError}</div>}
                <button
                  className={styles.confirmBtn}
                  disabled={isBooking || (!user && (!guestName.trim() || !guestPhone.trim()))}
                  onClick={handleBook}
                >
                  {isBooking ? 'Agendando...' : 'Confirmar Agendamento'}
                </button>
                {user && (
                  <p className={styles.loggedAsNote}>
                    Agendando como <strong>{(user as { name: string }).name}</strong>
                  </p>
                )}
              </div>
            )}

          </main>
          <Summary service={selectedService} employee={selectedEmployee} date={selectedDate} time={selectedTime} />
        </div>
      </div>
    </div>
  );
}
