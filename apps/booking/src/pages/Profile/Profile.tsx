import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Profile.module.scss';

interface Appt {
  _id: string;
  date: string;
  startTime: string;
  endTime?: string;
  serviceId: { name: string; price?: number; durationMinutes?: number } | null;
  employeeId: { _id: string; name: string } | null;
  unitId: { _id: string; name: string; address: string } | null;
  status: string;
  price: number;
}

const SC: Record<string, string> = { pending: '#F59E0B', confirmed: '#1E88E5', completed: '#22C55E', cancelled: '#EF5350' };
const SL: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };
const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MONTHS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmt(v: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function initials(name: string) { return name?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() || '?'; }
function isGuest(email: string) { return email?.includes('@delio.guest'); }
function displayEmail(user: any) {
  if (!user) return '';
  if (isGuest(user.email)) return user.phone ?? 'Conta de agendamento';
  return user.email;
}
function getUserId(user: any) { return user?.id ?? user?._id ?? ''; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function ApptRow({ a, onCancel, onEdit }: { a: Appt; onCancel?: (id: string) => void; onEdit?: (appt: Appt) => void }) {
  const [, m, d] = a.date.split('-').map(Number);
  const today = todayISO();
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const isPast = a.date < today || (a.date === today && a.startTime < nowTime);
  const canCancel = !isPast && (a.status === 'pending' || a.status === 'confirmed');

  return (
    <div className={styles.apptRow}>
      <div className={`${styles.apptDateCol} ${isPast ? styles.apptDatePast : ''}`}>
        <span className={styles.apptDay}>{d}</span>
        <span className={styles.apptMonth}>{MONTHS[m - 1]}</span>
      </div>
      <div className={styles.apptInfo}>
        <span className={styles.apptService}>{a.serviceId?.name ?? 'Serviço'}</span>
        <span className={styles.apptMeta}>
          {a.startTime}
          {a.employeeId?.name && <> · {a.employeeId.name}</>}
        </span>
        {a.unitId && (
          <span className={styles.apptUnit}>
            {typeof a.unitId === 'object' && a.unitId.name 
              ? `${a.unitId.name} — ${a.unitId.address}` 
              : `Unidade: ${typeof a.unitId === 'string' ? a.unitId : 'Dados incompletos'}`}
          </span>
        )}
      </div>
      <div className={styles.apptRight}>
        <div className={styles.badgeRow}>
          <span className={styles.apptBadge} style={{ color: SC[a.status], background: SC[a.status] + '18', borderColor: SC[a.status] + '40' }}>
            {SL[a.status]}
          </span>
          {canCancel && (
            <div className={styles.rowActions}>
              <button className={styles.editBtn} onClick={() => onEdit?.(a)}>Editar</button>
              <button className={styles.cancelBtn} onClick={() => onCancel?.(a._id)}>Cancelar</button>
            </div>
          )}
        </div>
        <span className={styles.apptPrice}>{fmt(a.price)}</span>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apptToCancel, setApptToCancel] = useState<string | null>(null);
  const [apptToEdit, setApptToEdit] = useState<Appt | null>(null);
  const [editStep, setEditStep] = useState<'choice' | 'barber' | 'service' | 'datetime' | 'confirm'>('choice');
  const [selDate, setSelDate] = useState(todayISO());
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  const editUnitId = apptToEdit?.unitId?._id || (typeof apptToEdit?.unitId === 'string' ? apptToEdit.unitId : '');

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ['services', editUnitId],
    queryFn: () => api.get(`/services?unitId=${editUnitId}`).then(r => r.data),
    enabled: !!editUnitId && editStep === 'service',
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees', editUnitId],
    queryFn: () => api.get(`/employees/public?unitId=${editUnitId}`).then(r => r.data),
    enabled: !!editUnitId && editStep === 'barber',
  });

  const { data: slots = [], isFetching: slotsLoading } = useQuery<string[]>({
    queryKey: ['slots', editUnitId, apptToEdit?.employeeId, selDate],
    queryFn: () => api.get(`/appointments/slots?unitId=${editUnitId}&employeeId=${apptToEdit?.employeeId?._id || apptToEdit?.employeeId}&date=${selDate}&durationMinutes=${apptToEdit?.serviceId?.durationMinutes || 30}`).then(r => r.data),
    enabled: !!editUnitId && !!apptToEdit && editStep === 'datetime',
  });

  const { data: appointments = [], isLoading } = useQuery<Appt[]>({
    queryKey: ['my-appointments', getUserId(user)],
    queryFn: async () => {
      try {
        const { data } = await api.get('/appointments/my');
        return Array.isArray(data) ? data : [];
      } catch (err: any) {
        if (err.response?.status === 401) return [];
        throw err;
      }
    },
    enabled: !!user,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/status`, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      setApptToCancel(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/appointments/${apptToEdit?._id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      setApptToEdit(null);
      setEditStep('choice');
      setPendingUpdate(null);
    },
  });

  const handleEditSelect = (payload: any) => {
    setPendingUpdate(payload);
    setEditStep('confirm');
  };

  if (!user) {
    return (
      <div className={styles.noAuth}>
        <div className={styles.noAuthIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <h1 className={styles.modalTitle}>Acesse seu perfil</h1>
        <p className={styles.noAuthText}>Faça login para gerenciar seus agendamentos e ver seu histórico.</p>
        <button className={styles.loginBtn} onClick={() => navigate('/login')}>Entrar na conta</button>
        <button className={styles.backLinkBtn} onClick={() => navigate('/')}>Voltar ao início</button>
      </div>
    );
  }

  const today = todayISO();
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  const upcoming = appointments.filter(a => {
    const isPast = a.date < today || (a.date === today && a.startTime < nowTime);
    return !isPast && (a.status === 'pending' || a.status === 'confirmed');
  });
  const nextAppt = [...upcoming].sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];

  const cancelApptData = appointments.find(it => it._id === apptToCancel);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>Início</button>
        <button className={styles.logoutBtn} onClick={() => { logout(); navigate('/'); }}>Sair</button>
      </header>

      <div className={styles.inner}>
        <div className={styles.profileCard}>
          <div className={styles.avatar}>{initials((user as any).name)}</div>
          <div className={styles.profileInfo}>
            <h1 className={styles.name}>{(user as any).name}</h1>
            <p className={styles.profileSub}>{displayEmail(user)}</p>
          </div>
        </div>

        {nextAppt && (() => {
          const [, nm, nd] = nextAppt.date.split('-').map(Number);
          const [, ny] = nextAppt.date.split('-').map(Number);
          const year = nextAppt.date.split('-')[0];
          return (
            <div className={styles.nextCard}>
              <p className={styles.nextLabel}>Próximo Agendamento</p>
              <div className={styles.nextMain}>
                <div className={styles.nextDate}>
                  <span className={styles.nextDay}>{nd}</span>
                  <div>
                    <span className={styles.nextMonth}>{MONTHS_LONG[nm - 1]}</span>
                    <span className={styles.nextYear}>{year}</span>
                  </div>
                </div>
                <div className={styles.nextInfo}>
                  <span className={styles.nextService}>{nextAppt.serviceId?.name ?? 'Serviço'}</span>
                  <span className={styles.nextMeta}>
                    {nextAppt.startTime}{nextAppt.employeeId?.name && ` · ${nextAppt.employeeId.name}`}
                  </span>
                  {nextAppt.unitId && (
                    <span className={styles.nextUnit}>
                      {nextAppt.unitId.name} — {nextAppt.unitId.address}
                    </span>
                  )}
                </div>
                <span
                  className={styles.nextBadge}
                  style={{ color: SC[nextAppt.status], background: SC[nextAppt.status] + '18', borderColor: SC[nextAppt.status] + '40' }}
                >
                  {SL[nextAppt.status]}
                </span>
              </div>
            </div>
          );
        })()}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Seus Agendamentos</h2>
          {isLoading ? <p>Carregando...</p> : (
            <div className={styles.apptList}>
              {upcoming.length === 0
                ? <div className={styles.emptyState}><p>Nenhum agendamento futuro.</p></div>
                : upcoming.map(a => (
                    <ApptRow key={a._id} a={a} onCancel={setApptToCancel} onEdit={setApptToEdit} />
                  ))
              }
            </div>
          )}
        </section>
      </div>

      {apptToCancel && cancelApptData && (
        <div className={styles.modalOverlay} onClick={() => setApptToCancel(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Cancelar agendamento?</h3>
            <p className={styles.modalText}>Deseja cancelar o serviço {cancelApptData.serviceId?.name}?</p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setApptToCancel(null)}>Voltar</button>
              <button className={styles.modalConfirmBtn} onClick={() => cancelMutation.mutate(apptToCancel)}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {apptToEdit && (
        <div className={styles.modalOverlay} onClick={() => { setApptToEdit(null); setEditStep('choice'); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <button className={styles.modalCloseBtn} onClick={() => { setApptToEdit(null); setEditStep('choice'); }}>✕</button>
            <h3 className={styles.modalTitle}>Editar Agendamento</h3>
            
            {editStep === 'choice' && (
              <div className={styles.editOptions}>
                <button className={styles.editOptionBtn} onClick={() => setEditStep('datetime')}>Data e Hora</button>
                <button className={styles.editOptionBtn} onClick={() => setEditStep('barber')}>Profissional</button>
                <button className={styles.editOptionBtn} onClick={() => setEditStep('service')}>Serviço</button>
              </div>
            )}

            {editStep === 'barber' && (
              <div className={styles.listOptions}>
                {employees.map(e => (
                  <button key={e._id} className={styles.listOptionBtn} onClick={() => handleEditSelect({ employeeId: e._id, employeeName: e.name })}>
                    {e.name}
                  </button>
                ))}
              </div>
            )}

            {editStep === 'service' && (
              <div className={styles.listOptions}>
                {services.map(s => (
                  <button key={s._id} className={styles.listOptionBtn} onClick={() => handleEditSelect({ serviceId: s._id, price: s.price, serviceName: s.name })}>
                    {s.name} — {fmt(s.price)}
                  </button>
                ))}
              </div>
            )}

            {editStep === 'datetime' && (
              <div className={styles.datePickerWrap}>
                <input type="date" value={selDate} min={todayISO()} onChange={e => setSelDate(e.target.value)} className={styles.dateInput} />
                <div className={styles.slotGrid}>
                  {slotsLoading ? <p>Carregando...</p> : slots.map(t => (
                    <button key={t} className={styles.slotBtn} onClick={() => handleEditSelect({ date: selDate, startTime: t })}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            {editStep === 'confirm' && (
              <div className={styles.confirmView}>
                <p className={styles.modalText}>Deseja alterar as informações para:</p>
                <div className={styles.confirmBox}>
                  {pendingUpdate.serviceName && <p><strong>Serviço:</strong> {pendingUpdate.serviceName}</p>}
                  {pendingUpdate.employeeName && <p><strong>Profissional:</strong> {pendingUpdate.employeeName}</p>}
                  {pendingUpdate.date && <p><strong>Data:</strong> {pendingUpdate.date.split('-').reverse().join('/')}</p>}
                  {pendingUpdate.startTime && <p><strong>Horário:</strong> {pendingUpdate.startTime}</p>}
                </div>
                <div className={styles.modalActions} style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                  <button className={styles.modalCancelBtn} style={{ flex: 1 }} onClick={() => setEditStep('choice')}>Voltar</button>
                  <button className={styles.modalConfirmBtn} style={{ flex: 1 }} onClick={() => updateMutation.mutate(pendingUpdate)} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}

            {editStep !== 'confirm' && (
              <button className={styles.modalCancelBtn} style={{ width: '100%', marginTop: '1rem' }} onClick={() => {
                if (editStep === 'choice') setApptToEdit(null);
                else setEditStep('choice');
              }}>
                {editStep === 'choice' ? 'Fechar' : 'Voltar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
