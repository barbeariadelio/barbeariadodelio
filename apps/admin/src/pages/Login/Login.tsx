import { FormEvent, useState, useEffect } from 'react';
import { useLogin } from '../../hooks/useLogin';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Login.module.scss';
import logo from '../../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { login, loading, error } = useLogin();
  const { updateTheme } = useTheme();

  useEffect(() => {
    updateTheme('light');
  }, [updateTheme]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login({ identifier: email, password, appId: 'admin' });
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logo} alt="Barbearia Délio" className={styles.logoImg} />
        </div>
        <p className={styles.subtitle}>Painel Administrativo</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>E-mail ou Telefone</label>
            <input
              id="email"
              type="text"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com ou (00) 00000-0000"
              required
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Senha</label>
            <div className={styles.pwWrap}>
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button type="button" className={styles.pwToggle} onClick={() => setShowPw(v => !v)} tabIndex={-1} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPw
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
