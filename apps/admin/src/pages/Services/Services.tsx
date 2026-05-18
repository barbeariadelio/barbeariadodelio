import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import ServiceForm from './ServiceForm';
import { ConfirmModal } from '@barber/ui';
import styles from './Services.module.scss';
import { addDays, addWeeks, addMonths, addYears, differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PackageItem {
  serviceId: string;
  quantity: number;
}

interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  image?: string;
  isActive: boolean;
  type?: 'single' | 'package';
  showPrice?: boolean;
  showPricePrefix?: boolean;
  packageValidity?: {
    type: 'none' | 'days' | 'weeks' | 'months' | 'years';
    value?: number;
  };
  packageItems?: PackageItem[];
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatValidity(validity?: Service['packageValidity']) {
  if (!validity || validity.type === 'none') return 'Sem prazo de validade';
  const val = validity.value || 1;
  const labels: Record<string, string> = {
    days: val === 1 ? 'Dia' : 'Dias',
    weeks: val === 1 ? 'Semana' : 'Semanas',
    months: val === 1 ? 'Mês' : 'Meses',
    years: val === 1 ? 'Ano' : 'Anos',
  };
  return `${val} ${labels[validity.type] || ''}`;
}

function getPackageExpirationDate(startDate: string | Date, validity?: Service['packageValidity']) {
  if (!validity || validity.type === 'none') return null;
  const start = new Date(startDate);
  const v = validity.value || 1;
  switch (validity.type) {
    case 'days': return addDays(start, v);
    case 'weeks': return addWeeks(start, v);
    case 'months': return addMonths(start, v);
    case 'years': return addYears(start, v);
    default: return null;
  }
}

function getSubscriptionStatus(startDate: string | Date, validity?: Service['packageValidity']) {
  const expDate = getPackageExpirationDate(startDate, validity);
  if (!expDate) return { status: 'ok', label: 'Vitalício', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.1)' };
  
  const diff = differenceInDays(expDate, new Date());
  if (diff < 0) return { status: 'overdue', label: 'Vencido', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
  if (diff <= 7) return { status: 'warning', label: `Vence em ${diff} dia(s)`, color: '#eab308', bg: 'rgba(234,179,8,0.1)' };
  return { status: 'ok', label: `Vence ${format(expDate, 'dd/MM/yyyy')}`, color: 'var(--green-500)', bg: 'rgba(34,197,94,0.1)' };
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface DetailProps {
  svc: Service;
  allServices: Service[];
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  isToggling: boolean;
}

function PackageDashboard({ svc, allServices, onEdit, onToggle, isToggling }: { svc: Service, allServices: Service[], onEdit: () => void, onToggle: () => void, isToggling: boolean }) {
  const packageId = svc._id;
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState<{ client: any; limits: { [key: string]: string } } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  
  const { data: clients = [], isLoading } = useQuery<any[]>({
    queryKey: ['clients-for-package'],
    queryFn: async () => {
      const { data } = await api.get(`/clients`);
      return Array.isArray(data) ? data : data.clients ?? [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (clientId: string) => {
      return api.post(`/clients/${clientId}/packages`, { packageId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients-for-package'] });
      setShowAdd(false);
      setSearch("");
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      return api.delete(`/clients/${clientId}/packages/${packageId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients-for-package'] });
    }
  });

  const updateAllLimitsMutation = useMutation({
    mutationFn: async ({ clientId, limits }: { clientId: string, limits: { [key: string]: string } }) => {
      const promises = (svc.packageItems || []).map(item => {
         const currentVal = limits[item.serviceId] || '';
         const val = currentVal.trim() === '' ? -1 : parseInt(currentVal, 10);
         if (!isNaN(val)) {
            return api.patch(`/clients/${clientId}/packages/${packageId}/items/${item.serviceId}`, { quantity: val < 0 ? null : val });
         }
      });
      return Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients-for-package'] });
      setEditingClient(null);
    }
  });

  const handleSaveLimits = () => {
    if (!editingClient) return;
    updateAllLimitsMutation.mutate({ clientId: editingClient.client._id, limits: editingClient.limits });
  };

  const subscribed = clients.filter(c => c.packages?.some((p: any) => p.packageId?._id === packageId && p.active));
  const available = clients.filter(c => !c.packages?.some((p: any) => p.packageId?._id === packageId && p.active));
  
  const filteredAvailable = available.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search))
  ).slice(0, 10);

  return (
    <div className={`${styles.dashboardCard} ${!svc.isActive ? styles.inactive : ''}`}>
      <div className={styles.dashHeader} style={{ cursor: 'pointer' }} onClick={() => setIsOpen(o => !o)}>
        <div className={styles.dashHeaderMain}>
          <div className={styles.dashTitleRow}>
            <h2 className={styles.dashTitle}>{svc.name}</h2>
            <span
              className={styles.activeBadge}
              style={
                svc.isActive
                  ? { background: 'rgba(34,197,94,.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
                  : { background: 'rgba(90,90,90,0.15)', color: '#5A5A5A', border: '1px solid rgba(90,90,90,0.3)' }
              }
            >
              {svc.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <span className={styles.dashPrice}>{svc.showPricePrefix !== false ? 'A partir de ' : ''}{formatCurrency(svc.price)}</span>
          <p className={styles.dashDesc}>{svc.description}</p>
        </div>
        <div className={styles.dashActions} onClick={e => e.stopPropagation()}>
          <button className={styles.editBtn} onClick={onEdit}>Editar</button>
          <button
            className={`${styles.toggleBtn} ${svc.isActive ? styles.deactivate : styles.activate}`}
            onClick={onToggle}
            disabled={isToggling}
          >
            {'Excluir'}
          </button>
          <button
            onClick={() => setIsOpen(o => !o)}
            style={{
              background: 'none', border: '1px solid var(--border-default)', borderRadius: 6,
              padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', transition: 'all 0.2s',
            }}
            title={isOpen ? 'Recolher' : 'Expandir'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {isOpen && <div className={styles.dashContent}>
        <div className={styles.packageDetails}>
          <h4 className={styles.packageDetailTitle}>Itens inclusos ({formatValidity(svc.packageValidity)})</h4>
          <ul className={styles.packageItemList}>
            {svc.packageItems?.map((item, idx) => {
              const child = allServices.find(s => s._id === item.serviceId);
              return (
                <li key={idx} className={styles.packageItemLi}>
                  <span className={styles.packageItemQtd}>{item.quantity}x</span>
                  <span className={styles.packageItemName}>{child?.name || 'Serviço desconhecido'}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.packageClients}>
          <div className={styles.packageClientsHeader}>
            <h4 className={styles.packageDetailTitle}>Clientes Assinantes ({subscribed.length})</h4>
            {!showAdd && (
              <button className={styles.addClientBtn} onClick={() => setShowAdd(true)}>
                + Adicionar Cliente
              </button>
            )}
          </div>

          {isLoading ? (
            <div className={styles.packageClientsLoading}>Carregando assinantes...</div>
          ) : (
            <>
              {subscribed.length === 0 && !showAdd && (
                <p className={styles.emptyClients}>Nenhum cliente assinou este pacote ainda.</p>
              )}

              {showAdd && (
                <div className={styles.addClientFormContainer}>
                  <div className={styles.addClientSearchRow}>
                    <input 
                      type="text" 
                      placeholder="Buscar cliente por nome ou telefone..." 
                      className={styles.addClientInput}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      autoFocus
                      disabled={assignMutation.isPending}
                    />
                    <button className={styles.cancelAddBtn} onClick={() => { setShowAdd(false); setSearch(""); }}>
                      Cancelar
                    </button>
                  </div>
                  
                  <div className={styles.addClientResults}>
                    {search.length > 0 && filteredAvailable.length === 0 && (
                      <p className={styles.emptyResults}>Nenhum cliente encontrado com "{search}".</p>
                    )}
                    
                    {search.length === 0 && (
                      <p className={styles.emptyResults}>Comece a digitar para buscar...</p>
                    )}
                    
                    {search.length > 0 && filteredAvailable.map(c => (
                      <div 
                        key={c._id} 
                        className={styles.addClientResultItem} 
                        onClick={() => { if (!assignMutation.isPending) assignMutation.mutate(c._id); }}
                      >
                        <span className={styles.resName}>{c.name}</span>
                        <span className={styles.resPhone}>{c.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.groupedSubscribers}>
                {(() => {
                  const groupedClients = subscribed.reduce((acc: any, c: any) => {
                    const sub = c.packages?.find((p: any) => p.packageId?._id === packageId && p.active);
                    const status = getSubscriptionStatus(sub?.startDate || new Date(), svc.packageValidity);
                    if (!acc[status.status]) acc[status.status] = [];
                    acc[status.status].push({ client: c, status, sub });
                    return acc;
                  }, { ok: [], warning: [], overdue: [] });

                  const renderCard = ({ client: c, status, sub }: any) => {
                    const handleCardClick = () => {
                      const limits: any = {};
                      svc.packageItems?.forEach(item => {
                        const customLimit = sub?.itemLimits?.find((l: any) => l.serviceId === item.serviceId);
                        if (customLimit) limits[item.serviceId] = customLimit.quantity.toString();
                      });
                      setEditingClient({ client: c, limits });
                    };

                    const handleWhatsApp = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (!c.phone) return;
                      const msg = status.status === 'overdue' 
                        ? `Olá ${c.name}, tudo bem? Notamos que o seu pacote "${svc.name}" encontra-se vencido. Que tal renovar para continuar aproveitando os nossos serviços?`
                        : `Olá ${c.name}, tudo bem? Passando para lembrar que o seu pacote "${svc.name}" vence em breve (${status.label}). Não esqueça de renovar!`;
                      const url = `https://wa.me/55${c.phone.replace(/\\D/g, '')}?text=${encodeURIComponent(msg)}`;
                      window.open(url, '_blank');
                    };

                    return (
                      <div key={c._id} className={styles.subscriberCard} onClick={handleCardClick} style={{ cursor: 'pointer' }} title="Clique para editar as cotas deste cliente">
                        <div className={styles.subscriberCardHeader}>
                          <div className={styles.subscriberInfo}>
                            <span className={styles.subscriberName}>{c.name}</span>
                            {c.phone && <span className={styles.subscriberPhone}>{c.phone}</span>}
                            <span className={styles.statusPill} style={{ background: status.bg, color: status.color, marginTop: '4px', alignSelf: 'flex-start', fontSize: '0.625rem', padding: '2px 6px' }}>
                              {status.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {(status.status === 'overdue' || status.status === 'warning') && c.phone && (
                              <button 
                                onClick={handleWhatsApp}
                                className={styles.whatsappBtn}
                                title="Enviar lembrete via WhatsApp"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(c._id); }}
                              className={styles.subscriberRemoveBtn}
                              disabled={removeMutation.isPending}
                              title="Cancelar assinatura"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        
                        <div className={styles.subscriberUsageList}>
                      {svc.packageItems?.map((item, idx) => {
                        const childSvc = allServices.find(s => s._id === item.serviceId);
                        
                        const sub = c.packages?.find((p: any) => p.packageId?._id === packageId && p.active);
                        const limitEntry = sub?.itemLimits?.find((l: any) => {
                          const lId = l.serviceId?._id ?? l.serviceId;
                          return lId?.toString() === item.serviceId;
                        });

                        const total = limitEntry?.quantity ?? item.quantity;
                        const used = limitEntry?.used ?? 0;
                        const perc = Math.min(100, Math.round((used / total) * 100));
                        const isExhausted = used >= total;

                        return (
                          <div key={idx} className={styles.subscriberUsageItem}>
                            <div className={styles.subscriberUsageRow}>
                              <span className={styles.subscriberUsageServiceName}>
                                {childSvc?.name || 'Serviço'}
                                {limitEntry && limitEntry.quantity !== item.quantity && <span className={styles.customLimitBadge}>*</span>}
                              </span>
                              <span className={styles.subscriberUsageCount} style={{ color: isExhausted ? '#EF4444' : 'var(--blue-600)' }}>
                                {used} de {total}
                              </span>
                            </div>
                            <div className={styles.subscriberUsageBar}>
                              <div 
                                className={styles.subscriberUsageFill} 
                                style={{ width: `${perc}%`, background: isExhausted ? '#EF4444' : 'var(--blue-600)' }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  );};

                  return (
                    <>
                      {groupedClients.overdue.length > 0 && (
                        <div className={styles.subscriberSection}>
                          <h4 className={styles.sectionTitle} style={{ color: '#EF4444' }}>Em Débito ({groupedClients.overdue.length})</h4>
                          <div className={styles.subscriberGrid}>
                            {groupedClients.overdue.map(renderCard)}
                          </div>
                        </div>
                      )}
                      
                      {groupedClients.warning.length > 0 && (
                        <div className={styles.subscriberSection}>
                          <h4 className={styles.sectionTitle} style={{ color: '#eab308' }}>Vence em Breve ({groupedClients.warning.length})</h4>
                          <div className={styles.subscriberGrid}>
                            {groupedClients.warning.map(renderCard)}
                          </div>
                        </div>
                      )}

                      {groupedClients.ok.length > 0 && (
                        <div className={styles.subscriberSection}>
                          <h4 className={styles.sectionTitle} style={{ color: 'var(--green-500)' }}>Em Dia ({groupedClients.ok.length})</h4>
                          <div className={styles.subscriberGrid}>
                            {groupedClients.ok.map(renderCard)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>}

      {confirmRemoveId && (
        <div className={styles.modalOverlay} onClick={() => setConfirmRemoveId(null)}>
          <div className={styles.modal} style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Remover do Pacote</h2>
              <button className={styles.closeBtn} onClick={() => setConfirmRemoveId(null)}>✕</button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Tem certeza que deseja remover este cliente do pacote? O histórico de sessões será mantido.
              </p>
              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={() => setConfirmRemoveId(null)}>Cancelar</button>
                <button
                  className={styles.submitBtn}
                  style={{ background: '#EF4444' }}
                  disabled={removeMutation.isPending}
                  onClick={() => { removeMutation.mutate(confirmRemoveId); setConfirmRemoveId(null); }}
                >
                  {removeMutation.isPending ? 'Removendo...' : 'Remover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingClient && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setEditingClient(null)}>
          <div className={styles.modal} style={{ maxWidth: '400px' }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Cotas Personalizadas</h2>
              <button className={styles.closeBtn} onClick={() => setEditingClient(null)}>✕</button>
            </div>
            <div className={styles.form} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Defina as cotas mensais para o cliente <strong>{editingClient.client.name}</strong>.
                <br /><br />
                <em>Deixe em branco para usar o limite padrão do pacote.</em>
              </p>
              
              {svc.packageItems?.map((item, idx) => {
                const childSvc = allServices.find(s => s._id === item.serviceId);
                return (
                  <div key={idx} className={styles.field}>
                    <label className={styles.label}>{childSvc?.name} (Padrão: {item.quantity}x)</label>
                    <input 
                      type="number" 
                      min="1" 
                      className={styles.input} 
                      placeholder={`Usar padrão (${item.quantity})`} 
                      value={editingClient.limits[item.serviceId] || ''} 
                      onChange={e => setEditingClient({
                        ...editingClient,
                        limits: { ...editingClient.limits, [item.serviceId]: e.target.value }
                      })} 
                    />
                  </div>
                );
              })}

              <div className={styles.actions} style={{ marginTop: '1rem' }}>
                <button type="button" className={styles.cancelBtn} onClick={() => setEditingClient(null)}>Cancelar</button>
                <button 
                  type="button" 
                  className={styles.submitBtn} 
                  onClick={handleSaveLimits} 
                  disabled={updateAllLimitsMutation.isPending}
                >
                  {updateAllLimitsMutation.isPending ? 'Salvando...' : 'Salvar Cotas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceDetail({ svc, allServices, onClose, onEdit, onToggle, isToggling }: DetailProps) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>

        <div className={styles.panelHead}>
          <div className={styles.panelHeadInfo}>
            <span className={styles.panelTitle}>{svc.name}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        {svc.image && (
          <div className={styles.panelImage}>
            <img src={svc.image} alt={svc.name} className={styles.panelImg} />
          </div>
        )}

        <div className={styles.panelBody}>
          <div className={styles.priceRow}>
            <span className={styles.bigPrice}>{svc.showPricePrefix !== false ? 'A partir de ' : ''}{formatCurrency(svc.price)}</span>
            <span className={styles.durationChip}>
              {svc.type === 'package' ? 'Pacote' : `${svc.durationMinutes} min`}
            </span>
          </div>

          <span
            className={styles.statusPill}
            style={svc.isActive
              ? { background: 'rgba(34,197,94,.1)', color: '#22C55E', borderColor: 'rgba(34,197,94,.3)' }
              : { background: 'rgba(90,90,90,.12)', color: '#5A5A5A', borderColor: 'rgba(90,90,90,.3)' }}
          >
            {svc.isActive ? 'Ativo' : 'Inativo'}
          </span>

          {svc.description && (
            <p className={styles.descBlock}>{svc.description}</p>
          )}
        </div>

        <div className={styles.panelFooter}>
          <button className={styles.editAction} onClick={() => { onClose(); onEdit(); }}>
            Editar serviço
          </button>
          <button
            className={`${styles.toggleAction} ${svc.isActive ? styles.deactivateAction : styles.activateAction}`}
            onClick={onToggle}
            disabled={isToggling}
          >
            {'Excluir'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function Services() {
  const [formTarget, setFormTarget]             = useState<Service | null | 'new'>(null);
  const [detailTarget, setDetailTarget]         = useState<Service | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Service | null>(null);
  const [activeTab, setActiveTab]               = useState<'single' | 'package'>('single');
  const qc = useQueryClient();
  const unitId = getSelectedUnitId() || import.meta.env.VITE_UNIT_ID || '';

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ['services', unitId],
    queryFn: async () => {
      const params = unitId ? `?unitId=${unitId}` : '';
      const { data } = await api.get(`/services${params}`);
      return Array.isArray(data) ? data : data.services ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: (svc: Service) =>
      api.patch(`/services/${svc._id}`, { isActive: !svc.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      setDetailTarget(null);
      setConfirmDeactivate(null);
    },
  });

  const updateDisplay = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; showPrice?: boolean; showPricePrefix?: boolean }) =>
      api.patch(`/services/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const filteredServices = services.filter(svc => (svc.type || 'single') === activeTab);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>SERVIÇOS</h1>
        <button className={styles.newBtn} onClick={() => setFormTarget('new')}>
          + Novo Serviço
        </button>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'single' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('single')}
        >
          Serviços Normais
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'package' ? styles.tabActive : ''}`} 
          onClick={() => setActiveTab('package')}
        >
          Pacotes de Serviços
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Carregando...</p>}
      {!isLoading && filteredServices.length === 0 && (
        <p className={styles.empty}>Nenhum serviço encontrado nesta categoria.</p>
      )}

      {activeTab === 'single' ? (
        <div className={styles.grid}>
          {filteredServices.map(svc => (
            <div
              key={svc._id}
              className={`${styles.card} ${!svc.isActive ? styles.inactive : ''}`}
              onClick={() => setDetailTarget(svc)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.headerMain}>
                  <span className={styles.serviceName}>{svc.name}</span>
                  <span
                    className={styles.activeBadge}
                    style={
                      svc.isActive
                        ? { background: 'rgba(34,197,94,.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
                        : { background: 'rgba(90,90,90,0.15)', color: '#5A5A5A', border: '1px solid rgba(90,90,90,0.3)' }
                    }
                  >
                    {svc.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {svc.image && (
                  <div className={styles.cardThumb}>
                    <img src={svc.image} alt={svc.name} />
                  </div>
                )}
              </div>

              {svc.description && (
                <p className={styles.description}>{svc.description}</p>
              )}

              <div className={styles.meta}>
                <span className={styles.price}>{svc.showPricePrefix !== false ? 'A partir de ' : ''}{formatCurrency(svc.price)}</span>
                <span className={styles.duration}>
                  {`${svc.durationMinutes} min`}
                </span>
              </div>

              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', padding: '0.5rem 0', borderTop: '1px solid var(--border-subtle)', marginTop: '0.25rem' }}>
                <button
                  title="Exibir valor no agendamento online"
                  onClick={() => updateDisplay.mutate({ id: svc._id, showPrice: svc.showPrice === false ? true : false, ...( svc.showPrice !== false ? {} : { showPricePrefix: true }) })}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: 999, padding: '0.2rem 0.6rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', background: svc.showPrice !== false ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)', color: svc.showPrice !== false ? '#22C55E' : 'var(--text-muted)', borderColor: svc.showPrice !== false ? 'rgba(34,197,94,0.35)' : 'var(--border-default)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{svc.showPrice !== false ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}</svg>
                  Exibir preço
                </button>
                {svc.showPrice !== false && (
                  <button
                    title='Exibir "A partir de" antes do valor'
                    onClick={() => updateDisplay.mutate({ id: svc._id, showPricePrefix: svc.showPricePrefix === false ? true : false })}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: 999, padding: '0.2rem 0.6rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', background: svc.showPricePrefix !== false ? 'rgba(59,130,246,0.1)' : 'var(--bg-elevated)', color: svc.showPricePrefix !== false ? '#3B82F6' : 'var(--text-muted)', borderColor: svc.showPricePrefix !== false ? 'rgba(59,130,246,0.35)' : 'var(--border-default)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{svc.showPricePrefix !== false ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}</svg>
                    "A partir de"
                  </button>
                )}
              </div>

              <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                <button className={styles.editBtn} onClick={() => setFormTarget(svc)}>
                  Editar
                </button>
                <button
                  className={`${styles.toggleBtn} ${svc.isActive ? styles.deactivate : styles.activate}`}
                  onClick={() => svc.isActive ? setConfirmDeactivate(svc) : toggleActive.mutate(svc)}
                  disabled={toggleActive.isPending}
                >
                  {'Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.dashboardsList}>
          {filteredServices.map(svc => (
            <PackageDashboard 
              key={svc._id} 
              svc={svc} 
              allServices={services} 
              onEdit={() => setFormTarget(svc)} 
              onToggle={() => svc.isActive ? setConfirmDeactivate(svc) : toggleActive.mutate(svc)} 
              isToggling={toggleActive.isPending} 
            />
          ))}
        </div>
      )}

      {detailTarget && (
        <ServiceDetail
          svc={detailTarget}
          allServices={services}
          onClose={() => setDetailTarget(null)}
          onEdit={() => setFormTarget(detailTarget)}
          onToggle={() => detailTarget.isActive ? setConfirmDeactivate(detailTarget) : toggleActive.mutate(detailTarget)}
          isToggling={toggleActive.isPending}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          title="Excluir serviço?"
          message={`"${confirmDeactivate.name}" será removido dos agendamentos.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => toggleActive.mutate(confirmDeactivate)}
          onCancel={() => setConfirmDeactivate(null)}
          isPending={toggleActive.isPending}
        />
      )}

      {formTarget !== null && (
        <ServiceForm
          service={formTarget === 'new' ? null : formTarget}
          unitId={unitId}
          onClose={() => setFormTarget(null)}
          onSuccess={() => {
            setFormTarget(null);
            qc.invalidateQueries({ queryKey: ['services'] });
          }}
        />
      )}
    </div>
  );
}
