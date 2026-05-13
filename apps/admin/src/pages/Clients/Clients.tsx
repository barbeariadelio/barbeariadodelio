import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const debouncedSearch = useDebounce(search, 400);
  const qc = useQueryClient();

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

  // Counts all completed appointments where the client used a specific session
  // from a specific package (matched by usedPackageId = the package service _id).
  function calculatePackageUsage(packageServiceId: string, itemServiceId: string) {
    return appointments.filter(a =>
      a.status === 'completed' &&
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

            {selectedClient.packages && selectedClient.packages.filter(p => p.active && p.packageId).length > 0 && (
              <div className={styles.clientPackages}>
                <h3 className={styles.historyTitle}>Pacotes e Assinaturas</h3>
                <div className={styles.packageList}>
                  {selectedClient.packages.filter(p => p.active && p.packageId).map(pkg => (
                    <div key={pkg._id} className={styles.packageCard}>
                      <div className={styles.packageCardHead}>
                        <h4 className={styles.packageName}>{pkg.packageId.name}</h4>
                        <span className={styles.packageBadge}>Ativo</span>
                      </div>
                      <div className={styles.packageUsage}>
                        {pkg.packageId.packageItems.map(item => {
                          const used = calculatePackageUsage(pkg.packageId._id, item.serviceId._id);
                          const total = item.quantity;
                          const perc = Math.min(100, Math.round((used / total) * 100));
                          const isExhausted = used >= total;
                          return (
                            <div key={item.serviceId._id} className={styles.usageItem}>
                              <div className={styles.usageRow}>
                                <span className={styles.usageServiceName}>{item.serviceId.name}</span>
                                <span className={styles.usageCount} style={{ color: isExhausted ? '#EF4444' : 'var(--blue-600)' }}>
                                  {used} de {total} {isExhausted && '(Esgotado)'}
                                </span>
                              </div>
                              <div className={styles.usageBar}>
                                <div 
                                  className={styles.usageFill} 
                                  style={{ width: `${perc}%`, background: isExhausted ? '#EF4444' : 'var(--blue-600)' }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
                    <span className={styles.historyPrice}>{formatCurrency(appt.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
