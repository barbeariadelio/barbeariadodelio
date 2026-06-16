import { FormEvent, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import styles from './AppointmentForm.module.scss';

function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

interface Unit { _id: string; name: string; apiUrl?: string; workingDays?: number[]; }
interface Employee { _id: string; name: string; }
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
interface Product { _id: string; name: string; price: number; stockQuantity: number; isActive: boolean; }
interface ApptProduct { productId: string; name: string; quantity: number; unitPrice: number; }

type RepeatUnit = 'days' | 'weeks' | 'months' | 'years';

function advanceDate(iso: string, interval: number, unit: RepeatUnit, step: number): string {
  const d = new Date(iso + 'T12:00:00');
  if (unit === 'days')   d.setDate(d.getDate() + interval * step);
  if (unit === 'weeks')  d.setDate(d.getDate() + interval * 7 * step);
  if (unit === 'months') d.setMonth(d.getMonth() + interval * step);
  if (unit === 'years')  d.setFullYear(d.getFullYear() + interval * step);
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

interface Props {
  onClose: () => void;
  onSuccess: (appointment?: unknown) => void;
  initialDate?: string;
  initialEmployeeId?: string;
  initialTime?: string;
  appointment?: any;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMinutesToTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + Math.max(1, durationMinutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function diffMinutes(startTime?: string, endTime?: string): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
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
  const { user } = useAuth();
  const qc = useQueryClient();
  const isStaff = user?.role === 'employee';
  const userId = (user as any)?._id || (user as any)?.id || '';

  const [unitId, setUnitId] = useState(getSelectedUnitId() || import.meta.env.VITE_UNIT_ID || '');
  const [clientId, setClientId] = useState('');
  const [quickSelectedClient, setQuickSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? '');
  const [serviceId, setServiceId] = useState('');
  const [customDurationMinutes, setCustomDurationMinutes] = useState('');
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

  // Products
  const [apptProducts, setApptProducts] = useState<ApptProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQty, setProductQty] = useState(1);

  const clientBoxRef = useRef<HTMLDivElement>(null);

  // Pre-fill if editing
  useEffect(() => {
    if (appointment) {
      const apptUnitId = appointment.unitId?._id || appointment.unitId || getSelectedUnitId() || import.meta.env.VITE_UNIT_ID || '';
      setUnitId(apptUnitId);
      setClientId(appointment.clientId?._id || appointment.clientId || '');
      setEmployeeId(appointment.employeeId?._id || appointment.employeeId || '');
      setServiceId(appointment.serviceId?._id || appointment.serviceId || '');
      setDate(appointment.date);
      setStartTime(appointment.startTime);
      setCustomDurationMinutes(String(diffMinutes(appointment.startTime, appointment.endTime) ?? appointment.serviceId?.durationMinutes ?? 30));
      setNotes(appointment.notes || '');
      setUsePackage(!!appointment.isPackage);
      if (Array.isArray(appointment.products)) setApptProducts(appointment.products);
    }
  }, [appointment]);

  // Lock barber to the logged-in employee
  useEffect(() => {
    if (isStaff && userId && !appointment) {
      setEmployeeId(userId);
    }
  }, [isStaff, userId, appointment]);

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

  // Auto-select when only one unit is available (e.g. employee role)
  useEffect(() => {
    if (units.length === 1 && !unitId) {
      setUnitId(units[0]._id);
    }
  }, [units, unitId]);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees', unitId],
    queryFn: () => api.get(`/employees?unitId=${unitId}`).then(r => Array.isArray(r.data) ? r.data : r.data?.employees ?? []),
    enabled: !!unitId,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', unitId],
    queryFn: () => api.get(`/clients?unitId=${unitId}&limit=1000`).then(r => Array.isArray(r.data) ? r.data : r.data?.clients ?? []),
    enabled: !!unitId,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['services', unitId],
    queryFn: () => api.get(`/services?unitId=${unitId}`).then(r => Array.isArray(r.data) ? r.data : r.data?.services ?? []),
    enabled: !!unitId,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', unitId],
    queryFn: () => api.get(`/products?unitId=${unitId}&limit=1000`).then(r => Array.isArray(r.data) ? r.data : r.data?.products ?? []),
    enabled: !!unitId,
  });
  const activeProducts = products.filter(p => p.isActive && p.stockQuantity > 0);

  const normalizedClientSearch = clientSearch.trim().toLowerCase();
  const clientSearchDigits = normalizedClientSearch.replace(/\D/g, '');
  const filteredClients = normalizedClientSearch
    ? clients.filter(c =>
      c.name.toLowerCase().includes(normalizedClientSearch) ||
      (clientSearchDigits.length > 0 && (c.phone ?? '').replace(/\D/g, '').includes(clientSearchDigits))
    )
    : clients;

  const selectedClient = clients.find(c => c._id === clientId) ?? (quickSelectedClient?._id === clientId ? quickSelectedClient : undefined);
  const selectedService = services.find(s => s._id === serviceId);

  function handleServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    setCustomDurationMinutes('');
  }

  function selectClient(c: Client) {
    setQuickSelectedClient(c);
    setClientId(c._id);
    setClientSearch('');
    setShowClientList(false);
    setUsePackage(false);
    setSelectedPackageId('');
  }

  function clearClient() {
    setQuickSelectedClient(null);
    setClientId('');
    setClientSearch('');
    setUsePackage(false);
    setSelectedPackageId('');
  }

  const handleQuickRegister = useCallback(async () => {
    if (!quickName.trim()) return;
    setQuickSaving(true);
    try {
      const res = await api.post('/clients', { name: quickName.trim(), phone: quickPhone.replace(/\D/g, '') || undefined, unitId: unitId || undefined });
      const newClient: Client = res.data;
      qc.setQueryData<Client[]>(['clients', unitId], current => {
        const list = Array.isArray(current) ? current : [];
        return list.some(client => client._id === newClient._id) ? list : [newClient, ...list];
      });
      selectClient(newClient);
      await qc.invalidateQueries({ queryKey: ['clients', unitId] });
      setShowQuickRegister(false);
      setQuickName('');
      setQuickPhone('');
    } catch {
      // silent — user can try again
    } finally {
      setQuickSaving(false);
    }
  }, [quickName, quickPhone, unitId, qc]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  function twoYearsISO(base: string) {
    const d = new Date(base + 'T12:00:00');
    d.setFullYear(d.getFullYear() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const repeatTotal = useMemo(() => {
    if (!repeatEnabled || !date) return 1;
    const endISO = repeatEndType === 'date' && repeatEndDate ? repeatEndDate : twoYearsISO(date);
    let count = 1, step = 1;
    let next = advanceDate(date, repeatInterval, repeatUnit, step);
    while (next <= endISO && step <= 730) { count++; step++; next = advanceDate(date, repeatInterval, repeatUnit, step); }
    return count;
  }, [repeatEnabled, repeatEndType, repeatEndDate, date, repeatInterval, repeatUnit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unitId || !clientId || !employeeId || !serviceId) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    const service = services.find(s => s._id === serviceId);
    const customDuration = customDurationMinutes.trim() ? Math.max(1, Number(customDurationMinutes)) : null;
    const originalServiceId = appointment?.serviceId?._id || appointment?.serviceId;
    const serviceChanged = Boolean(appointment?._id && originalServiceId !== serviceId);

    if (date < todayISO()) {
      setError('Não é possível agendar em uma data que já passou.');
      return;
    }
    const buildPayload = (apptDate: string, finalIsPackage: boolean, seriesId?: string) => {
      const payload: Record<string, unknown> = {
        unitId,
        clientId,
        employeeId,
        serviceId,
        date: apptDate,
        startTime,
        notes,
        isPackage: finalIsPackage,
        products: apptProducts.length > 0 ? apptProducts : undefined,
        seriesId,
      };
      if (customDuration !== null) {
        payload.endTime = addMinutesToTime(startTime, customDuration);
      }
      // A service swap adopts the selected service price. Other edits preserve
      // possible billed or package-adjusted values already stored.
      if (!appointment?._id || serviceChanged) {
        payload.price = finalIsPackage ? 0 : (service?.price ?? 0);
      }
      return payload;
    };

    const createOne = async (apptDate: string, finalIsPackage: boolean, seriesId?: string) => {
      if (appointment?._id) {
        const { data: updatedAppointment } = await api.patch(`/appointments/${appointment._id}`, buildPayload(apptDate, finalIsPackage));
        return updatedAppointment;
      }
      await api.post('/appointments', buildPayload(apptDate, finalIsPackage, seriesId));
      return undefined;
    };

    const doCreate = async (finalIsPackage: boolean) => {
      setError(null);
      setIsSubmitting(true);
      try {
        if (!repeatEnabled || appointment?._id) {
          const updatedAppointment = await createOne(date, finalIsPackage);
          onSuccess(updatedAppointment);
        } else {
          // Build full list of dates
          const dates: string[] = [date];
          const endISO = repeatEndType === 'date' && repeatEndDate ? repeatEndDate : twoYearsISO(date);
          let step = 1, next = advanceDate(date, repeatInterval, repeatUnit, step);
          while (next <= endISO && step <= 730) { dates.push(next); step++; next = advanceDate(date, repeatInterval, repeatUnit, step); }
          const total = dates.length;

          // All appointments in this repeat series share the same seriesId
          const seriesId = Date.now().toString(36) + Math.random().toString(36).slice(2);

          setRepeatProgress({ current: 0, total });
          const skipped: string[] = [];

          const createRemaining = async (startIndex: number) => {
            for (let i = startIndex; i < dates.length; i++) {
              try {
                await createOne(dates[i], finalIsPackage, seriesId);
                onSuccess();
              } catch (err: any) {
                const status = err?.response?.status;
                if (status === 409 || status === 400) {
                  skipped.push(dates[i]);
                } else {
                  console.error('Erro ao criar agendamento repetido.', err);
                }
              }
            }
          };

          for (let i = 0; i < dates.length; i++) {
            try {
              await createOne(dates[i], finalIsPackage, seriesId);
              onSuccess();
              void createRemaining(i + 1);
              return;
            } catch (err: any) {
              // Skip conflicts (409) and non-working-day errors (400); abort on unexpected errors
              const status = err?.response?.status;
              if (status === 409 || status === 400) {
                skipped.push(dates[i]);
              } else {
                throw err;
              }
            }
            setRepeatProgress({ current: i + 1, total });
          }

          setRepeatProgress(null);
          setError('Nenhum agendamento foi criado. Verifique conflitos de horário.');
        }
      } catch (err: any) {
        setRepeatProgress(null);
        const serverMsg = err?.response?.data?.message;
        setError(serverMsg || err?.message || 'Erro ao criar agendamento.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const isDirectPackageSale = service?.type === 'package' && !appointment?._id;
    const alreadyHasPackage = selectedClient?.packages?.some(p => p.active && p.packageId === serviceId);

    if (isDirectPackageSale && !alreadyHasPackage) {
      api.post(`/clients/${clientId}/packages`, { packageId: serviceId })
        .then(() => doCreate(false))
        .catch(err => setError(err.response?.data?.message || 'Erro ao registrar pacote.'));
    } else if (selectedPackageId && !usePackage) {
      api.post(`/clients/${clientId}/packages`, { packageId: selectedPackageId })
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
          <h2 className={styles.modalTitle}>{appointment ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
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
              setClientId(''); setEmployeeId(''); setServiceId(''); setCustomDurationMinutes('');
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
                    placeholder="Buscar cliente por nome ou telefone..."
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

          {isStaff ? (
            <div className={styles.field}>
              <label className={styles.label}>Barbeiro</label>
              <input
                className={styles.input}
                value={employees.find(e => e._id === employeeId)?.name || user?.name || ''}
                readOnly
                style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'default' }}
              />
            </div>
          ) : (
            <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
              <label className={styles.label}>Barbeiro *</label>
              <select className={styles.select} value={employeeId} onChange={e => setEmployeeId(e.target.value)} required>
                <option value="">Selecione um barbeiro</option>
                {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name}</option>)}
              </select>
            </div>
          )}

          <div className={styles.field} style={{ opacity: unitId ? 1 : 0.5, pointerEvents: unitId ? 'auto' : 'none' }}>
            <label className={styles.label}>Serviço *</label>
            <select className={styles.select} value={serviceId} onChange={e => handleServiceChange(e.target.value)} required>
              <option value="">Selecione um serviço</option>
              {services.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.price)} ({s.durationMinutes > 0 ? `${s.durationMinutes}min` : 'Pacote'})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field} style={{ opacity: serviceId ? 1 : 0.5, pointerEvents: serviceId ? 'auto' : 'none' }}>
            <label className={styles.label}>Duração do agendamento (min) - opcional</label>
            <input
              type="number"
              min={1}
              step={1}
              className={styles.input}
              value={customDurationMinutes}
              onChange={e => setCustomDurationMinutes(e.target.value)}
              placeholder={selectedService?.durationMinutes ? String(selectedService.durationMinutes) : '30'}
            />
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

          {/* ── Products ── */}
          <div className={styles.field}>
              <label className={styles.label}>Produtos (opcional)</label>
              {activeProducts.length > 0 && (
                <div className={styles.productPickerRow}>
                  <select
                    className={`${styles.select} ${styles.productPickerSelect}`}
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                  >
                    <option value="">Selecionar produto</option>
                    {activeProducts.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name} — R$ {p.price.toFixed(2).replace('.', ',')} (estoque: {p.stockQuantity})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={productQty}
                    onChange={e => setProductQty(Math.max(1, Number(e.target.value)))}
                    className={`${styles.input} ${styles.productQtyInput}`}
                  />
                  <button
                    type="button"
                    className={`${styles.submitBtn} ${styles.productAddBtn}`}
                    disabled={!selectedProductId}
                    onClick={() => {
                      const prod = activeProducts.find(p => p._id === selectedProductId);
                      if (!prod) return;
                      setApptProducts(prev => {
                        const exists = prev.find(p => p.productId === prod._id);
                        if (exists) return prev.map(p => p.productId === prod._id ? { ...p, quantity: p.quantity + productQty } : p);
                        return [...prev, { productId: prod._id, name: prod.name, quantity: productQty, unitPrice: prod.price }];
                      });
                      setSelectedProductId('');
                      setProductQty(1);
                    }}
                  >
                    Adicionar
                  </button>
                </div>
              )}
              {apptProducts.length > 0 && (
                <div className={styles.productCartList}>
                  {apptProducts.map(p => (
                    <div key={p.productId} className={styles.productCartItem}>
                      <span style={{ fontWeight: 600, color: '#111827' }}>{p.name}</span>
                      <span style={{ color: '#6B7280' }}>x{p.quantity} · R$ {(p.quantity * p.unitPrice).toFixed(2).replace('.', ',')}</span>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '0 0.25rem' }} onClick={() => setApptProducts(prev => prev.filter(x => x.productId !== p.productId))}>✕</button>
                    </div>
                  ))}
                  <div style={{ fontSize: '0.8rem', color: '#6B7280', textAlign: 'right', paddingRight: '0.25rem' }}>
                    Sem comissão para o barbeiro
                  </div>
                </div>
              )}
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
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {repeatProgress
                ? `Criando ${repeatProgress.current} de ${repeatProgress.total}...`
                : isSubmitting ? 'Salvando...'
                : appointment ? 'Salvar Alterações'
                : repeatEnabled
                  ? repeatTotal !== null ? `Criar ${repeatTotal} Agendamentos` : 'Criar Agendamentos'
                  : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
