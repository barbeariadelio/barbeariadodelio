import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import ClientForm from './ClientForm';
import styles from './Clients.module.scss';

interface PackageItem {
  serviceId: { _id: string; name: string };
  quantity: number;
}

interface PackageSubscription {
  _id: string;
  packageId: {
    _id: string;
    name: string;
    packageItems: PackageItem[];
  };
  startDate: string;
  active: boolean;
  expiresAt?: string;
  itemLimits?: Array<{ serviceId: string; quantity: number; used: number }>;
}

interface Client {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  birthdate?: string;
  notes?: string;
  packages?: PackageSubscription[];
}

interface AppointmentItem {
  _id: string;
  date: string;
  startTime: string;
  serviceId: { _id: string; name: string } | null;
  employeeId: { name: string } | null;
  status: string;
  price: number;
  usedPackageId?: string;
  isBilled?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   '#F59E0B',
  confirmed: '#1E88E5',
  completed: '#22C55E',
  cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending:   'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function isGuestEmail(email?: string) { return email?.includes('@delio.guest') ?? false; }

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Clients() {
  const { user } = useAuth();
  const unitId = (user as any)?.unitId;
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ pkgId: string; serviceId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editUsedValue, setEditUsedValue] = useState('');
  const [billingAppt, setBillingAppt] = useState<AppointmentItem | null>(null);
  const [billingPrice, setBillingPrice] = useState('');
  const [billingPaymentMethod, setBillingPaymentMethod] = useState<'money' | 'card' | 'pix' | 'other'>('pix');
  const [billingRegisterPayment, setBillingRegisterPayment] = useState(true);
  const debouncedSearch = useDebounce(search, 400);
  const qc = useQueryClient();

  const updateLimitMutation = useMutation({
    mutationFn: ({ clientId, pkgServiceId, serviceId, quantity, used }: { clientId: string; pkgServiceId: string; serviceId: string; quantity: number; used: number }) =>
      api.patch(`/clients/${clientId}/packages/${pkgServiceId}/items/${serviceId}`, { quantity, used }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      setEditingItem(null);
      setToast({ message: 'Sessões atualizadas!', type: 'success' });
    },
    onError: () => setToast({ message: 'Erro ao atualizar sessões.', type: 'error' }),
  });

  const billMutation = useMutation({
    mutationFn: ({ apptId, price, paymentMethod, skipBilling }: { apptId: string; price: number; paymentMethod: string; skipBilling: boolean }) =>
      api.patch(`/appointments/${apptId}/status`, { status: 'completed', price, paymentMethod, skipBilling }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setBillingAppt(null);
      setToast({ message: 'Atendimento faturado com sucesso!', type: 'success' });
    },
    onError: () => setToast({ message: 'Erro ao faturar atendimento.', type: 'error' }),
  });

  function openBilling(appt: AppointmentItem) {
    setBillingAppt(appt);
    setBillingPrice(appt.price.toFixed(2).replace('.', ','));
    setBillingPaymentMethod('pix');
    setBillingRegisterPayment(true);
  }

