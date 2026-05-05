import { FormEvent, useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { api, resolveApiBaseUrl } from '../../api/client';
import styles from './AppointmentForm.module.scss';

interface Unit { _id: string; name: string; apiUrl?: string; }
interface Employee { _id: string; name: string; }
interface Client { _id: string; name: string; phone?: string; }
interface Service { _id: string; name: string; durationMinutes: number; price: number; }

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

export default function AppointmentForm({ onClose, onSuccess, initialDate }: Props) {
  const [unitId, setUnitId] = useState(import.meta.env.VITE_UNIT_ID || '');
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [startTime, setStartTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clientBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setShowClientList(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: () => api.get('/units').then(r => Array.isArray(r.data) ? r.data : r.data?.units ?? []),
  });

  const selectedUnit = units.find(u => u._id === unitId);

  const unitApi = useMemo(() => {
    const base = resolveApiBaseUrl(selectedUnit?.apiUrl);
    const instance = axios.create({ baseURL: base });
    instance.interceptors.request.use(config => {
      const token = localStorage.getItem('accessToken');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    instance.interceptors.response.use(res => {
      if (res.data && typeof res.data === 'object' && 'data' in res.data) res.data = res.data.data;
      return res;
    });
    return instance;
  }, [selectedUnit?.apiUrl]);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees', unitId],
    queryFn: () => unitApi.get(`/employees${unitId ? `?unitId=${unitId}` : ''}`).then(r => Array.isArray(r.data) ? r.data : r.data?.employees ?? []),
    enabled: !!unitId,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', unitId],
    queryFn: () => unitApi.get(`/clients${unitId ? `?unitId=${unitId}` : ''}`).then(r => Array.isArray(r.data) ? r.data : r.data?.clients ?? []),
    enabled: !!unitId,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['services', unitId],
    queryFn: () => unitApi.get(`/services${unitId ? `?unitId=${unitId}` : ''}`).then(r => Array.isArray(r.data) ? r.data : r.data?.services ?? []),
    enabled: !!unitId,
  });

  const filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase().trim()))
    : clients;

  const selectedClient = clients.find(c => c._id === clientId);

  function selectClient(c: Client) {
    setClientId(c._id);
    setClientSearch('');
    setShowClientList(false);
  }

  function clearClient() {
    setClientId('');
    setClientSearch('');
  }

  const mutation = useMutation({
    mutationFn: (payload: object) => unitApi.post('/appointments', payload),
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao criar agendamento.');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unitId || !clientId || !employeeId || !serviceId) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    const service = services.find(s => s._id === serviceId);
    mutation.mutate({ unitId, clientId, employeeId, serviceId, date, startTime, notes, price: service?.price ?? 0 });
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo Agendamento</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Unidade *</label>
            <select className={styles.select} value={unitId} onChange={e => {
              setUnitId(e.target.value);
              setClientId(''); setEmployeeId(''); setServiceId('');
            }} required>
              <option value="">Selecione uma unidade</option>
              {units.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>

          {/* ── Client search ── */}
          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Cliente *</label>
            <div className={styles.clientBox} ref={clientBoxRef}>
              {selectedClient ? (
                <div className={styles.clientSelected}>
                  <div className={styles.clientSelectedInfo}>
                    <span className={styles.clientSelectedName}>{selectedClient.name}</span>
                    {selectedClient.phone && (
                      <span className={styles.clientSelectedPhone}>{selectedClient.phone}</span>
                    )}
                  </div>
                  <button type="button" className={styles.clientClearBtn} onClick={clearClient}>
                    <IconX />
                  </button>
                </div>
              ) : (
                <div className={styles.clientSearchWrap}>
                  <span className={styles.clientSearchIcon}><IconSearch /></span>
                  <input
                    type="text"
                    className={styles.clientSearchInput}
                    placeholder="Buscar cliente pelo nome..."
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                    onFocus={() => setShowClientList(true)}
                    autoComplete="off"
                  />
                </div>
              )}

              {showClientList && !selectedClient && (
                <div className={styles.clientDropdown}>
                  {filteredClients.length === 0 ? (
                    <div className={styles.clientDropdownEmpty}>Nenhum cliente encontrado</div>
                  ) : (
                    filteredClients.slice(0, 8).map(c => (
                      <button
                        key={c._id}
                        type="button"
                        className={styles.clientOption}
                        onMouseDown={() => selectClient(c)}
                      >
                        <span className={styles.clientOptionInitial}>{c.name[0].toUpperCase()}</span>
                        <div className={styles.clientOptionInfo}>
                          <span className={styles.clientOptionName}>{c.name}</span>
                          {c.phone && <span className={styles.clientOptionPhone}>{c.phone}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Barbeiro *</label>
            <select className={styles.select} value={employeeId} onChange={e => setEmployeeId(e.target.value)} required>
              <option value="">Selecione um barbeiro</option>
              {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name}</option>)}
            </select>
          </div>

          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Serviço *</label>
            <select className={styles.select} value={serviceId} onChange={e => setServiceId(e.target.value)} required>
              <option value="">Selecione um serviço</option>
              {services.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.price)} ({s.durationMinutes}min)
                </option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Data *</label>
              <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Horário *</label>
              <input type="time" className={styles.input} value={startTime} onChange={e => setStartTime(e.target.value)} required />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Observações</label>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
