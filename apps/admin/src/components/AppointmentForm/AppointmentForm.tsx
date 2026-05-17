import { FormEvent, useState, useRef, useEffect, useCallback } from 'react';
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

function advanceDate(iso: string, freq: 'weekly' | 'biweekly' | 'monthly' | 'annual', times: number): string {
  const d = new Date(iso + 'T12:00:00');
  if (freq === 'weekly')        d.setDate(d.getDate() + times * 7);
  else if (freq === 'biweekly') d.setDate(d.getDate() + times * 14);
  else if (freq === 'monthly')  d.setMonth(d.getMonth() + times);
  else                          d.setFullYear(d.getFullYear() + times);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [repeatFrequency, setRepeatFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'annual'>('weekly');
  const [repeatCount, setRepeatCount] = useState(3);
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
      setNotes(appointment.notes || '');
      setUsePackage(!!appointment.isPackage);
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

  const selectedUnit = units.find(u => u._id === unitId);

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
    queryFn: () => api.get(`/products?unitId=${unitId}`).then(r => Array.isArray(r.data) ? r.data : r.data?.products ?? []),
    enabled: !!unitId,
  });
  const activeProducts = products.filter(p => p.isActive && p.stockQuantity > 0);

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
      const res = await api.post('/clients', { name: quickName.trim(), phone: quickPhone.replace(/\D/g, '') || undefined, unitId: unitId || undefined });
      const newClient: Client = res.data;
      await qc.invalidateQueries({ queryKey: ['clients', unitId] });
      selectClient(newClient);
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
    if (selectedUnit?.workingDays && selectedUnit.workingDays.length > 0) {
      const dayOfWeek = new Date(date + 'T12:00:00').getDay();
      if (!selectedUnit.workingDays.includes(dayOfWeek)) {
        setError('A barbearia não funciona no dia selecionado.');
        return;
      }
    }

    const buildPayload = (apptDate: string, finalIsPackage: boolean, seriesId?: string) => ({
      unitId,
      clientId,
      employeeId,
      serviceId,
      date: apptDate,
      startTime,
      notes,
      price: finalIsPackage ? 0 : (service?.price ?? 0),
      isPackage: finalIsPackage,
      products: apptProducts.length > 0 ? apptProducts : undefined,
      seriesId,
    });

    const createOne = async (apptDate: string, finalIsPackage: boolean, seriesId?: string) => {
      if (appointment?._id) {
        await api.patch(`/appointments/${appointment._id}`, buildPayload(apptDate, finalIsPackage));
      } else {
        await api.post('/appointments', buildPayload(apptDate, finalIsPackage, seriesId));
      }
    };

    const doCreate = async (finalIsPackage: boolean) => {
      setError(null);
      setIsSubmitting(true);
      try {
        if (!repeatEnabled || appointment?._id) {
          await createOne(date, finalIsPackage);
          onSuccess();
        } else {
          // Build full list of dates: original + repeatCount more
          const total = repeatCount + 1;
          const dates: string[] = [date];
          for (let i = 1; i <= repeatCount; i++) {
            dates.push(advanceDate(date, repeatFrequency, i));
          }

          // All appointments in this repeat series share the same seriesId
          const seriesId = Date.now().toString(36) + Math.random().toString(36).slice(2);

          setRepeatProgress({ current: 0, total });
          let created = 0;
          const skipped: string[] = [];

          for (let i = 0; i < dates.length; i++) {
            try {
              await createOne(dates[i], finalIsPackage, seriesId);
              created++;
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

          if (created === 0) {
            setError('Nenhum agendamento foi criado. Verifique conflitos de horário.');
            return;
          }

          if (skipped.length > 0) {
            setError(`${created} agendamento(s) criado(s). ${skipped.length} data(s) pulada(s) por conflito: ${skipped.join(', ')}`);
            // Still refresh the calendar but don't close — let the user see the partial result
            return;
          }

          onSuccess();
        }
      } catch (err: any) {
        setRepeatProgress(null);
        const serverMsg = err?.response?.data?.message;
        setError(serverMsg || err?.message || 'Erro ao criar agendamento.');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (selectedPackageId && !usePackage) {
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
            <select className={styles.select} value={serviceId} onChange={e => setServiceId(e.target.value)} required>
              <option value="">Selecione um serviço</option>
              {services.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} — {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.price)} ({s.durationMinutes}min)
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

          {/* ── Products ── */}
          {!appointment && (
            <div className={styles.field}>
              <label className={styles.label}>Produtos (opcional)</label>
              {activeProducts.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: apptProducts.length > 0 ? '0.5rem' : 0 }}>
                  <select
                    className={styles.select}
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    style={{ flex: 1 }}
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
                    className={styles.input}
                    style={{ width: '64px' }}
                  />
                  <button
                    type="button"
                    className={styles.submitBtn}
                    style={{ padding: '0 0.75rem', whiteSpace: 'nowrap' }}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {apptProducts.map(p => (
                    <div key={p.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface,#F9FAFB)', border: '1px solid var(--border,#E5E7EB)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.875rem' }}>
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
          )}

          {/* ── Repeat ── */}
          {!appointment && (
            <div className={styles.field}>
              <label className={styles.checkboxLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={repeatEnabled} onChange={e => setRepeatEnabled(e.target.checked)} />
                Repetir agendamento
              </label>
              {repeatEnabled && (
                <div className={styles.row} style={{ marginTop: '0.5rem' }}>
                  <div className={styles.field}>
                    <label className={styles.label}>Frequência</label>
                    <select className={styles.select} value={repeatFrequency} onChange={e => setRepeatFrequency(e.target.value as any)}>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                      <option value="annual">Anual</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Repetições</label>
                    <select className={styles.select} value={repeatCount} onChange={e => setRepeatCount(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n}×</option>)}
                    </select>
                  </div>
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
                : repeatEnabled ? `Criar ${repeatCount + 1} Agendamentos`
                : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
