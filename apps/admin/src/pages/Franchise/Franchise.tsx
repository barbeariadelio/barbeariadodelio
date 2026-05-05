import { useState, useEffect, useCallback } from 'react';
import styles from './Franchise.module.scss';

export default function Franchise() {
  const [online, setOnline] = useState<boolean | null>(null);
  const franchiseUrl = "/franchise-app";

  const checkStatus = useCallback(async () => {
    try {
      // Usando no-cors pois é apenas um health check simples
      await fetch(franchiseUrl, { mode: 'no-cors' });
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Unidade Nova Veneza</h1>
          <p className={styles.subtitle}>Acesso centralizado para franqueadores e gestão de unidades</p>
        </div>
      </header>

      <div className={styles.centeredContent}>
        <div className={`${styles.portalCard} ${styles.portalAmber}`}>
          <div className={styles.portalTop}>
            <div className={styles.portalIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div className={styles.portalLabel}>Unidade Nova Veneza</div>
              <div className={styles.portalSub}>Sistema de Gestão de Rede</div>
            </div>
            <div className={styles.portalStatus}>
              <span className={`${styles.statusDot} ${online === true ? styles.statusOnline : online === false ? styles.statusOffline : ''}`} />
              <span className={styles.statusLabel}>
                {online === null ? 'Verificando...' : online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div className={styles.portalFooter}>
            <a href={franchiseUrl} target="_blank" rel="noopener noreferrer" className={styles.mainAccessBtn}>
              Entrar no Sistema
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
