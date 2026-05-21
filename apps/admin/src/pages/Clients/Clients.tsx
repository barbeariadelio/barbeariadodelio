import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import ClientForm from './ClientForm';
import AppointmentForm from '../../components/AppointmentForm/AppointmentForm';
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
  productsBilled?: boolean;
  products?: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
}

interface Employee {
  _id: string;
  name: string;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  stockQuantity: number;
  category?: string;
}

interface CartProduct {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
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
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
  const unitId = getSelectedUnitId() || (user as any)?.unitId;
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [showForm, setShowForm] = useState(false);
  const [showApptForm, setShowApptForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ pkgId: string; serviceId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editUsedValue, setEditUsedValue] = useState('');
  const [clientTab, setClientTab] = useState<'history' | 'products'>('history');
  const [billingAppt, setBillingAppt] = useState<AppointmentItem | null>(null);
  const [billingPrice, setBillingPrice] = useState('');
  const [billingPaymentMethod, setBillingPaymentMethod] = useState<'money' | 'debit' | 'credit' | 'pix' | 'other'>('pix');
  const [billingRegisterPayment, setBillingRegisterPayment] = useState(true);
  const [billingBillService, setBillingBillService] = useState(true);
  const [billingBillProducts, setBillingBillProducts] = useState(false);
  const [whatsappClient, setWhatsappClient] = useState<{ phone: string; name: string } | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState('');

  // FAB
  const [showFab, setShowFab] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Product sale modal
  const [showProductSale, setShowProductSale] = useState(false);
  const [psDate, setPsDate] = useState(todayISO());
  const [psEmployeeId, setPsEmployeeId] = useState('');
  const [psCart, setPsCart] = useState<CartProduct[]>([]);
  const [psSubmitting, setPsSubmitting] = useState(false);
  const [psError, setPsError] = useState<string | null>(null);

