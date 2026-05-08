import { FormEvent, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../api/client';
import styles from './Login.module.scss';
import logo from '../../assets/logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const { setUser } = useAuth();
  const { updateTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    updateTheme('light');
  }, [updateTheme]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const { data: auth } = await api.post('/auth/login', { email, password, appId: 'franchise' });
      localStorage.setItem('accessToken', auth.accessToken);
      localStorage.setItem('refreshToken', auth.refreshToken);
      const { data: me } = await api.get('/auth/me');
      
      if (me.role === 'client') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setError('Acesso restrito. Use o aplicativo de agendamento.');
        return;
      }

      setUser(me);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'E-mail ou senha inválidos.');
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
          <div className={styles.field}><label className={styles.label}>E-mail</label><input type="email" className={styles.input} value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className={styles.field}>
            <label className={styles.label}>Senha</label>
            <div className={styles.pwWrap}>
              <input type={showPw ? 'text' : 'password'} className={styles.input} value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="button" className={styles.pwToggle} onClick={() => setShowPw(v => !v)} tabIndex={-1} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPw
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
}
