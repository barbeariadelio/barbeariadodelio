import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import styles from './Settings.module.scss';

interface Unit {
  _id: string;
  name: string;
  address: string;
  phone: string;
  cnpj?: string;
  workingDays?: number[];
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
  slotInterval?: number;
}

type Tab = 'profile' | 'unit';

const WEEK_DAYS = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

export default function Settings() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '');
  const [profilePhone, setProfilePhone] = useState((user as unknown as { phone?: string })?.phone ?? '');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [unitName, setUnitName] = useState('');
  const [unitAddress, setUnitAddress] = useState('');
  const [unitPhone, setUnitPhone] = useState('');
  const [unitCnpj, setUnitCnpj] = useState('');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [whStart, setWhStart] = useState('08:00');
  const [whEnd, setWhEnd] = useState('20:00');
  const [whLunchStart, setWhLunchStart] = useState('');
  const [whLunchEnd, setWhLunchEnd] = useState('');
  const [slotInterval, setSlotInterval] = useState<number>(0);
  const [unitSuccess, setUnitSuccess] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  const unitId = import.meta.env.VITE_UNIT_ID || (user as unknown as { unitId?: string })?.unitId;

  const { data: unit } = useQuery<Unit>({
    queryKey: ['unit', unitId],
    queryFn: async () => {
      const { data } = await api.get(`/units/${unitId}`);
      return data as Unit;
    },
    enabled: !!unitId,
  });

  useEffect(() => {
    if (unit) {
      setUnitName(unit.name);
      setUnitAddress(unit.address);
      setUnitPhone(unit.phone);
      setUnitCnpj(unit.cnpj ?? '');
      setWorkingDays(unit.workingDays ?? [1, 2, 3, 4, 5, 6]);
      setWhStart(unit.workingHours?.start ?? '08:00');
      setWhEnd(unit.workingHours?.end ?? '20:00');
      setWhLunchStart(unit.workingHours?.lunchStart ?? '');
      setWhLunchEnd(unit.workingHours?.lunchEnd ?? '');
      setSlotInterval(unit.slotInterval ?? 0);
    }
  }, [unit]);

  const profileMutation = useMutation({
    mutationFn: (payload: object) => api.patch('/auth/me', payload),
    onSuccess: ({ data }: { data: object }) => {
      setUser({ ...user!, ...(data as object) } as typeof user extends null ? never : typeof user);
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      setProfileError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    },
  });

  const unitMutation = useMutation({
    mutationFn: (payload: object) => api.patch(`/units/${unit!._id}`, payload),
    onSuccess: () => {
      setUnitSuccess(true);
      setUnitError(null);
      setTimeout(() => setUnitSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      setUnitError(err instanceof Error ? err.message : 'Erro ao salvar dados da barbearia.');
    },
  });

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    profileMutation.mutate({ name: profileName, email: profileEmail, phone: profilePhone });
  }

  function handleUnitSubmit(e: FormEvent) {
    e.preventDefault();
    unitMutation.mutate({
      name: unitName,
      address: unitAddress,
      phone: unitPhone,
      cnpj: unitCnpj,
      workingDays,
      workingHours: {
        start: whStart,
        end: whEnd,
        lunchStart: whLunchStart || undefined,
        lunchEnd: whLunchEnd || undefined,
      },
      slotInterval,
    });
  }

  function toggleDay(day: number) {
    setWorkingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>CONFIGURAÇÕES</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'profile' ? styles.active : ''}`}
          onClick={() => setTab('profile')}
        >
          Meu Perfil
        </button>
        <button
          className={`${styles.tab} ${tab === 'unit' ? styles.active : ''}`}
          onClick={() => setTab('unit')}
        >
          Barbearia
        </button>
      </div>

      {tab === 'profile' && (
        <div className={styles.section}>
          <form onSubmit={handleProfileSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Nome *</label>
              <input className={styles.input} value={profileName} onChange={e => setProfileName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>E-mail *</label>
              <input type="email" className={styles.input} value={profileEmail} onChange={e => setProfileEmail(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Telefone</label>
              <input className={styles.input} value={profilePhone} onChange={e => setProfilePhone(e.target.value)} placeholder="(19) 9XXXX-XXXX" />
            </div>
            {profileSuccess && <p className={styles.success}>Perfil atualizado com sucesso!</p>}
            {profileError && <p className={styles.error}>{profileError}</p>}
            <button type="submit" className={styles.saveBtn} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </form>
        </div>
      )}

      {tab === 'unit' && (
        <div className={styles.section}>
          <form onSubmit={handleUnitSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Nome da Barbearia *</label>
              <input className={styles.input} value={unitName} onChange={e => setUnitName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Endereço *</label>
              <input className={styles.input} value={unitAddress} onChange={e => setUnitAddress(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Telefone *</label>
              <input className={styles.input} value={unitPhone} onChange={e => setUnitPhone(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>CNPJ</label>
              <input className={styles.input} value={unitCnpj} onChange={e => setUnitCnpj(e.target.value)} placeholder="XX.XXX.XXX/XXXX-XX" />
            </div>

            {/* ── Working Days ── */}
            <div className={styles.field}>
              <label className={styles.label}>Dias de Funcionamento</label>
              <div className={styles.dayPicker}>
                {WEEK_DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    className={`${styles.dayBtn} ${workingDays.includes(d.value) ? styles.dayBtnActive : ''}`}
                    onClick={() => toggleDay(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Working Hours ── */}
            <div className={styles.field}>
              <label className={styles.label}>Horário de Funcionamento</label>
              <div className={styles.timeRow}>
                <div className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Abertura</span>
                  <input type="time" className={styles.timeInput} value={whStart} onChange={e => setWhStart(e.target.value)} />
                </div>
                <span className={styles.timeSep}>até</span>
                <div className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Fechamento</span>
                  <input type="time" className={styles.timeInput} value={whEnd} onChange={e => setWhEnd(e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Lunch Break ── */}
            <div className={styles.field}>
              <label className={styles.label}>Intervalo de Almoço <span className={styles.optional}>(opcional)</span></label>
              <div className={styles.timeRow}>
                <div className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Início</span>
                  <input type="time" className={styles.timeInput} value={whLunchStart} onChange={e => setWhLunchStart(e.target.value)} />
                </div>
                <span className={styles.timeSep}>até</span>
                <div className={styles.timeField}>
                  <span className={styles.timeFieldLabel}>Fim</span>
                  <input type="time" className={styles.timeInput} value={whLunchEnd} onChange={e => setWhLunchEnd(e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Slot Interval ── */}
            <div className={styles.field}>
              <label className={styles.label}>Intervalo entre agendamentos</label>
              <select 
                className={styles.input} 
                value={slotInterval} 
                onChange={e => setSlotInterval(Number(e.target.value))}
              >
                <option value={0}>Nenhum intervalo</option>
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </div>

            {unitSuccess && <p className={styles.success}>Dados salvos com sucesso!</p>}
            {unitError && <p className={styles.error}>{unitError}</p>}
            <button type="submit" className={styles.saveBtn} disabled={unitMutation.isPending || !unit}>
              {unitMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
