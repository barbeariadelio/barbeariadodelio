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
  const unitId = localStorage.getItem('selectedUnitId') || import.meta.env.VITE_UNIT_ID || (user as any)?.unitId;
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsAppMsg, setWhatsAppMsg] = useState('');
  const [showPackageModal, setShowPackageModal] = useState(false);
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

  const { data: availablePackages = [] } = useQuery<any[]>({
    queryKey: ['available-packages', unitId],
    queryFn: async () => {
      const { data } = await api.get('/services?type=package');
      return Array.isArray(data) ? data : data.services ?? [];
    },
    enabled: !!unitId,
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

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function calculateMonthlyUsage(serviceId: string) {
    return appointments.filter(a =>
      a.status === 'completed' &&
      a.date.startsWith(currentMonthPrefix) &&
      a.serviceId?._id === serviceId
    ).length;
  }

  const IconCopy = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
  const IconWhatsApp = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  const IconPackage = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

  function openWhatsApp(phone: string, clientName: string) {
    const defaultMsg = `Olá ${clientName}! Aqui é da Barbearia do Délio. Tudo bem?`;
    setWhatsAppMsg(defaultMsg);
    setShowWhatsApp(true);
  }

  function sendWhatsApp() {
    if (!selectedClient?.phone) return;
    const digits = selectedClient.phone.replace(/\D/g, '');
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
    const encoded = encodeURIComponent(whatsAppMsg);
    window.open(`https://wa.me/${fullNumber}?text=${encoded}`, '_blank');
    setShowWhatsApp(false);
  }

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
                    <button className={styles.whatsAppBtn} onClick={() => openWhatsApp(selectedClient.phone!, selectedClient.name)} title="Enviar WhatsApp">
                      <IconWhatsApp />
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

            <div className={styles.clientPackages}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.historyTitle}>Pacotes e Assinaturas (Uso no mês atual)</h3>
                <button className={styles.addPackageBtn} onClick={() => setShowPackageModal(true)}>
                  + Adicionar Pacote
                </button>
              </div>
              
              {(!selectedClient.packages || selectedClient.packages.filter(p => p.active && p.packageId).length === 0) ? (
                <p className={styles.emptySmall}>Este cliente não possui pacotes ativos.</p>
              ) : (
                <div className={styles.packageList}>
                  {selectedClient.packages.filter(p => p.active && p.packageId).map(pkg => (
                    <div key={pkg._id} className={styles.packageCard}>
                      <div className={styles.packageCardHead}>
                        <h4 className={styles.packageName}>{pkg.packageId.name}</h4>
                        <span className={styles.packageBadge}>Ativo</span>
                      </div>
                      <div className={styles.packageUsage}>
                        {pkg.packageId.packageItems.map(item => {
                          const used = calculateMonthlyUsage(item.serviceId._id);
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
              )}
            </div>

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

      {showWhatsApp && (
        <div className={styles.whatsAppOverlay} onClick={e => e.target === e.currentTarget && setShowWhatsApp(false)}>
          <div className={styles.whatsAppModal}>
            <div className={styles.whatsAppHeader}>
              <div className={styles.whatsAppHeaderLeft}>
                <IconWhatsApp />
                <h3>Enviar WhatsApp</h3>
              </div>
              <button className={styles.whatsAppClose} onClick={() => setShowWhatsApp(false)}>✕</button>
            </div>
            <div className={styles.whatsAppBody}>
              <label>Mensagem para {selectedClient?.name}</label>
              <textarea
                className={styles.whatsAppTextarea}
                value={whatsAppMsg}
                onChange={e => setWhatsAppMsg(e.target.value)}
                rows={4}
              />
            </div>
            <div className={styles.whatsAppActions}>
              <button className={styles.whatsAppCancelBtn} onClick={() => setShowWhatsApp(false)}>Cancelar</button>
              <button className={styles.whatsAppSendBtn} onClick={sendWhatsApp}>
                <IconWhatsApp /> Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {showPackageModal && (
        <div className={styles.whatsAppOverlay} onClick={() => setShowPackageModal(false)}>
          <div className={styles.whatsAppModal}>
            <div className={styles.whatsAppHeader}>
              <div className={styles.whatsAppHeaderLeft}>
                <IconPackage />
                <h3>Adicionar Pacote para {selectedClient?.name}</h3>
              </div>
              <button className={styles.whatsAppClose} onClick={() => setShowPackageModal(false)}>✕</button>
            </div>
            <div className={styles.whatsAppBody}>
              <label>Selecione um Pacote Disponível</label>
              {availablePackages.length === 0 ? (
                <p className={styles.empty}>Nenhum pacote cadastrado no sistema.</p>
              ) : (
                <div className={styles.packageSelectionList}>
                  {availablePackages.map(pkg => (
                    <div 
                      key={pkg._id} 
                      className={styles.packageOption}
                      onClick={async () => {
                        try {
                          await api.post(`/clients/${selectedId}/packages`, { packageId: pkg._id });
                          setToast({ message: `Pacote "${pkg.name}" atribuído com sucesso!`, type: 'success' });
                          qc.invalidateQueries({ queryKey: ['clients'] });
                          setShowPackageModal(false);
                        } catch (err: any) {
                          setToast({ message: err.response?.data?.message || 'Erro ao atribuir pacote', type: 'error' });
                        }
                      }}
                    >
                      <div className={styles.packageOptionInfo}>
                        <span className={styles.packageOptionName}>{pkg.name}</span>
                        <span className={styles.packageOptionPrice}>{formatCurrency(pkg.price)}</span>
                      </div>
                      <span className={styles.packageOptionAdd}>Atribuir ›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.whatsAppActions}>
              <button className={styles.whatsAppCancelBtn} onClick={() => setShowPackageModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
