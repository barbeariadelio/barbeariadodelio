import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Login.module.scss';
import logo from '../../assets/logo.png';

export default function Login() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  function handlePhoneChange(val: string) {
    const numeric = val.replace(/\D/g, '');
    if (numeric.length > 0 && /^\d/.test(val.trim())) {
      let masked = numeric;
      if (numeric.length > 2) masked = `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
      if (numeric.length > 7) masked = `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7, 11)}`;
      setPhone(masked);
    } else {
      setPhone(val);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Por favor, informe seu nome completo.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Por favor, informe um telefone válido.');
      return;
    }

    setLoading(true); 
    setError(null);
    
    try {
      // Use the new booking-login endpoint which only requires name and phone
      const { data: userAccount } = await api.post('/auth/booking-login', { 
        name: name.trim(), 
        phone: phone.replace(/\D/g, '') 
      });
      
      setUser(userAccount);
      navigate(-1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ocorreu um erro ao entrar. Tente novamente.');
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
        
        <h1 className={styles.title}>Acesse sua conta</h1>
        <p className={styles.subtitle}>Informe seu nome e telefone para continuar</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Nome Completo *</label>
            <input 
              type="text" 
              className={styles.input} 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
              autoComplete="name"
              placeholder="Digite seu nome"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telefone *</label>
            <input 
              type="text" 
              className={styles.input} 
              value={phone} 
              onChange={e => handlePhoneChange(e.target.value)} 
              required 
              autoComplete="tel"
              placeholder="(00) 00000-0000"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}
          
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Aguarde...' : 'Entrar'}
          </button>
        </form>
        
        <button className={styles.backBtn} onClick={() => navigate('/')}>← Voltar ao início</button>
      </div>
    </div>
  );
}
