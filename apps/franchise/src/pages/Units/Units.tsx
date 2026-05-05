import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './Units.module.scss';

interface Unit {
  _id: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  city?: string;
  state?: string;
}

export default function Units() {
  // In franchise app, we might only see the current unit or all units of the franchise
  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ['franchise-units'],
    queryFn: async () => {
      const { data } = await api.get('/franchise/units');
      return Array.isArray(data) ? data : data.units ?? [];
    },
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Minhas Unidades</h1>
        <p className={styles.subtitle}>Gestão e monitoramento de unidades da franquia</p>
      </header>

      {isLoading && <p className={styles.empty}>Sincronizando dados...</p>}
      {!isLoading && units.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.empty}>Nenhuma unidade vinculada encontrada.</p>
        </div>
      )}

      <div className={styles.grid}>
        {units.map(unit => (
          <div key={unit._id} className={`${styles.unitCard} ${!unit.isActive ? styles.inactive : ''}`}>
            <div className={styles.unitHeader}>
              <div className={styles.statusWrap}>
                <div className={`${styles.statusDot} ${unit.isActive ? styles.active : ''}`} />
                <span className={styles.statusText}>{unit.isActive ? 'Operacional' : 'Inativa'}</span>
              </div>
              <span className={styles.unitCode}>#{unit._id.slice(-4).toUpperCase()}</span>
            </div>

            <div className={styles.unitBody}>
              <h2 className={styles.unitName}>{unit.name}</h2>
              <div className={styles.locationWrap}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{unit.address}</span>
              </div>
              <div className={styles.contactWrap}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>{unit.phone}</span>
              </div>
            </div>

            <div className={styles.unitFooter}>
              <button className={styles.enterBtn}>
                Ver Dashboard Detalhado
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
