import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './EmployeeForm.module.scss';

interface ServiceOption { _id: string; name: string; type?: string; }

type DaySlot = { start: string; end: string };
type DaySchedule = { day: number; slots: DaySlot[] };

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  passwordPlain?: string;
  avatar?: string;
  daySchedules?: DaySchedule[];
  vacations?: { start: string; end: string }[];
  blockedDays?: string[];
  isActive: boolean;
  allowOnlineBooking?: boolean;
  unitId?: string;
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
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [avatar, setAvatar] = useState(employee?.avatar ?? '');
  const [role, setRole] = useState(employee?.role ?? 'employee');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>(() => {
    if (employee?.daySchedules?.length) return employee.daySchedules;
    return [1, 2, 3, 4, 5].map(day => ({ day, slots: [{ start: '08:00', end: '18:00' }] }));
  });
  
  const [vacationStart, setVacationStart] = useState(employee?.vacations?.[0]?.start ?? '');
  const [vacationEnd, setVacationEnd] = useState(employee?.vacations?.[0]?.end ?? '');
  
  const [blockedDays, setBlockedDays] = useState<string[]>(employee?.blockedDays ?? []);
  const [allowOnlineBooking, setAllowOnlineBooking] = useState<boolean>(employee?.allowOnlineBooking ?? true);
  const [newBlockedDay, setNewBlockedDay] = useState('');
  const [initialVale, setInitialVale] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>(
    (employee as any)?.serviceIds?.map((id: any) => typeof id === 'object' ? id._id : id) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/employees/${employee!._id}`, payload)
        : api.post('/employees', payload),
    onSuccess,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Erro ao salvar funcionário.');
    },
  });

  const adminUnitId = '69fa463aa078044937f7024e';
  const { data: availableServices = [] } = useQuery<ServiceOption[]>({
    queryKey: ['services-for-form', adminUnitId],
    queryFn: async () => {
      const { data } = await api.get(`/services?unitId=${adminUnitId}`);
      return (Array.isArray(data) ? data : data.services ?? []).filter((s: ServiceOption) => s.type !== 'package');
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  function addBlockedDay() {
    if (newBlockedDay && !blockedDays.includes(newBlockedDay)) {
      setBlockedDays([...blockedDays, newBlockedDay].sort());
      setNewBlockedDay('');
    }
  }

  function removeBlockedDay(day: string) {
    setBlockedDays(blockedDays.filter(d => d !== day));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const finalEmail = email || `${name.replace(/\s+/g, '').toLowerCase()}@barbeariadodelio`;
    
    const vacations = (vacationStart && vacationEnd) ? [{ start: vacationStart, end: vacationEnd }] : [];

    const finalBlockedDays = [...blockedDays];
    if (newBlockedDay && !finalBlockedDays.includes(newBlockedDay)) {
      finalBlockedDays.push(newBlockedDay);
    }

    const payload: Record<string, unknown> = {
      name,
      email: finalEmail,
      phone: phone.replace(/\D/g, ''),
      role: 'employee',
      avatar,
      daySchedules,
      vacations,
      blockedDays: finalBlockedDays.sort(),
      allowOnlineBooking,
      unitId: '69fa463aa078044937f7024e',
      allowedApps: ['69fa463aa078044937f7024e'],
      serviceIds,
    };
    if (password) payload.password = password;

    mutation.mutate(payload, {
      onSuccess: async (res) => {
        const emp = (res as { data: Record<string, unknown> }).data;
        const empId = (emp?._id || (emp?.employee as Record<string, unknown>)?._id) as string | undefined;
        if (!isEdit && initialVale && empId) {
          try {
            await api.post('/finance/transactions', {
              type: 'expense',
              category: 'voucher',
              amount: parseFloat(initialVale.replace(',', '.')),
              description: `Vale Inicial (na criação)`,
              date: new Date().toISOString().split('T')[0],
              employeeId: empId,
              unitId: emp?.unitId || (emp?.employee as Record<string, unknown>)?.unitId
            });
          } catch (e) {
            console.error('Falha ao registrar vale inicial:', e);
          }
        }
        if (!isEdit && emp?.passwordPlain) {
          setCreatedCredentials({ email: emp.email as string, password: emp.passwordPlain as string });
        } else {
          onSuccess();
        }
      }
    });
  }

  if (createdCredentials) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal} style={{ maxWidth: '420px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
          <h2 className={styles.modalTitle} style={{ marginBottom: '0.5rem' }}>Funcionário Criado!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Compartilhe as credenciais abaixo com o funcionário para que ele possa acessar o sistema.
          </p>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '1rem', textAlign: 'left', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login (Email)</p>
              <p style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{createdCredentials.email}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Senha</p>
              <p style={{ fontFamily: 'monospace', fontSize: '1.25rem', color: 'var(--text-primary)', letterSpacing: '0.15em', fontWeight: 700 }}>{createdCredentials.password}</p>
            </div>
          </div>
          <button
            className={styles.submitBtn}
            onClick={onSuccess}
            style={{ width: '100%' }}
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
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

          <div className={styles.schedGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Nome *</label>
              <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input type="email" className={styles.input} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
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

          <div className={styles.field}>
            <label className={styles.label}>Horários por Dia</label>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {DAY_LABELS.map((lbl, idx) => {
                const active = daySchedules.some(ds => ds.day === idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDaySchedules(prev => {
                      if (active) return prev.filter(ds => ds.day !== idx);
                      return [...prev, { day: idx, slots: [{ start: '08:00', end: '18:00' }] }].sort((a, b) => a.day - b.day);
                    })}
                    style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '20px',
                      border: `1px solid ${active ? 'var(--gold)' : 'var(--border-default)'}`,
                      background: active ? 'var(--gold)' : 'transparent',
                      color: active ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>

            {[...daySchedules].sort((a, b) => a.day - b.day).map(({ day, slots }) => (
              <div key={day} style={{ marginBottom: '0.625rem', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.625rem 0.75rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{DAY_NAMES[day]}</p>
                {slots.map((slot, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: idx < slots.length - 1 ? '0.4rem' : 0 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '20px', flexShrink: 0 }}>De</span>
                    <input
                      type="time"
                      className={styles.input}
                      value={slot.start}
                      onChange={e => setDaySchedules(prev => prev.map(ds => ds.day === day ? { ...ds, slots: ds.slots.map((s, i) => i === idx ? { ...s, start: e.target.value } : s) } : ds))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '24px', flexShrink: 0 }}>Até</span>
                    <input
                      type="time"
                      className={styles.input}
                      value={slot.end}
                      onChange={e => setDaySchedules(prev => prev.map(ds => ds.day === day ? { ...ds, slots: ds.slots.map((s, i) => i === idx ? { ...s, end: e.target.value } : s) } : ds))}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => setDaySchedules(prev => prev.map(ds => ds.day === day ? { ...ds, slots: ds.slots.filter((_, i) => i !== idx) } : ds).filter(ds => ds.slots.length > 0))}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '0 0.25rem', fontSize: '1rem', flexShrink: 0 }}
                    >🗑</button>
                    {idx === slots.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setDaySchedules(prev => prev.map(ds => ds.day === day ? { ...ds, slots: [...ds.slots, { start: '08:00', end: '18:00' }] } : ds))}
                        style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#111827', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, flexShrink: 0 }}
                      >+</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <hr style={{ borderColor: 'var(--border-subtle)', margin: '0.5rem 0' }} />

          <div className={styles.schedGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Início Férias</label>
              <input type="date" className={styles.input} value={vacationStart} onChange={e => setVacationStart(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fim Férias</label>
              <input type="date" className={styles.input} value={vacationEnd} onChange={e => setVacationEnd(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Bloqueios Específicos (Dias inativos)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="date" 
                className={styles.input} 
                value={newBlockedDay} 
                onChange={e => setNewBlockedDay(e.target.value)} 
              />
              <button 
                type="button" 
                onClick={addBlockedDay}
                style={{ padding: '0 1rem', background: 'var(--gold)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                +
              </button>
            </div>
            {blockedDays.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {blockedDays.map(day => (
                  <div key={day} style={{ background: '#374151', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#E5E7EB', fontWeight: 500 }}>
                    <span>{day.split('-').reverse().join('/')}</span>
                    <button type="button" onClick={() => removeBlockedDay(day)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '1rem' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isEdit && (
            <div className={styles.field} style={{ marginTop: '1rem' }}>
              <label className={styles.label}>Vale Inicial (Opcional)</label>
              <div className={styles.currencyWrap} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px', paddingLeft: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>R$</span>
                <input 
                  type="text" 
                  className={styles.input} 
                  style={{ border: 'none', background: 'transparent' }}
                  placeholder="0,00" 
                  value={initialVale} 
                  onChange={e => setInitialVale(e.target.value.replace(/[^\d,]/g, ''))} 
                />
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Este valor será descontado automaticamente do primeiro salário.</p>
            </div>
          )}

          {availableServices.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Serviços que realiza</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: '0.5rem' }}>
                Deixe em branco para habilitar todos os serviços.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {availableServices.map(svc => (
                  <label key={svc._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(svc._id)}
                      onChange={e => {
                        setServiceIds(prev =>
                          e.target.checked ? [...prev, svc._id] : prev.filter(id => id !== svc._id)
                        );
                      }}
                      style={{ width: 15, height: 15, accentColor: 'var(--gold)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{svc.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className={styles.field} style={{ marginTop: '0.5rem' }}>
            <label className={styles.label}>Disponível para agendamentos online</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={allowOnlineBooking} onChange={e => setAllowOnlineBooking(e.target.checked)} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {allowOnlineBooking ? 'Sim — aparecerá na página de agendamento público' : 'Não — não aparecerá no agendamento público'}
              </span>
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border-subtle)', margin: '0.5rem 0' }} />

          <div className={styles.field}>
            <label className={styles.label}>
              {isEdit ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha (opcional — gerada automaticamente se vazia)'}
            </label>
            <div className={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                value={password || (isEdit ? employee?.passwordPlain || '' : '')}
                onChange={e => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Deixe vazio para gerar automaticamente'}
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
