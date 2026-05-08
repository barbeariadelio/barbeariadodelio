import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import styles from './GuestBook.module.scss';
import logo from '../../assets/logo.png';

interface Unit { _id: string; name: string; address: string; phone: string; }

export default function GuestBook() {
  const navigate = useNavigate();

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ['public-units'],
    queryFn: async () => {
      const { data } = await api.get('/units/public');
      return Array.isArray(data) ? data : data.units ?? [];
    },
  });

  return (
    <div className={styles.page}>
      {/* Decorative top line */}
      <div className={styles.topLine} />

      <header className={styles.header}>
        <button className={styles.logoBtn} onClick={() => navigate('/')}>
          <img src={logo} alt="Barbearia Délio" className={styles.logoImg} />
        </button>

        <button className={styles.profileLink} onClick={() => navigate('/profile')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Meus agendamentos</span>
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>
            Agende sem criar conta
          </h1>
          <p className={styles.sub}>
            Reserve seu horário em poucos passos. Só precisamos do seu nome e telefone.
          </p>
        </div>



        <div className={styles.divider}>
          <span>Escolha a unidade</span>
        </div>

        {isLoading && <p className={styles.loading}>Carregando...</p>}

        <div className={styles.unitGrid}>
          {units.map(u => (
            <button
              key={u._id}
              className={styles.unitCard}
              onClick={() => navigate(`/book/${u._id}`)}
            >
              <div className={styles.unitCardInner}>
                <div className={styles.unitIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div className={styles.unitInfo}>
                  <span className={styles.unitName}>{u.name}</span>
                  <span className={styles.unitAddress}>{u.address}</span>
                  {u.phone && <span className={styles.unitPhone}>{u.phone}</span>}
                </div>
                <div className={styles.unitArrow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
