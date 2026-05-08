import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Login.module.scss';
import logo from '../../assets/logo.png';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === 'register') {
        await api.post('/clients/register', { name, email, phone, password });
      }
      const { data: auth } = await api.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', auth.accessToken);
      localStorage.setItem('refreshToken', auth.refreshToken);
      const { data: me } = await api.get('/auth/me');
      setUser(me);
      navigate(-1);
    } catch {
      setError(mode === 'login' ? 'E-mail ou senha inválidos.' : 'Erro ao criar conta. Tente novamente.');
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
        <div className={styles.modeTabs}>
          <button className={`${styles.modeTab} ${mode === 'login' ? styles.active : ''}`} onClick={() => setMode('login')}>Entrar</button>
          <button className={`${styles.modeTab} ${mode === 'register' ? styles.active : ''}`} onClick={() => setMode('register')}>Criar Conta</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'register' && (
            <>
              <div className={styles.field}><label className={styles.label}>Nome *</label><input className={styles.input} value={name} onChange={e => setName(e.target.value)} required /></div>
              <div className={styles.field}><label className={styles.label}>Telefone</label><input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(19) 9XXXX-XXXX" /></div>
            </>
          )}
          <div className={styles.field}><label className={styles.label}>E-mail *</label><input type="email" className={styles.input} value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className={styles.field}>
            <label className={styles.label}>Senha *</label>
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
          <button type="submit" className={styles.btn} disabled={loading}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar Conta'}</button>
        </form>
        <button className={styles.backBtn} onClick={() => navigate('/')}>← Voltar ao início</button>
      </div>
    </div>
  );
}