  // Product browser
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserCat, setBrowserCat] = useState<string | null>(null);

  // Comanda
  const [showComanda, setShowComanda] = useState(false);
  const [comandaSelected, setComandaSelected] = useState<Set<string>>(new Set());
  const [comandaPayment, setComandaPayment] = useState<'money' | 'debit' | 'credit' | 'pix' | 'other'>('pix');
  const [comandaSubmitting, setComandaSubmitting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const qc = useQueryClient();

  // Close FAB when clicking outside
  useEffect(() => {
    if (!showFab) return;
    function handler(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setShowFab(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFab]);

  const updateLimitMutation = useMutation({
    mutationFn: ({ clientId, pkgServiceId, serviceId, quantity, used }: { clientId: string; pkgServiceId: string; serviceId: string; quantity: number; used: number }) =>
      api.patch(`/clients/${clientId}/packages/${pkgServiceId}/items/${serviceId}`, { quantity, used }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      qc.invalidateQueries({ queryKey: ['client-detail', selectedId] });
      setEditingItem(null);
      setToast({ message: 'Sessões atualizadas!', type: 'success' });
    },
    onError: () => setToast({ message: 'Erro ao atualizar sessões.', type: 'error' }),
  });

  const billMutation = useMutation({
    mutationFn: ({ apptId, price, paymentMethod, skipBilling, billService, billProducts }: { apptId: string; price: number; paymentMethod: string; skipBilling: boolean; billService: boolean; billProducts: boolean }) =>
      api.patch(`/appointments/${apptId}/status`, { status: 'completed', price, paymentMethod, skipBilling, billService, billProducts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-detail', selectedId] });
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
    setBillingBillService(!appt.isBilled);
    setBillingBillProducts((appt.products?.length ?? 0) > 0 && !appt.productsBilled);
  }

  function openWhatsApp(client: Client) {
    setWhatsappClient({ phone: client.phone!, name: client.name });
    setWhatsappMessage(`Olá, ${client.name.split(' ')[0]}! Tudo bem?`);
  }

  function confirmBilling() {
    if (!billingAppt) return;
    const price = parseFloat(billingPrice.replace(',', '.'));
    const isPackageAppt = !!billingAppt.usedPackageId;
    billMutation.mutate({
      apptId: billingAppt._id,
      price: isNaN(price) ? billingAppt.price : price,
      paymentMethod: billingPaymentMethod,
      skipBilling: isPackageAppt ? !billingRegisterPayment : false,
      billService: isPackageAppt ? billingRegisterPayment : billingBillService,
      billProducts: billingBillProducts,
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

  const { data: clientDetail } = useQuery<Client>({
    queryKey: ['client-detail', selectedId],
    queryFn: async () => {
      const { data } = await api.get(`/clients/${selectedId}`);
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees', unitId],
    queryFn: async () => {
      const { data } = await api.get('/employees');
      return Array.isArray(data) ? data : data.employees ?? [];
    },
    enabled: !!user,
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products', unitId],
    queryFn: async () => {
      const { data } = await api.get('/products');
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user,
  });

  const selectedClient = clientDetail ?? clients.find(c => c._id === selectedId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
    setClientTab('history');
  }, []);

  function calculatePackageUsage(packageServiceId: string, itemServiceId: string) {
    return appointments.filter(a =>
      a.status !== 'cancelled' &&
      a.usedPackageId === packageServiceId &&
      a.serviceId?._id === itemServiceId
    ).length;
  }

  // Product categories derived from allProducts
  const productCategories = useMemo(() => {
    const cats = new Set<string>();
    allProducts.forEach(p => cats.add(p.category || 'Sem categoria'));
    return Array.from(cats).sort();
  }, [allProducts]);

  const productsByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {};
    allProducts.forEach(p => {
      const cat = p.category || 'Sem categoria';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [allProducts]);

  // Comanda items: all unbilled items for selected client
  const comandaItemsList = useMemo(() => {
    const items: Array<{
      key: string;
      type: 'service' | 'products';
      apptId: string;
      label: string;
      sublabel?: string;
      date: string;
      price: number;
    }> = [];
    for (const appt of appointments) {
      if (appt.status === 'cancelled') continue;
      if (!appt.isBilled && appt.serviceId) {
        items.push({
          key: `service:${appt._id}`,
          type: 'service',
          apptId: appt._id,
          label: appt.serviceId.name,
          sublabel: appt.employeeId?.name,
          date: appt.date,
          price: appt.price,
        });
      }
      if ((appt.products?.length ?? 0) > 0 && !appt.productsBilled) {
        const total = appt.products!.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
        items.push({
          key: `products:${appt._id}`,
          type: 'products',
          apptId: appt._id,
          label: appt.products!.map(p => `${p.name} ×${p.quantity}`).join(', '),
          sublabel: appt.employeeId?.name,
          date: appt.date,
          price: total,
        });
      }
    }
    return items;
  }, [appointments]);

  function openComanda() {
    const allKeys = new Set(comandaItemsList.map(i => i.key));
    setComandaSelected(allKeys);
    setComandaPayment('pix');
    setShowComanda(true);
  }

  const comandaTotal = useMemo(() => {
    return comandaItemsList
      .filter(i => comandaSelected.has(i.key))
      .reduce((s, i) => s + i.price, 0);
  }, [comandaItemsList, comandaSelected]);

  async function confirmComanda() {
    if (comandaSelected.size === 0) return;
    setComandaSubmitting(true);
    try {
      const grouped: Record<string, { billService: boolean; billProducts: boolean; price: number }> = {};
      for (const key of comandaSelected) {
        const [type, apptId] = key.split(':');
        if (!grouped[apptId]) grouped[apptId] = { billService: false, billProducts: false, price: 0 };
        const item = comandaItemsList.find(i => i.key === key);
        if (type === 'service') {
          grouped[apptId].billService = true;
          grouped[apptId].price = item?.price ?? 0;
        } else {
          grouped[apptId].billProducts = true;
        }
      }
      await Promise.all(
        Object.entries(grouped).map(([apptId, opts]) =>
          api.patch(`/appointments/${apptId}/status`, {
            status: 'completed',
            price: opts.price,
            paymentMethod: comandaPayment,
            skipBilling: false,
            billService: opts.billService,
            billProducts: opts.billProducts,
          })
        )
      );
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-detail', selectedId] });
      setShowComanda(false);
      setToast({ message: 'Comanda finalizada com sucesso!', type: 'success' });
    } catch {
      setToast({ message: 'Erro ao finalizar comanda.', type: 'error' });
    } finally {
      setComandaSubmitting(false);
    }
  }

  function openProductSale() {
    setPsDate(todayISO());
    setPsEmployeeId(employees[0]?._id ?? '');
    setPsCart([]);
    setPsError(null);
    setShowProductSale(true);
  }

  function addToCart(product: Product) {
    setPsCart(prev => {
      const existing = prev.find(p => p.productId === product._id);
      if (existing) {
        return prev.map(p => p.productId === product._id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, { productId: product._id, name: product.name, price: product.price, quantity: 1, discount: 0 }];
    });
    setShowBrowser(false);
    setBrowserCat(null);
  }

  function removeFromCart(productId: string) {
    setPsCart(prev => prev.filter(p => p.productId !== productId));
  }

  function updateCartItem(productId: string, field: 'quantity' | 'price' | 'discount', value: number) {
    setPsCart(prev => prev.map(p => p.productId === productId ? { ...p, [field]: value } : p));
  }

  async function submitProductSale() {
    if (!selectedClient) return;
    if (psCart.length === 0) { setPsError('Adicione ao menos um produto.'); return; }
    if (!psEmployeeId) { setPsError('Selecione um profissional.'); return; }
    setPsSubmitting(true);
    setPsError(null);
    try {
      await api.post('/appointments', {
        unitId,
        clientId: selectedClient._id,
        employeeId: psEmployeeId,
        date: psDate,
        startTime: nowTime(),
        price: 0,
        status: 'pending',
        products: psCart.map(p => ({
          productId: p.productId,
          name: p.name,
          quantity: p.quantity,
          unitPrice: p.price - p.discount,
        })),
      });
      qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
      setShowProductSale(false);
      setToast({ message: 'Venda de produto registrada!', type: 'success' });
    } catch (err: any) {
      setPsError(err.response?.data?.message || 'Erro ao registrar venda.');
    } finally {
      setPsSubmitting(false);
    }
  }

  const IconCopy = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
  const IconWhatsApp = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;

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
              <div style={{ flex: 1 }}>
                <h2 className={styles.detailName}>{selectedClient.name}</h2>
                {selectedClient.phone && (
                  <div className={styles.detailMetaWrapper}>
                    <p className={styles.detailMeta}>{selectedClient.phone}</p>
                    <button className={styles.copyBtn} onClick={() => copyToClipboard(selectedClient.phone || '', 'phone')} title="Copiar telefone">
                      {copiedField === 'phone' ? <IconCheck /> : <IconCopy />}
                    </button>
                    <button
                      onClick={() => openWhatsApp(selectedClient)}
                      title="Enviar WhatsApp"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', marginLeft: '6px', transition: 'all 0.2s' }}
                    >
                      <IconWhatsApp />
                      WHATSAPP
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

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start', flexShrink: 0 }}>
                {comandaItemsList.length > 0 && (
                  <button className={styles.comandaBtn} onClick={openComanda}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
                    Comanda
                    <span className={styles.comandaBadge}>{comandaItemsList.length}</span>
                  </button>
                )}
                {/* FAB */}
                <div className={styles.fabWrap} ref={fabRef}>
                  {showFab && (
                    <div className={styles.fabMenu}>
                      <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); setShowApptForm(true); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Novo Atendimento
                      </button>
                      <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); openProductSale(); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                        Venda de Produto
                      </button>
                      <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); setToast({ message: 'Em breve: Venda de Pacote', type: 'success' }); }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                        Venda de Pacote
                      </button>
                    </div>
                  )}
                  <button
                    className={`${styles.fabBtn} ${showFab ? styles.fabOpen : ''}`}
                    onClick={() => setShowFab(v => !v)}
                    title="Ações"
                  >
                    <span className={styles.fabPlus}>+</span>
                  </button>
                </div>
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
                                            onKeyDown={e => { if (e.key === 'Escape') setEditingItem(null); }}
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

            {/* ── Tabs ── */}
            <div className={styles.clientTabs}>
              <button
                className={`${styles.clientTab} ${clientTab === 'history' ? styles.clientTabActive : ''}`}
                onClick={() => setClientTab('history')}
              >
                Histórico de Atendimentos
              </button>
              <button
                className={`${styles.clientTab} ${clientTab === 'products' ? styles.clientTabActive : ''}`}
                onClick={() => setClientTab('products')}
              >
                Venda de Produto
                {appointments.some(a => a.products && a.products.length > 0) && (
                  <span style={{ marginLeft: '6px', background: '#111827', color: '#fff', borderRadius: '9px', fontSize: '10px', fontWeight: 700, padding: '1px 6px' }}>
                    {appointments.filter(a => a.products && a.products.length > 0).length}
                  </span>
                )}
              </button>
            </div>

            {/* ── History tab ── */}
            {clientTab === 'history' && (
              <>
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
                        {appt.products && appt.products.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                            {appt.products.map((p, i) => (
                              <span key={i} style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '1px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                                {p.name} x{p.quantity}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={styles.historyRight}>
                        <span className={styles.badge} style={{ background: `${STATUS_COLORS[appt.status]}22`, color: STATUS_COLORS[appt.status], border: `1px solid ${STATUS_COLORS[appt.status]}55` }}>
                          {STATUS_LABELS[appt.status]}
                        </span>
                        {(() => {
                          const hasProds = (appt.products?.length ?? 0) > 0;
                          const fullyBilled = appt.isBilled && (!hasProds || appt.productsBilled);
                          const partiallyBilled = appt.isBilled || (hasProds && appt.productsBilled);
                          const canBillMore = !fullyBilled && appt.status !== 'cancelled';
                          return (
                            <>
                              {fullyBilled && (
                                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#1565C0', background: 'rgba(21,101,192,0.1)', border: '1px solid rgba(21,101,192,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                                  FATURADO
                                </span>
                              )}
                              {!fullyBilled && appt.isBilled && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                                  SERVIÇO FAT.
                                </span>
                              )}
                              {!fullyBilled && appt.productsBilled && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                                  PROD. FAT.
                                </span>
                              )}
                              {canBillMore && (
                                <button onClick={() => openBilling(appt)} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#fff', background: '#1565C0', border: 'none', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer' }}>
                                  {partiallyBilled ? 'FAT. REST.' : 'FATURAR'}
                                </button>
                              )}
                            </>
                          );
                        })()}
                        <div style={{ textAlign: 'right' }}>
                          <span className={styles.historyPrice}>{formatCurrency(appt.price)}</span>
                          {appt.products && appt.products.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '1px' }}>
                              +{formatCurrency(appt.products.reduce((s, p) => s + p.quantity * p.unitPrice, 0))} produtos
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Product sales tab ── */}
            {clientTab === 'products' && (() => {
              const salesAppts = appointments.filter(a => a.products && a.products.length > 0);
              if (salesAppts.length === 0) {
                return <p className={styles.empty}>Nenhuma venda de produto registrada.</p>;
              }
              return (
                <div className={styles.historyList}>
                  {salesAppts.map(appt => {
                    const total = appt.products!.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
                    return (
                      <div key={appt._id} className={styles.historyRow} style={{ alignItems: 'flex-start' }}>
                        <div className={styles.historyInfo}>
                          <span className={styles.historyDate}>{formatDate(appt.date)} — {appt.startTime}</span>
                          <span className={styles.historySub}>{appt.employeeId?.name ?? 'Barbeiro'}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.4rem' }}>
                            {appt.products!.map((p, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: '#6B7280', flexShrink: 0 }}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{p.name}</span>
                                <span style={{ color: '#6B7280' }}>×{p.quantity}</span>
                                <span style={{ color: '#6B7280' }}>·</span>
                                <span style={{ color: '#374151' }}>{formatCurrency(p.unitPrice)} un.</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={styles.historyRight} style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                          {appt.productsBilled ? (
                            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#1565C0', background: 'rgba(21,101,192,0.1)', border: '1px solid rgba(21,101,192,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                              FATURADO
                            </span>
                          ) : (
                            <>
                              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#6B7280', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '1px 6px' }}>
                                PENDENTE
                              </span>
                              {appt.status !== 'cancelled' && (
                                <button onClick={() => openBilling(appt)} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#fff', background: '#1565C0', border: 'none', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer' }}>
                                  FATURAR
                                </button>
                              )}
                            </>
                          )}
                          <span className={styles.historyPrice}>{formatCurrency(total)}</span>
                          <span style={{ fontSize: '11px', color: '#6B7280' }}>sem comissão</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Billing Modal ── */}
      {billingAppt && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setBillingAppt(null); }}
        >
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Finalizar Atendimento</span>
              <button onClick={() => setBillingAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderRadius: '8px', fontSize: '13px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{billingAppt.serviceId?.name ?? 'Serviço'}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                {formatDate(billingAppt.date)} — {billingAppt.startTime} · {billingAppt.employeeId?.name ?? 'Barbeiro'}
              </div>
            </div>

            {billingAppt && (billingAppt.products?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  O que faturar
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: billingAppt.isBilled ? 'default' : 'pointer', opacity: billingAppt.isBilled ? 0.55 : 1 }}>
                    <input type="checkbox" checked={billingAppt.isBilled || billingBillService} disabled={!!billingAppt.isBilled} onChange={e => setBillingBillService(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Serviço: {billingAppt.serviceId?.name ?? 'Serviço'}</span>
                      {billingAppt.isBilled ? <span style={{ color: '#22C55E', fontWeight: 700 }}>✓ Faturado</span> : <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(billingAppt.price)}</span>}
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: billingAppt.productsBilled ? 'default' : 'pointer', opacity: billingAppt.productsBilled ? 0.55 : 1 }}>
                    <input type="checkbox" checked={!!billingAppt.productsBilled || billingBillProducts} disabled={!!billingAppt.productsBilled} onChange={e => setBillingBillProducts(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-primary)' }}>Produtos ({billingAppt.products!.length} {billingAppt.products!.length === 1 ? 'item' : 'itens'})</span>
                      {billingAppt.productsBilled ? <span style={{ color: '#22C55E', fontWeight: 700 }}>✓ Faturado</span> : <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(billingAppt.products!.reduce((s, p) => s + p.quantity * p.unitPrice, 0))}</span>}
                    </div>
                  </label>
                </div>
              </div>
            )}

            {billingAppt && (billingBillService && !billingAppt.isBilled) && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {(billingAppt.products?.length ?? 0) > 0 ? 'Valor do Serviço' : 'Valor Final'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '8px 12px', background: 'var(--bg-base)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>R$</span>
                  <input type="text" value={billingPrice} onChange={e => setBillingPrice(e.target.value.replace(/[^0-9,]/g, ''))} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', fontWeight: 700, background: 'transparent', color: 'var(--text-primary)' }} autoFocus />
                </div>
              </div>
            )}

            {billingAppt.usedPackageId ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6D00" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#FF6D00' }}>Sessão de Pacote</span>
                </div>
                <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', marginBottom: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                    <div onClick={() => setBillingRegisterPayment(v => !v)} style={{ width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0, background: billingRegisterPayment ? 'var(--gold)' : 'var(--border-default)', transition: 'background 0.2s', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ position: 'absolute', top: '3px', left: billingRegisterPayment ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{billingRegisterPayment ? 'Registrar pagamento' : 'Sem cobrança'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {billingRegisterPayment ? 'Gera transação e comissão para o barbeiro' : 'Apenas desconta a sessão do pacote, sem transação'}
                      </div>
                    </div>
                  </label>
                </div>
                {billingRegisterPayment && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>Forma de Pagamento</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {(['money', 'debit', 'credit', 'pix', 'other'] as const).map(pm => (
                        <button key={pm} onClick={() => setBillingPaymentMethod(pm)}
                          style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${billingPaymentMethod === pm ? 'var(--gold)' : 'var(--border-default)'}`, background: billingPaymentMethod === pm ? 'var(--gold-dim)' : 'var(--bg-base)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: billingPaymentMethod === pm ? 'var(--gold)' : 'var(--text-primary)' }}>
                          {pm === 'money' ? 'Dinheiro' : pm === 'debit' ? 'Débito' : pm === 'credit' ? 'Crédito' : pm === 'pix' ? 'Pix' : 'Outro'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px' }}>Forma de Pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['money', 'debit', 'credit', 'pix', 'other'] as const).map(pm => (
                    <button key={pm} onClick={() => setBillingPaymentMethod(pm)}
                      style={{ padding: '8px', borderRadius: '8px', border: `2px solid ${billingPaymentMethod === pm ? 'var(--gold)' : 'var(--border-default)'}`, background: billingPaymentMethod === pm ? 'var(--gold-dim)' : 'var(--bg-base)', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: billingPaymentMethod === pm ? 'var(--gold)' : 'var(--text-primary)' }}>
                      {pm === 'money' ? 'Dinheiro' : pm === 'debit' ? 'Débito' : pm === 'credit' ? 'Crédito' : pm === 'pix' ? 'Pix' : 'Outro'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <button onClick={() => setBillingAppt(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>
                Voltar
              </button>
              <button onClick={confirmBilling} disabled={billMutation.isPending} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: '#080808', fontWeight: 700, cursor: 'pointer', opacity: billMutation.isPending ? 0.7 : 1 }}>
                {billMutation.isPending ? 'Processando...' : 'Confirmar e Concluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── WhatsApp Modal ── */}
      {whatsappClient && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setWhatsappClient(null); }}
        >
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#25D366', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconWhatsApp />
                </div>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Enviar Mensagem</span>
              </div>
              <button onClick={() => setWhatsappClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Mensagem para {whatsappClient.name}
              </label>
              <textarea value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} rows={5}
                style={{ width: '100%', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '14.5px', resize: 'vertical', outline: 'none', lineHeight: 1.5, fontFamily: 'inherit' }}
                autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setWhatsappClient(null)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>
                Cancelar
              </button>
              <button
                onClick={() => {
                  let num = whatsappClient.phone.replace(/\D/g, '');
                  if (!num.startsWith('55')) num = '55' + num;
                  window.open(`https://wa.me/${num}?text=${encodeURIComponent(whatsappMessage)}`, '_blank');
                  setWhatsappClient(null);
                }}
                style={{ flex: 2, padding: '12px', borderRadius: '8px', border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <IconWhatsApp />
                Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Product Sale Modal ── */}
      {showProductSale && createPortal(
        <div className={styles.psOverlay} onClick={e => { if (e.target === e.currentTarget) setShowProductSale(false); }}>
          <div className={styles.psModal}>
            <div className={styles.psHeader}>
              <h2 className={styles.psTitle}>Venda de Produto</h2>
              <button className={styles.psCloseBtn} onClick={() => setShowProductSale(false)}>✕</button>
            </div>
            <div className={styles.psBody}>
              {/* Cliente */}
              <div className={styles.psField}>
                <label className={styles.psLabel}>Cliente</label>
                <div className={styles.psReadOnly}>{selectedClient?.name}</div>
              </div>

              {/* Data + Profissional */}
              <div className={styles.psRow}>
                <div className={styles.psField}>
                  <label className={styles.psLabel}>Data</label>
                  <input type="date" className={styles.psInput} value={psDate} onChange={e => setPsDate(e.target.value)} />
                </div>
                <div className={styles.psField}>
                  <label className={styles.psLabel}>Profissional</label>
                  <select className={styles.psSelect} value={psEmployeeId} onChange={e => setPsEmployeeId(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Cart */}
              <div className={styles.psField}>
                <label className={styles.psLabel}>Produtos</label>
                {psCart.length > 0 && (
                  <div className={styles.psCartList}>
                    {psCart.map(item => (
                      <div key={item.productId} className={styles.psCartItem}>
                        <div className={styles.psCartItemName}>{item.name}</div>
                        <div className={styles.psCartItemControls}>
                          <div className={styles.psCartField}>
                            <span className={styles.psCartFieldLabel}>Qtd</span>
                            <input
                              type="number" min={1} className={styles.psCartInput}
                              value={item.quantity}
                              onChange={e => updateCartItem(item.productId, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                          </div>
                          <div className={styles.psCartField}>
                            <span className={styles.psCartFieldLabel}>Preço R$</span>
                            <input
                              type="number" min={0} step="0.01" className={styles.psCartInput}
                              value={item.price}
                              onChange={e => updateCartItem(item.productId, 'price', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <div className={styles.psCartField}>
                            <span className={styles.psCartFieldLabel}>Desc. R$</span>
                            <input
                              type="number" min={0} step="0.01" className={styles.psCartInput}
                              value={item.discount}
                              onChange={e => updateCartItem(item.productId, 'discount', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                          <button className={styles.psCartRemove} onClick={() => removeFromCart(item.productId)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        <div className={styles.psCartItemTotal}>
                          Total: {formatCurrency((item.price - item.discount) * item.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button className={styles.psAddProductBtn} onClick={() => { setBrowserCat(null); setShowBrowser(true); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Selecionar produto
                </button>
              </div>

              {psCart.length > 0 && (
                <div className={styles.psTotalRow}>
                  <span>Total da venda</span>
                  <span className={styles.psTotalValue}>
                    {formatCurrency(psCart.reduce((s, p) => s + (p.price - p.discount) * p.quantity, 0))}
                  </span>
                </div>
              )}

              {psError && <p className={styles.psError}>{psError}</p>}
            </div>
            <div className={styles.psFooter}>
              <button className={styles.psCancelBtn} onClick={() => setShowProductSale(false)}>Cancelar</button>
              <button className={styles.psSubmitBtn} onClick={submitProductSale} disabled={psSubmitting}>
                {psSubmitting ? 'Registrando...' : 'Registrar Venda'}
              </button>
            </div>
          </div>

          {/* Product Browser */}
          {showBrowser && (
            <div className={styles.browserOverlay} onClick={e => { if (e.target === e.currentTarget) { setShowBrowser(false); setBrowserCat(null); } }}>
              <div className={styles.browserModal}>
                <div className={styles.browserHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {browserCat && (
                      <button className={styles.browserBackBtn} onClick={() => setBrowserCat(null)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                    )}
                    <h3 className={styles.browserTitle}>{browserCat ?? 'Categorias'}</h3>
                  </div>
                  <button className={styles.psCloseBtn} onClick={() => { setShowBrowser(false); setBrowserCat(null); }}>✕</button>
                </div>
                <div className={styles.browserList}>
                  {!browserCat ? (
                    productCategories.length === 0 ? (
                      <p className={styles.browserEmpty}>Nenhum produto cadastrado.</p>
                    ) : productCategories.map(cat => (
                      <button key={cat} className={styles.browserCatItem} onClick={() => setBrowserCat(cat)}>
                        <span className={styles.browserCatName}>{cat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={styles.browserCatCount}>{productsByCategory[cat]?.length ?? 0} itens</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                        </div>
                      </button>
                    ))
                  ) : (
                    (productsByCategory[browserCat] ?? []).map(product => (
                      <button key={product._id} className={styles.browserProductItem} onClick={() => addToCart(product)}>
                        <div className={styles.browserProductInfo}>
                          <span className={styles.browserProductName}>{product.name}</span>
                          <span className={styles.browserProductStock}>{product.stockQuantity} em estoque</span>
                        </div>
                        <span className={styles.browserProductPrice}>{formatCurrency(product.price)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* ── Comanda Modal ── */}
      {showComanda && createPortal(
        <div className={styles.comandaOverlay} onClick={e => { if (e.target === e.currentTarget) setShowComanda(false); }}>
          <div className={styles.comandaModal}>
            <div className={styles.comandaHeader}>
              <div>
                <h2 className={styles.comandaTitle}>Comanda</h2>
                <p className={styles.comandaSubtitle}>{selectedClient?.name}</p>
              </div>
              <button className={styles.psCloseBtn} onClick={() => setShowComanda(false)}>✕</button>
            </div>

            <div className={styles.comandaBody}>
              {comandaItemsList.length === 0 ? (
                <p className={styles.browserEmpty}>Nenhum item pendente para faturar.</p>
              ) : (
                <div className={styles.comandaList}>
                  {comandaItemsList.map(item => {
                    const checked = comandaSelected.has(item.key);
                    return (
                      <label key={item.key} className={`${styles.comandaItem} ${checked ? styles.comandaItemChecked : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setComandaSelected(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(item.key) : next.delete(item.key);
                              return next;
                            });
                          }}
                          className={styles.comandaCheckbox}
                        />
                        <div className={styles.comandaItemContent}>
                          <div className={styles.comandaItemLabel}>
                            {item.type === 'service' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
                            )}
                            <span>{item.label}</span>
                          </div>
                          <div className={styles.comandaItemMeta}>
                            <span>{formatDate(item.date)}</span>
                            {item.sublabel && <span>· {item.sublabel}</span>}
                          </div>
                        </div>
                        <span className={styles.comandaItemPrice}>{formatCurrency(item.price)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.comandaFooter}>
              <div className={styles.comandaSummary}>
                <div className={styles.comandaSummaryRow}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(comandaTotal)}</span>
                </div>
                <div className={styles.comandaSummaryRow}>
                  <span>Descontos</span>
                  <span>R$ 0,00</span>
                </div>
                <div className={`${styles.comandaSummaryRow} ${styles.comandaSummaryTotal}`}>
                  <span>Total</span>
                  <span>{formatCurrency(comandaTotal)}</span>
                </div>
              </div>

              <div className={styles.psField} style={{ marginBottom: '1rem' }}>
                <label className={styles.psLabel}>Forma de Pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {(['money', 'debit', 'credit', 'pix', 'other'] as const).map(pm => (
                    <button key={pm}
                      className={`${styles.pmBtn} ${comandaPayment === pm ? styles.pmBtnActive : ''}`}
                      onClick={() => setComandaPayment(pm)}>
                      {pm === 'money' ? 'Dinheiro' : pm === 'debit' ? 'Débito' : pm === 'credit' ? 'Crédito' : pm === 'pix' ? 'Pix' : 'Outro'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className={styles.comandaContinuarBtn}
                onClick={confirmComanda}
                disabled={comandaSubmitting || comandaSelected.size === 0}
              >
                {comandaSubmitting ? 'Finalizando...' : `Continuar (${formatCurrency(comandaTotal)})`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showApptForm && (
        <AppointmentForm
          onClose={() => setShowApptForm(false)}
          onSuccess={() => {
            setShowApptForm(false);
            qc.invalidateQueries({ queryKey: ['client-appointments', selectedId] });
          }}
        />
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
