import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, storageKeys, getSelectedUnitId } from '../../api/client';
import styles from './Login.module.scss';
import logo from '../../assets/logo.png';

function maskPhone(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Login() {
  const [loginMode, setLoginMode] = useState<'phone' | 'email'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  function handleIdentifierChange(val: string) {
    if (loginMode === 'phone') {
      setIdentifier(maskPhone(val));
    } else {
      setIdentifier(val);
    }
  }

  function switchMode(mode: 'phone' | 'email') {
    setLoginMode(mode);
    setIdentifier('');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const raw = loginMode === 'phone' ? identifier.replace(/\D/g, '') : identifier.trim();
      const unitId = getSelectedUnitId() || '69fa463aa078044937f70250';
      const { data: auth } = await api.post('/auth/login', {
        identifier: raw,
        password,
        appId: unitId,
      });
      localStorage.setItem(storageKeys.accessToken, auth.accessToken);
      localStorage.setItem(storageKeys.refreshToken, auth.refreshToken);
      const me = auth.user || (await api.get('/auth/me')).data;

      if (me.role === 'client') {
        localStorage.removeItem(storageKeys.accessToken);
        localStorage.removeItem(storageKeys.refreshToken);
        setError('Acesso restrito. Use o aplicativo de agendamento.');
        return;
      }

      setUser(me);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src={logo} alt="Barbearia Délio" className={styles.logoImg} />
        </div>
        <p className={styles.sub}>Unidade Nova Veneza</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={`${styles.modeBtn} ${loginMode === 'phone' ? styles.modeBtnActive : ''}`}
                onClick={() => switchMode('phone')}
              >
                Telefone
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${loginMode === 'email' ? styles.modeBtnActive : ''}`}
                onClick={() => switchMode('email')}
              >
                E-mail
              </button>
            </div>
            <input
              key={loginMode}
              type={loginMode === 'phone' ? 'tel' : 'email'}
              className={styles.input}
              value={identifier}
              onChange={e => handleIdentifierChange(e.target.value)}
              placeholder={loginMode === 'phone' ? '(00) 00000-0000' : 'exemplo@email.com'}
              required
              autoComplete={loginMode === 'phone' ? 'tel' : 'email'}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Senha</label>
            <div className={styles.pwWrap}>
              <input
                type={showPw ? 'text' : 'password'}
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button type="button" className={styles.pwToggle} onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
