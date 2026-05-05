import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Landing.module.scss';

interface Unit { _id: string; name: string; address: string; phone: string; }

function initials(name: string) { return name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase(); }

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ['public-units'],
    queryFn: async () => {
      const { data } = await api.get('/units/public');
      return Array.isArray(data) ? data : data.units ?? [];
    },
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.w}>BARBEARIA</span>
          <span className={styles.b}>DÉLIO</span>
        </div>
        <div className={styles.headerRight}>
          {user ? (
            <button className={styles.avatarBtn} onClick={() => navigate('/profile')}>
              {initials((user as { name: string }).name)}
            </button>
          ) : (
            <button className={styles.loginBtn} onClick={() => navigate('/login')}>Minha Conta</button>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.heroText}>
          <h1 className={styles.headline}>
            AGENDE
            <span className={styles.headlineAccent}>seu horário</span>
          </h1>
          <p className={styles.sub}>Escolha a unidade mais próxima de você e reserve seu horário em poucos passos</p>
        </div>

        {isLoading && <p className={styles.loading}>Carregando...</p>}

        <div className={styles.unitGrid}>
          {units.map(u => (
            <div key={u._id} className={styles.unitCard} onClick={() => navigate(`/book/${u._id}`)}>
              <div className={styles.unitCardTop}>
                <h2 className={styles.unitName}>{u.name}</h2>
                <div className={styles.unitBadge}>Agendar</div>
              </div>
              <p className={styles.unitAddress}>{u.address}</p>
              {u.phone && <p className={styles.unitPhone}>{u.phone}</p>}
              <div className={styles.unitFooter}>
                <span className={styles.unitCta}>
                  Reservar horário
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
