import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './EmployeeForm.module.scss';

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  passwordPlain?: string;
  avatar?: string;
  workSchedule?: {
    start: string;
    end: string;
    lunchStart?: string;
    lunchEnd?: string;
  };
  isActive: boolean;
}

function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

interface Props {
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmployeeForm({ employee, onClose, onSuccess }: Props) {
  const isEdit = !!employee;
  const [name, setName] = useState(employee?.name ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [avatar, setAvatar] = useState(employee?.avatar ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [schedStart, setSchedStart] = useState(employee?.workSchedule?.start ?? '08:00');
  const [schedEnd, setSchedEnd] = useState(employee?.workSchedule?.end ?? '18:00');
  const [lunchStart, setLunchStart] = useState(employee?.workSchedule?.lunchStart ?? '');
  const [lunchEnd, setLunchEnd] = useState(employee?.workSchedule?.lunchEnd ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/employees/${employee!._id}`, payload)
        : api.post('/employees', payload),
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao salvar funcionário.');
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const fakeEmail = employee?.email || `${name.replace(/\s+/g, '').toLowerCase()}_${Date.now()}@delio.staff`;
    
    const payload: any = {
      name,
      email: fakeEmail,
      phone,
      role: 'employee',
      avatar,
      workSchedule: {
        start: schedStart,
        end: schedEnd,
        lunchStart: lunchStart || undefined,
        lunchEnd: lunchEnd || undefined,
      }
    };
    if (!isEdit || password) payload.password = password;
    mutation.mutate(payload);
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {isEdit ? 'EDITAR FUNCIONÁRIO' : 'NOVO FUNCIONÁRIO'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.avatarSection}>
            <div className={styles.avatarPreview}>
              {avatar ? (
                <img src={avatar} alt="Preview" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {name ? name[0].toUpperCase() : '?'}
                </div>
              )}
              <label className={styles.avatarLabel}>
                <input type="file" accept="image/*" onChange={handleFile} hidden />
                <span>Mudar Foto</span>
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telefone</label>
            <input 
              className={styles.input} 
              value={phone} 
              onChange={e => setPhone(maskPhone(e.target.value))} 
              placeholder="(19) 9XXXX-XXXX" 
            />
          </div>

          <div className={styles.schedGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Início Trabalho</label>
              <input type="time" className={styles.input} value={schedStart} onChange={e => setSchedStart(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fim Trabalho</label>
              <input type="time" className={styles.input} value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
            </div>
          </div>

          <div className={styles.schedGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Início Almoço</label>
              <input type="time" className={styles.input} value={lunchStart} onChange={e => setLunchStart(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fim Almoço</label>
              <input type="time" className={styles.input} value={lunchEnd} onChange={e => setLunchEnd(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{isEdit ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha *'}</label>
            <div className={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                value={password || (isEdit ? employee?.passwordPlain || '' : '')}
                onChange={e => setPassword(e.target.value)}
                required={!isEdit}
                placeholder="••••••••"
              />
              <button 
                type="button" 
                className={styles.eyeBtn} 
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Esconder senha' : 'Ver senha'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Funcionário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