  function confirmBilling() {
    if (!billingAppt) return;
    const price = parseFloat(billingPrice.replace(',', '.'));
    billMutation.mutate({
      apptId: billingAppt._id,
      price: isNaN(price) ? billingAppt.price : price,
      paymentMethod: billingPaymentMethod,
      skipBilling: billingAppt.usedPackageId ? !billingRegisterPayment : false,
    });
  }

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setToast({ message: 'Copiado para a área de transferência!', type: 'success' });
    setTimeout(() => setCopiedField(null), 1500);
  };

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', debouncedSearch, unitId],
    queryFn: async () => {
      const params = debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : '';
      const { data } = await api.get(`/clients${params}`);
      return Array.isArray(data) ? data : data.clients ?? [];
    },
    enabled: !!user,
  });

  const { data: appointments = [] } = useQuery<AppointmentItem[]>({
    queryKey: ['client-appointments', selectedId],
    queryFn: async () => {
      const { data } = await api.get(`/appointments/client/${selectedId}`);
      return Array.isArray(data) ? data : data.appointments ?? [];
    },
    enabled: !!selectedId,
  });

  const selectedClient = clients.find(c => c._id === selectedId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  // Counts all non-cancelled appointments where the client used a specific session
  // from a specific package. Starts counting from first appointment registered.
  function calculatePackageUsage(packageServiceId: string, itemServiceId: string) {
    return appointments.filter(a =>
      a.status !== 'cancelled' &&
      a.usedPackageId === packageServiceId &&
      a.serviceId?._id === itemServiceId
    ).length;
  }

  const IconCopy = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {toast.type === 'success' ? (
              <polyline points="20 6 9 17 4 12"/>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </>
            )}
          </svg>
          {toast.message}
        </div>
      )}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>CLIENTES</h1>
        <button className={styles.newBtn} onClick={() => setShowForm(true)}>
          + Novo Cliente
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.listPanel}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {isLoading && <p className={styles.empty}>Carregando...</p>}
          {!isLoading && clients.length === 0 && (
            <p className={styles.empty}>Nenhum cliente encontrado.</p>
          )}

          <div className={styles.clientList}>
            {clients.map(client => (
              <div
                key={client._id}
                className={`${styles.clientRow} ${selectedId === client._id ? styles.selected : ''}`}
                onClick={() => handleSelect(client._id)}
              >
                <div className={styles.avatar}>
                  {client.name[0].toUpperCase()}
                </div>
                <div className={styles.clientInfo}>
                  <span className={styles.clientName}>{client.name}</span>
                  <span className={styles.clientSub}>
                    {client.phone ?? ''}{client.phone && client.email && !isGuestEmail(client.email) ? ' · ' : ''}{!isGuestEmail(client.email) ? (client.email ?? '') : ''}
                  </span>
                </div>
                <span className={styles.arrow}>{selectedId === client._id ? '✕' : '›'}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedClient && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div className={styles.detailAvatar}>
                {selectedClient.name[0].toUpperCase()}
              </div>
              <div>
                <h2 className={styles.detailName}>{selectedClient.name}</h2>
                {selectedClient.phone && (
                  <div className={styles.detailMetaWrapper}>
                    <p className={styles.detailMeta}>{selectedClient.phone}</p>
                    <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedClient.phone || '', 'phone')} title="Copiar telefone">
                      {copiedField === 'phone' ? <IconCheck /> : <IconCopy />}
                    </button>
                  </div>
                )}
                {selectedClient.email && !isGuestEmail(selectedClient.email) && (
                  <div className={styles.detailMetaWrapper}>
                    <p className={styles.detailMeta}>{selectedClient.email}</p>
                    <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedClient.email || '', 'email')} title="Copiar e-mail">
                      {copiedField === 'email' ? <IconCheck /> : <IconCopy />}
                    </button>
                  </div>
                )}
                {selectedClient.notes && <p className={styles.detailNotes}>{selectedClient.notes}</p>}
              </div>
            </div>

            {selectedClient.packages && selectedClient.packages.filter(p => p.packageId).length > 0 && (
              <div className={styles.clientPackages}>
                <h3 className={styles.historyTitle}>Pacotes e Assinaturas</h3>
                <div className={styles.packageList}>
                  {selectedClient.packages.filter(p => p.packageId).map(pkg => {
                    const now = new Date();
                    const isExpired = pkg.expiresAt ? new Date(pkg.expiresAt) < now : false;
                    const statusLabel = isExpired ? 'EXPIRADO' : pkg.active ? 'ATIVO' : 'INATIVO';
                    const statusColor = isExpired ? '#EF4444' : pkg.active ? '#22C55E' : '#9CA3AF';
                    return (
                      <div key={pkg._id} className={styles.packageCard}>
                        <div className={styles.packageCardHead}>
                          <h4 className={styles.packageName}>{pkg.packageId.name}</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span className={styles.packageBadge} style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}55` }}>{statusLabel}</span>
                            {pkg.expiresAt && (
                              <span style={{ fontSize: '11px', color: isExpired ? '#EF4444' : 'var(--text-secondary)' }}>
                                {isExpired ? 'Expirou' : 'Expira'} em {formatDate(pkg.expiresAt.split('T')[0])}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={styles.packageUsage}>
                          {pkg.packageId.packageItems.map(item => {
                            // Use backend tracked count (used) if available, otherwise count from appointments
                            const backendLimit = pkg.itemLimits?.find(l => l.serviceId === item.serviceId._id);
                            const used = backendLimit?.used ?? calculatePackageUsage(pkg.packageId._id, item.serviceId._id);
                            const total = backendLimit?.quantity ?? item.quantity;
                            const remaining = Math.max(0, total - used);
                            const perc = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                            const isExhausted = used >= total;
                            const isEditing = editingItem?.pkgId === pkg.packageId._id && editingItem?.serviceId === item.serviceId._id;
                            return (
                              <div key={item.serviceId._id} className={styles.usageItem}>
                                <div className={styles.usageRow}>
                                  <span className={styles.usageServiceName}>{item.serviceId.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isEditing ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Usadas:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={parseInt(editValue, 10) || 9999}
                                            style={{ width: '50px', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }}
                                            value={editUsedValue}
                                            onChange={e => setEditUsedValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Escape') setEditingItem(null);
                                            }}
                                            autoFocus
                                          />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            style={{ width: '50px', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }}
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                const q = parseInt(editValue, 10);
                                                const u = parseInt(editUsedValue, 10);
                                                if (!isNaN(q) && !isNaN(u) && q >= 0 && u >= 0) updateLimitMutation.mutate({ clientId: selectedClient._id, pkgServiceId: pkg.packageId._id, serviceId: item.serviceId._id, quantity: q, used: u });
                                              }
                                              if (e.key === 'Escape') setEditingItem(null);
                                            }}
                                          />
                                        </div>
                                        <button
                                          style={{ padding: '2px 8px', borderRadius: '6px', background: 'var(--blue-600)', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer' }}
                                          disabled={updateLimitMutation.isPending}
                                          onClick={() => {
                                            const q = parseInt(editValue, 10);
                                            const u = parseInt(editUsedValue, 10);
                                            if (!isNaN(q) && !isNaN(u) && q >= 0 && u >= 0) updateLimitMutation.mutate({ clientId: selectedClient._id, pkgServiceId: pkg.packageId._id, serviceId: item.serviceId._id, quantity: q, used: u });
                                          }}
                                        >✓</button>
                                        <button
                                          style={{ padding: '2px 6px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}
                                          onClick={() => setEditingItem(null)}
                                        >✕</button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className={styles.usageCount} style={{ color: isExhausted ? '#EF4444' : 'var(--blue-600)' }}>
                                          {used} de {total} {isExhausted ? '(Esgotado)' : `(${remaining} restante${remaining !== 1 ? 's' : ''})`}
                                        </span>
                                        <button
                                          title="Editar sessões"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', lineHeight: 1 }}
                                          onClick={() => { setEditingItem({ pkgId: pkg.packageId._id, serviceId: item.serviceId._id }); setEditValue(String(total)); setEditUsedValue(String(used)); }}
                                        >
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className={styles.usageBar}>
                                  <div
                                    className={styles.usageFill}
                                    style={{ width: `${perc}%`, background: isExhausted ? '#EF4444' : isExpired ? '#F59E0B' : 'var(--blue-600)', transition: 'width 0.3s ease' }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <h3 className={styles.historyTitle}>Histórico de Atendimentos</h3>

            {appointments.length === 0 && (
              <p className={styles.empty}>Nenhum atendimento registrado.</p>
            )}

            <div className={styles.historyList}>
              {appointments.map(appt => (
                <div key={appt._id} className={styles.historyRow}>
                  <div className={styles.historyInfo}>
                    <span className={styles.historyDate}>{formatDate(appt.date)} — {appt.startTime}</span>
                    <span className={styles.historySub}>
                      {appt.serviceId?.name ?? 'Serviço'} · {appt.employeeId?.name ?? 'Barbeiro'}
                    </span>
                  </div>
                  <div className={styles.historyRight}>
                    <span
                      className={styles.badge}
                      style={{
                        background: `${STATUS_COLORS[appt.status]}22`,
                        color: STATUS_COLORS[appt.status],
                        border: `1px solid ${STATUS_COLORS[appt.status]}55`,
                      }}
                    >
                      {STATUS_LABELS[appt.status]}
                    </span>
                    {appt.isBilled && (
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#1565C0', background: 'rgba(21,101,192,0.1)', border: '1px solid rgba(21,101,192,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                        FATURADO
                      </span>
                    )}
                    {!appt.isBilled && appt.status !== 'cancelled' && (
                      <button
                        onClick={() => openBilling(appt)}
                        style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#fff', background: '#1565C0', border: 'none', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer' }}
                      >
                        FATURAR
                      </button>
                    )}
                    <span className={styles.historyPrice}>{formatCurrency(appt.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {billingAppt && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setBillingAppt(null); }}
        >
          <div style={{ background: '#ffffff', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Finalizar Atendimento</span>
              <button onClick={() => setBillingAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6B7280' }}>✕</button>
            </div>

            {/* Appointment summary */}
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#f5f5f5', borderRadius: '8px', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: '#111' }}>{billingAppt.serviceId?.name ?? 'Serviço'}</div>
              <div style={{ color: '#6B7280', marginTop: '2px' }}>
                {formatDate(billingAppt.date)} — {billingAppt.startTime} · {billingAppt.employeeId?.name ?? 'Barbeiro'}
              </div>
            </div>

            {/* Price input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '6px' }}>
                Valor Final
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '8px 12px', background: '#fff' }}>
                <span style={{ fontWeight: 600, color: '#6B7280' }}>R$</span>
                <input
                  type="text"
                  value={billingPrice}
                  onChange={e => setBillingPrice(e.target.value.replace(/[^0-9,]/g, ''))}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', fontWeight: 700, background: 'transparent', color: '#111' }}
                  autoFocus
                />
              </div>
            </div>

            {/* Package use: toggle + optional payment method */}
            {billingAppt.usedPackageId ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6D00" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#FF6D00' }}>Sessão de Pacote</span>
                </div>
                <div style={{ padding: '1rem', borderRadius: '10px', background: '#f5f5f5', border: '1px solid #E5E7EB', marginBottom: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                    <div
                      onClick={() => setBillingRegisterPayment(v => !v)}
                      style={{ width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0, background: billingRegisterPayment ? '#1565C0' : '#D1D5DB', transition: 'background 0.2s', position: 'relative', cursor: 'pointer' }}
                    >
                      <div style={{ position: 'absolute', top: '3px', left: billingRegisterPayment ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{billingRegisterPayment ? 'Registrar pagamento' : 'Sem cobrança'}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                        {billingRegisterPayment ? 'Gera transação e comissão para o barbeiro' : 'Apenas desconta a sessão do pacote, sem transação'}
                      </div>
                    </div>
                  </label>
                </div>
                {billingRegisterPayment && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '6px' }}>Forma de Pagamento</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {(['money', 'card', 'pix', 'other'] as const).map(pm => (
                        <button key={pm} onClick={() => setBillingPaymentMethod(pm)}
                          style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${billingPaymentMethod === pm ? '#1565C0' : '#E5E7EB'}`, background: billingPaymentMethod === pm ? 'rgba(21,101,192,0.08)' : '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: billingPaymentMethod === pm ? '#1565C0' : '#374151' }}>
                          {pm === 'money' ? 'Dinheiro' : pm === 'card' ? 'Cartão' : pm === 'pix' ? 'Pix' : 'Outro'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Regular appointment: always show payment method */
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '6px' }}>Forma de Pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['money', 'card', 'pix', 'other'] as const).map(pm => (
                    <button key={pm} onClick={() => setBillingPaymentMethod(pm)}
                      style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${billingPaymentMethod === pm ? '#1565C0' : '#E5E7EB'}`, background: billingPaymentMethod === pm ? 'rgba(21,101,192,0.08)' : '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: billingPaymentMethod === pm ? '#1565C0' : '#374151' }}>
                      {pm === 'money' ? 'Dinheiro' : pm === 'card' ? 'Cartão' : pm === 'pix' ? 'Pix' : 'Outro'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button onClick={() => setBillingAppt(null)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                Voltar
              </button>
              <button onClick={confirmBilling} disabled={billMutation.isPending}
                style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: billMutation.isPending ? 0.7 : 1 }}>
                {billMutation.isPending ? 'Processando...' : 'Confirmar e Concluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['clients'] });
          }}
        />
      )}
    </div>
  );
}
