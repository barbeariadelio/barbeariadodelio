import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Profile.module.scss';

interface Appt {
  _id: string;
  date: string;
  startTime: string;
  endTime?: string;
  serviceId: { name: string; price?: number } | null;
  employeeId: { name: string } | null;
  unitId: { name: string; address: string } | null;
  status: string;
  price: number;
}

const SC: Record<string, string> = { pending: '#F59E0B', confirmed: '#1E88E5', completed: '#22C55E', cancelled: '#EF5350' };
const SL: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };
const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MONTHS_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmt(v: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function initials(name: string) { return name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase(); }
function isGuest(email: string) { return email?.includes('@delio.guest'); }
function displayEmail(user: any) {
  if (!user) return '';
  if (isGuest(user.email)) return user.phone ?? 'Conta de agendamento';
  return user.email;
}
function getUserId(user: any) { return user?.id ?? user?._id ?? ''; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function ApptRow({ a }: { a: Appt }) {
  const [, m, d] = a.date.split('-').map(Number);
  const today = todayISO();
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const isPast = a.date < today || (a.date === today && a.startTime < nowTime);
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
        <span className={styles.apptBadge} style={{ color: SC[a.status], background: SC[a.status] + '18', borderColor: SC[a.status] + '40' }}>
          {SL[a.status]}
        </span>
        <span className={styles.apptPrice}>{fmt(a.price)}</span>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: appointments = [], isLoading } = useQuery<Appt[]>({
    queryKey: ['my-appointments', getUserId(user)],
    queryFn: async () => {
      const { data } = await api.get('/appointments/my');
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.noAuth}>
          <div className={styles.noAuthIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <p className={styles.noAuthText}>Faça login para ver seu perfil e seus agendamentos.</p>
          <button className={styles.loginBtn} onClick={() => navigate('/login')}>Entrar / Criar Conta</button>
          <button className={styles.backLinkBtn} onClick={() => navigate('/')}>← Voltar ao início</button>
        </div>
      </div>
    );
  }

  const u = user as any;
  const today = todayISO();
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const upcoming = appointments.filter(a => (a.status === 'pending' || a.status === 'confirmed') && (a.date > today || (a.date === today && a.startTime >= nowTime)));
  const past = appointments.filter(a => a.status === 'completed' || a.status === 'cancelled' || a.date < today || (a.date === today && a.startTime < nowTime));
  const nextAppt = upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];
  const totalSpent = appointments.filter(a => a.status === 'completed').reduce((s, a) => s + a.price, 0);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Início
        </button>
        <button className={styles.logoutBtn} onClick={() => { logout(); navigate('/'); }}>Sair</button>
      </header>

      <div className={styles.inner}>

        {/* ── Profile card ── */}
        <div className={styles.profileCard}>
          <div className={styles.avatar}>{initials(u.name)}</div>
          <div className={styles.profileInfo}>
            <h1 className={styles.name}>{u.name}</h1>
            <p className={styles.profileSub}>{displayEmail(u)}</p>
          </div>
          <button className={styles.newApptBtn} onClick={() => navigate('/')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo agendamento
          </button>
        </div>

        {/* ── Next appointment highlight ── */}
        {nextAppt && (() => {
          const [y, m, d] = nextAppt.date.split('-').map(Number);
          return (
            <div className={styles.nextCard}>
              <div className={styles.nextLabel}>Próximo agendamento</div>
              <div className={styles.nextMain}>
                <div className={styles.nextDate}>
                  <span className={styles.nextDay}>{d}</span>
                  <div>
                    <span className={styles.nextMonth}>{MONTHS_LONG[m - 1]}</span>
                    <span className={styles.nextYear}>{y}</span>
                  </div>
                </div>
                <div className={styles.nextInfo}>
                  <span className={styles.nextService}>{nextAppt.serviceId?.name}</span>
                  <span className={styles.nextMeta}>{nextAppt.startTime} · {nextAppt.employeeId?.name}</span>
                  {nextAppt.unitId && (
                    <span className={styles.nextUnit}>
                      {typeof nextAppt.unitId === 'object' && nextAppt.unitId.name
                        ? <>{nextAppt.unitId.name} <br /> <small>{nextAppt.unitId.address}</small></>
                        : `Unidade: ${typeof nextAppt.unitId === 'string' ? nextAppt.unitId : 'Dados incompletos'}`}
                    </span>
                  )}
                </div>
                <span className={styles.nextBadge} style={{ color: SC[nextAppt.status], background: SC[nextAppt.status] + '18', borderColor: SC[nextAppt.status] + '40' }}>
                  {SL[nextAppt.status]}
                </span>
              </div>
            </div>
          );
        })()}

        {isLoading && <p className={styles.loading}>Carregando agendamentos...</p>}

        {/* ── Upcoming ── */}
        {!isLoading && upcoming.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Próximos</h2>
            <div className={styles.apptList}>
              {upcoming.sort((a,b) => a.date.localeCompare(b.date)).map(a => <ApptRow key={a._id} a={a} />)}
            </div>
          </section>
        )}

        {!isLoading && upcoming.length === 0 && appointments.length === 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Próximos</h2>
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <p>Nenhum agendamento ainda.</p>
              <button className={styles.emptyBtn} onClick={() => navigate('/')}>Agendar agora</button>
            </div>
          </section>
        )}

        {/* ── History ── */}
        {!isLoading && past.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Histórico</h2>
            <div className={styles.apptList}>
              {past.sort((a,b) => b.date.localeCompare(a.date)).map(a => <ApptRow key={a._id} a={a} />)}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
