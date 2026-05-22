import { FormEvent, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, resolveApiBaseUrl, getStoredAccessToken } from '../../api/client';
import styles from './AppointmentForm.module.scss';

function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

interface Unit { _id: string; name: string; apiUrl?: string; }
interface Employee { _id: string; name: string; serviceIds?: string[]; }
interface Client {
  _id: string;
  name: string;
  phone?: string;
  packages?: {
    packageId: string;
    active: boolean;
    itemLimits?: { serviceId: string; quantity: number }[];
  }[];
}
interface Service { 
  _id: string; 
  name: string; 
  durationMinutes: number; 
  price: number; 
  type: 'single' | 'package';
  packageItems?: { serviceId: string; quantity: number }[];
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  initialEmployeeId?: string;
  initialTime?: string;
  appointment?: any;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type RepeatUnit = 'days' | 'weeks' | 'months' | 'years';

function advanceDate(iso: string, interval: number, unit: RepeatUnit, step: number): string {
  const d = new Date(iso + 'T12:00:00');
  if (unit === 'days')   d.setDate(d.getDate() + interval * step);
  if (unit === 'weeks')  d.setDate(d.getDate() + interval * 7 * step);
  if (unit === 'months') d.setMonth(d.getMonth() + interval * step);
  if (unit === 'years')  d.setFullYear(d.getFullYear() + interval * step);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function twoYearsISO(base: string): string {
  const d = new Date(base + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatRepeatPreview(baseDate: string, interval: number, unit: RepeatUnit): string {
  const nextISO = advanceDate(baseDate, interval, unit, 1);
  const d = new Date(nextISO + 'T12:00:00');
  const unitLabel =
    unit === 'days'   ? (interval === 1 ? 'dia' : 'dias')
    : unit === 'weeks'  ? (interval === 1 ? 'semana' : 'semanas')
    : unit === 'months' ? (interval === 1 ? 'mês' : 'meses')
    : (interval === 1 ? 'ano' : 'anos');
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `Repete a cada ${interval} ${unitLabel}. Próxima: ${DAYS_PT[d.getDay()]}, ${dateStr}`;
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

export default function AppointmentForm({ onClose, onSuccess, initialDate, initialEmployeeId, initialTime, appointment }: Props) {
  const qc = useQueryClient();
  const [unitId, setUnitId] = useState(import.meta.env.VITE_UNIT_ID || '');
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? '');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [startTime, setStartTime] = useState(initialTime ?? '09:00');
  const [notes, setNotes] = useState('');
  const [usePackage, setUsePackage] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Repeat
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(7);
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>('days');
  const [repeatEndType, setRepeatEndType] = useState<'never' | 'date'>('never');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [repeatProgress, setRepeatProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const repeatTotal = useMemo(() => {
    if (!repeatEnabled || !date) return 1;
    const endISO = repeatEndType === 'date' && repeatEndDate ? repeatEndDate : twoYearsISO(date);
    let count = 1, step = 1;
    let next = advanceDate(date, repeatInterval, repeatUnit, step);
    while (next <= endISO && step <= 730) { count++; step++; next = advanceDate(date, repeatInterval, repeatUnit, step); }
    return count;
  }, [repeatEnabled, repeatEndType, repeatEndDate, date, repeatInterval, repeatUnit]);

  const clientBoxRef = useRef<HTMLDivElement>(null);

  // Pre-fill if editing
  useEffect(() => {
    if (appointment) {
      setUnitId(appointment.unitId || import.meta.env.VITE_UNIT_ID || '');
      setClientId(appointment.clientId?._id || appointment.clientId || '');
      setEmployeeId(appointment.employeeId?._id || appointment.employeeId || '');
      setServiceId(appointment.serviceId?._id || appointment.serviceId || '');
      setDate(appointment.date);
      setStartTime(appointment.startTime);
      setNotes(appointment.notes || '');
      setUsePackage(!!appointment.isPackage);
    }
  }, [appointment]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setShowClientList(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const envUnitId = (import.meta.env.VITE_UNIT_ID as string | undefined) || '';

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units', envUnitId],
    queryFn: async () => {
      try {
        const r = await api.get('/units');
        const list: Unit[] = Array.isArray(r.data) ? r.data : r.data?.units ?? [];
        if (list.length > 0) return list;
      } catch { /* fallback below */ }
      // Fallback: busca a unidade pela rota pública (sem autenticação)
      if (envUnitId) {
        const r = await api.get(`/units/public/${envUnitId}`);
        const unit = r.data;
        return unit ? [unit] : [];
      }
      return [];
    },
  });

  // Auto-seleciona quando as unidades carregam e unitId ainda está vazio
  useEffect(() => {
    if (units.length === 1 && !unitId) {
      setUnitId(units[0]._id);
    }
  }, [units, unitId]);

  const selectedUnit = units.find(u => u._id === unitId);

  const unitApi = useMemo(() => {
    const base = resolveApiBaseUrl(selectedUnit?.apiUrl);
    const instance = axios.create({ baseURL: base, withCredentials: true });
    instance.interceptors.request.use(config => {
      const token = getStoredAccessToken();
      if (token && token !== 'undefined' && token !== 'null') {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
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

  const selectedEmployee = employees.find(e => e._id === employeeId);
  const visibleServices = selectedEmployee?.serviceIds?.length
    ? services.filter(s => s.type === 'package' || selectedEmployee.serviceIds!.includes(s._id))
    : services;

  const filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase().trim()))
    : clients;

  const selectedClient = clients.find(c => c._id === clientId);

  function selectClient(c: Client) {
    setClientId(c._id);
    setClientSearch('');
    setShowClientList(false);
    setUsePackage(false);
    setSelectedPackageId('');
  }

  function clearClient() {
    setClientId('');
    setClientSearch('');
    setUsePackage(false);
    setSelectedPackageId('');
  }

  const handleQuickRegister = useCallback(async () => {
    if (!quickName.trim()) return;
    setQuickSaving(true);
    try {
      const res = await unitApi.post('/clients', { name: quickName.trim(), phone: quickPhone.replace(/\D/g, '') || undefined, unitId: unitId || undefined });
      const newClient: Client = res.data;
      await qc.invalidateQueries({ queryKey: ['clients', unitId] });
      selectClient(newClient);
      setShowQuickRegister(false);
      setQuickName('');
      setQuickPhone('');
    } catch {
      // silent
    } finally {
      setQuickSaving(false);
    }
  }, [quickName, quickPhone, unitId, unitApi, qc]);

  const mutation = useMutation({
    mutationFn: (payload: object) => {
      if (appointment?._id) {
        return unitApi.patch(`/appointments/${appointment._id}`, payload);
      }
      return unitApi.post('/appointments', payload);
    },
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : `Erro ao ${appointment?._id ? 'atualizar' : 'criar'} agendamento.`);
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unitId || !clientId || !employeeId || !serviceId) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    const service = services.find(s => s._id === serviceId);

    const now = new Date();
    const selectedDateTime = new Date(`${date}T${startTime}`);
    if (selectedDateTime < now) {
      setError('Não é possível agendar em uma data ou hora que já passou.');
      return;
    }

    const buildPayload = (apptDate: string, finalIsPackage: boolean, seriesId?: string) => ({
      unitId, clientId, employeeId, serviceId,
      date: apptDate, startTime, notes,
      price: finalIsPackage ? 0 : (service?.price ?? 0),
      isPackage: finalIsPackage,
      ...(seriesId ? { seriesId } : {}),
    });

    const doCreate = async (finalIsPackage: boolean) => {
      setError(null);
      setIsSubmitting(true);
      try {
        if (!repeatEnabled || appointment?._id) {
          if (appointment?._id) {
            await unitApi.patch(`/appointments/${appointment._id}`, buildPayload(date, finalIsPackage));
          } else {
            await unitApi.post('/appointments', buildPayload(date, finalIsPackage));
          }
          onSuccess();
        } else {
          const dates: string[] = [date];
          const endISO = repeatEndType === 'date' && repeatEndDate ? repeatEndDate : twoYearsISO(date);
          let step = 1, next = advanceDate(date, repeatInterval, repeatUnit, step);
          while (next <= endISO && step <= 730) { dates.push(next); step++; next = advanceDate(date, repeatInterval, repeatUnit, step); }

          const seriesId = Date.now().toString(36) + Math.random().toString(36).slice(2);
          const total = dates.length;
          setRepeatProgress({ current: 0, total });
          let created = 0;
          const skipped: string[] = [];

          for (let i = 0; i < dates.length; i++) {
            try {
              await unitApi.post('/appointments', buildPayload(dates[i], finalIsPackage, seriesId));
              created++;
            } catch (err: any) {
              const status = err?.response?.status;
              if (status === 409 || status === 400) skipped.push(dates[i]);
              else throw err;
            }
            setRepeatProgress({ current: i + 1, total });
          }

          setRepeatProgress(null);
          if (created === 0) { setError('Nenhum agendamento criado. Verifique conflitos de horário.'); return; }
          if (skipped.length > 0) { setError(`${created} criado(s). ${skipped.length} data(s) pulada(s) por conflito.`); return; }
          onSuccess();
        }
      } catch (err: any) {
        setRepeatProgress(null);
        setError(err?.response?.data?.message || err?.message || 'Erro ao criar agendamento.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const isDirectPackageSale = service?.type === 'package' && !appointment?._id;
    const alreadyHasPackage = selectedClient?.packages?.some(p => p.active && p.packageId === serviceId);

    if (isDirectPackageSale && !alreadyHasPackage) {
      unitApi.post(`/clients/${clientId}/packages`, { packageId: serviceId })
        .then(() => doCreate(false))
        .catch(err => setError(err.response?.data?.message || 'Erro ao registrar pacote.'));
    } else if (selectedPackageId && !usePackage) {
      unitApi.post(`/clients/${clientId}/packages`, { packageId: selectedPackageId })
        .then(() => doCreate(true))
        .catch(err => setError(err.response?.data?.message || 'Erro ao assinar pacote.'));
    } else {
      void doCreate(usePackage);
    }
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
                  <button
                    type="button"
                    className={styles.clientOption}
                    onMouseDown={() => { setShowQuickRegister(true); setShowClientList(false); setQuickName(clientSearch); }}
                    style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--gold)', fontWeight: 600 }}
                  >
                    <span className={styles.clientOptionInitial} style={{ background: 'var(--gold)', color: '#fff' }}>+</span>
                    <div className={styles.clientOptionInfo}>
                      <span className={styles.clientOptionName}>Cadastrar novo cliente</span>
                    </div>
                  </button>
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

              {showQuickRegister && (
                <div style={{ border: '1px solid var(--gold)', borderRadius: '8px', padding: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-surface)' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Novo cliente</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      className={styles.input}
                      placeholder="Nome *"
                      value={quickName}
                      onChange={e => setQuickName(e.target.value)}
                      autoFocus
                    />
                    <input
                      className={styles.input}
                      placeholder="Telefone"
                      value={quickPhone}
                      onChange={e => setQuickPhone(maskPhone(e.target.value))}
                      inputMode="tel"
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => { setShowQuickRegister(false); setQuickName(''); setQuickPhone(''); }}
                        style={{ flex: 1, padding: '0.4rem', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickRegister}
                        disabled={!quickName.trim() || quickSaving}
                        style={{ flex: 2, padding: '0.4rem', background: 'var(--gold)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}
                      >
                        {quickSaving ? 'Salvando...' : 'Cadastrar e Selecionar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Barbeiro *</label>
            <select className={styles.select} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setServiceId(''); }} required>
              <option value="">Selecione um barbeiro</option>
              {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name}</option>)}
            </select>
          </div>

          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Serviço *</label>
            <select className={styles.select} value={serviceId} onChange={e => setServiceId(e.target.value)} required>
              <option value="">Selecione um serviço</option>
              {visibleServices.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.price)} ({s.durationMinutes > 0 ? `${s.durationMinutes}min` : 'Pacote'})
                </option>
              ))}
            </select>
          </div>

          {selectedClient && serviceId && (() => {
            const sub = selectedClient.packages?.find(p => 
              p.active && (p.packageId === serviceId || p.itemLimits?.some(il => il.serviceId === serviceId))
            );
            
            if (sub) {
              return (
                <div className={styles.packageLogicBox}>
                  <label className={styles.checkboxLabel}>
                    <input 
                      type="checkbox" 
                      checked={usePackage} 
                      onChange={e => {
                        setUsePackage(e.target.checked);
                        if (e.target.checked) setSelectedPackageId('');
                      }} 
                    />
                    <div className={styles.checkboxInfo}>
                      <span className={styles.checkboxTitle}>Utilizar pacote ativo</span>
                      <span className={styles.checkboxDesc}>O cliente já possui uma assinatura válida para este serviço.</span>
                    </div>
                  </label>
                </div>
              );
            }

            const availablePackages = services.filter(s => 
              s.type === 'package' && s.packageItems?.some(item => item.serviceId === serviceId)
            );

            if (availablePackages.length > 0) {
              return (
                <div className={styles.packageLogicBox}>
                  <div className={styles.offerPackage}>
                    <p className={styles.offerTitle}>O cliente não tem pacote para este serviço. Deseja assinar agora?</p>
                    <div className={styles.packageOptions}>
                      {availablePackages.map(pkg => (
                        <label key={pkg._id} className={`${styles.packageOption} ${selectedPackageId === pkg._id ? styles.packageOptionActive : ''}`}>
                          <input 
                            type="radio" 
                            name="package_offer" 
                            value={pkg._id}
                            checked={selectedPackageId === pkg._id}
                            onChange={() => {
                              setSelectedPackageId(pkg._id);
                              setUsePackage(false);
                            }}
                          />
                          <div className={styles.pkgOptContent}>
                            <span className={styles.pkgOptName}>{pkg.name}</span>
                            <span className={styles.pkgOptPrice}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pkg.price)}</span>
                          </div>
                        </label>
                      ))}
                      {selectedPackageId && (
                        <button type="button" className={styles.clearPkgBtn} onClick={() => setSelectedPackageId('')}>Remover seleção</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })()}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Data *</label>
              <input 
                type="date" 
                className={styles.input} 
                value={date} 
                min={todayISO()}
                onChange={e => setDate(e.target.value)} 
                required 
              />
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

          {/* ── Repeat ── */}
          {!appointment && (
            <div className={styles.repeatSection}>
              <div className={styles.repeatToggleRow}>
                <div className={styles.repeatToggleLeft}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                  <span className={styles.repeatLabel}>Repetir agendamento</span>
                </div>
                <button
                  type="button"
                  className={`${styles.toggleSwitch} ${repeatEnabled ? styles.toggleOn : ''}`}
                  onClick={() => setRepeatEnabled(v => !v)}
                  aria-pressed={repeatEnabled}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>

              {repeatEnabled && (
                <div className={styles.repeatConfig}>
                  <div className={styles.repeatRow}>
                    <span className={styles.repeatRowLabel}>Repetir a cada</span>
                    <div className={styles.intervalControl}>
                      <button type="button" className={styles.stepBtn} onClick={() => setRepeatInterval(n => Math.max(1, n - 1))}>−</button>
                      <span className={styles.intervalValue}>{repeatInterval}</span>
                      <button type="button" className={styles.stepBtn} onClick={() => setRepeatInterval(n => Math.min(365, n + 1))}>+</button>
                      <select className={styles.unitSelect} value={repeatUnit} onChange={e => setRepeatUnit(e.target.value as RepeatUnit)}>
                        <option value="days">dias</option>
                        <option value="weeks">semanas</option>
                        <option value="months">meses</option>
                        <option value="years">anos</option>
                      </select>
                    </div>
                  </div>

                  <div className={styles.repeatRow}>
                    <span className={styles.repeatRowLabel}>Terminar em</span>
                    <select className={styles.unitSelect} style={{ flex: 1 }} value={repeatEndType} onChange={e => setRepeatEndType(e.target.value as any)}>
                      <option value="never">Nunca (2 anos)</option>
                      <option value="date">Em uma data</option>
                    </select>
                  </div>

                  {repeatEndType === 'date' && (
                    <div className={styles.repeatRow}>
                      <span className={styles.repeatRowLabel}>Até</span>
                      <input
                        type="date"
                        className={styles.input}
                        style={{ flex: 1 }}
                        value={repeatEndDate}
                        min={date}
                        onChange={e => setRepeatEndDate(e.target.value)}
                      />
                    </div>
                  )}

                  {date && (
                    <p className={styles.repeatPreview}>
                      {formatRepeatPreview(date, repeatInterval, repeatUnit)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || mutation.isPending}>
              {repeatProgress
                ? `Criando ${repeatProgress.current} de ${repeatProgress.total}...`
                : isSubmitting ? 'Salvando...'
                : appointment ? 'Salvar Alterações'
                : repeatEnabled ? `Criar ${repeatTotal} Agendamentos`
                : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
