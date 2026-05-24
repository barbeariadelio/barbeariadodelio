import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './StaffSchedule.module.scss';

const SLOT_H = 54;
const HEADER_H = 72;

function buildGrid(startHour: number, endHour: number, slotDuration: number = 30) {
  const slotsPerHour = 60 / slotDuration;
  const totalSlots = (endHour - startHour) * slotsPerHour;
  const totalH = totalSlots * SLOT_H;
  const timeSlots = Array.from({ length: totalSlots }, (_, i) => {
    const mins = startHour * 60 + i * slotDuration;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  });
  return { totalSlots, totalH, timeSlots, slotsPerHour };
}

function makeTimeToTop(startHour: number, slotDuration: number = 30) {
  return (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return Math.max(0, ((h * 60 + m) - startHour * 60) / slotDuration * SLOT_H);
  };
}

const PALETTES = [
  { bg: 'rgba(21,101,192,0.12)',  border: '#1565C0', text: '#1565C0', avatar: '#1565C0' },
  { bg: 'rgba(46,125,50,0.12)',   border: '#2E7D32', text: '#2E7D32', avatar: '#2E7D32' },
  { bg: 'rgba(106,27,154,0.12)',  border: '#6A1B9A', text: '#6A1B9A', avatar: '#6A1B9A' },
  { bg: 'rgba(230,81,0,0.12)',    border: '#E65100', text: '#E65100', avatar: '#E65100' },
  { bg: 'rgba(0,96,100,0.12)',    border: '#006064', text: '#006064', avatar: '#006064' },
  { bg: 'rgba(136,14,79,0.12)',   border: '#880E4F', text: '#880E4F', avatar: '#880E4F' },
];

const STATUS_DOT: Record<string, string> = {
  confirmed: '#22C55E',
  completed: '#1E88E5',
  pending:   '#F59E0B',
  cancelled: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  pending:   'Pendente',
  cancelled: 'Cancelado',
};

export interface ScheduleEmployee {
  _id: string;
  name: string;
  avatar?: string;
  workSchedule?: {
    start: string;
    end: string;
    lunchStart?: string;
    lunchEnd?: string;
  };
  daySchedules?: { day: number; slots: { start: string; end: string }[] }[];
  vacations?: { start: string; end: string }[];
  blockedDays?: string[];
}

export interface ScheduleAppointment {
  _id: string;
  clientId:   { _id?: string; name: string; phone?: string } | null;
  employeeId: { _id: string;  name: string } | null;
  serviceId:  { name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
  notes?: string;
  isBilled?: boolean;
  serviceBilled?: boolean;
  productsBilled?: boolean;
  isPackage?: boolean;
  seriesId?: string;
  usedPackageId?: string;
  source?: 'guest' | 'admin';
  reminderSent?: boolean;
  products?: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
}

function timeToHeight(s: string, e: string, slotDuration: number = 30) {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return Math.max(SLOT_H * 0.6, ((eh * 60 + em) - (sh * 60 + sm)) / slotDuration * SLOT_H - 2);
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function ChevL() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevR() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WhatsAppModal({ appt, onClose, onReminderSent, businessName = 'Barbearia' }: { appt: any, onClose: () => void, onReminderSent?: () => void, businessName?: string }) {
  const defaultMsg = `Olá, ${appt.clientId?.name}! Você tem um horário marcado para ${appt.date.split('-').reverse().join('/')} às ${appt.startTime}.\n\n` +
    `${appt.serviceId?.name ?? 'Serviço'}\n\n` +
    `Podemos confirmar o seu horário?\n\n` +
    `Obrigado,\n` +
    `${businessName}`;

  const [message, setMessage] = useState(defaultMsg);

  const handleSend = () => {
    const phone = appt.clientId?.phone?.replace(/\D/g, '');
    if (!phone) return;
    const msg = encodeURIComponent(message);
    window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
    onReminderSent?.();
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1001 }}>
      <div className={styles.whatsappModal}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Personalizar Mensagem</h2>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        
        <div className={styles.panelBody}>
          <div className={styles.whatsappForm}>
            <div className={styles.billingField}>
              <label className={styles.billingLabel}>Mensagem do WhatsApp</label>
              <textarea 
                className={styles.whatsappTextarea}
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={8}
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className={styles.panelFooter}>
           <div className={styles.billingActions}>
              <button className={styles.cancelBillingBtn} onClick={onClose}>Cancelar</button>
              <button 
                className={styles.confirmBillingBtn} 
                onClick={handleSend}
                style={{ background: '#25D366', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' }}
              >
                Abrir WhatsApp
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

interface ModalProps {
  appt: ScheduleAppointment;
  palette: typeof PALETTES[number];
  onClose: () => void;
  onStatusChange: (id: string, status: string, options?: any) => Promise<void>;
  onDelete: (id: string, mode?: 'single' | 'this-and-future') => Promise<void>;
  isPending: boolean;
  isDeleting: boolean;
  onUpdateAppt?: (id: string, data: any) => Promise<void>;
  onEdit?: (a: ScheduleAppointment) => void;
  onProfileClick?: (clientId: string) => void;
  businessName?: string;
  canBill?: boolean;
  canManageAppointments?: boolean;
}

function ApptModal({
  appt,
  palette,
  onClose,
  onStatusChange,
  onDelete,
  isPending,
  isDeleting,
  onEdit,
  onUpdateAppt,
  onProfileClick,
  businessName,
  canBill = true,
  canManageAppointments = true,
}: ModalProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState(false);
  const [isBilling, setIsBilling] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'money' | 'debit' | 'credit' | 'pix' | 'other'>('pix');

  const dateFmt = format(new Date(appt.date + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const productsTotal = (appt.products || []).reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  const hasProducts = (appt.products?.length ?? 0) > 0;
  const serviceAlreadyBilled = !!appt.isBilled;
  const productsAlreadyBilled = !!appt.productsBilled;

  const [localPrice, setLocalPrice] = useState((appt.price ?? 0).toFixed(2).replace('.', ','));
  const [billService, setBillService] = useState(!serviceAlreadyBilled);
  const [billProducts, setBillProducts] = useState(hasProducts && !productsAlreadyBilled);

  useEffect(() => {
    setLocalPrice((appt.price ?? 0).toFixed(2).replace('.', ','));
  }, [appt.price]);

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ borderTop: `4px solid ${appt.status === 'blocked' ? '#6B7280' : palette.border}` }}>
        {!isBilling ? (
          <>
        <div className={styles.panelHead}>
          <div className={styles.panelActions}>
             {canManageAppointments && <button className={styles.actionIcon} title="Enviar WhatsApp" onClick={() => setShowWhatsApp(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg></button>}
             {canManageAppointments && <button className={styles.actionIcon} title="Editar" onClick={() => onEdit?.(appt)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>}
             {canManageAppointments && !appt.isBilled && !appt.productsBilled && <button className={styles.actionIcon} title="Excluir" onClick={() => appt.seriesId ? setConfirmDeleteSeries(true) : setConfirmDelete(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>}
             {onProfileClick && appt.clientId?._id && <button className={styles.actionIcon} title="Perfil do Cliente" onClick={() => onProfileClick(appt.clientId!._id!)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>}
          </div>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.mainInfo}>
            <h2 className={styles.clientName}>{appt.clientId?.name ?? (appt.status === 'blocked' ? 'Bloqueio de Horário' : 'Cliente')}</h2>
            
            <div className={styles.infoRow}>
              <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
              <div className={styles.infoText}>
                <span>{dateFmt} • {appt.startTime} até {appt.endTime}</span>
                <span className={styles.serviceName}>{appt.serviceId?.name ?? '—'}</span>
                <span className={styles.priceTag}>R$ {appt.price?.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
              <div className={styles.statusSelectWrap}>
                {canManageAppointments ? (
                  <select 
                    className={styles.statusSelect}
                    value={appt.status}
                    onChange={(e) => onStatusChange(appt._id, e.target.value)}
                    disabled={isPending}
                  >
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                    <option value="blocked" disabled>Bloqueado</option>
                  </select>
                ) : (
                  <span className={styles.statusSelect}>{STATUS_LABELS[appt.status] ?? appt.status}</span>
                )}
              </div>
            </div>

            {appt.products && appt.products.length > 0 && (
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                </div>
                <div className={styles.infoText}>
                  <span className={styles.notesLabel}>Produtos vendidos</span>
                  {appt.products.map((p, i) => (
                    <span key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-primary, #111827)' }}>
                      <span>{p.name} <span style={{ color: '#6B7280' }}>×{p.quantity}</span></span>
                      <span style={{ fontWeight: 600 }}>R$ {(p.quantity * p.unitPrice).toFixed(2).replace('.', ',')}</span>
                    </span>
                  ))}
                  <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6B7280', marginTop: '2px', borderTop: '1px solid #F3F4F6', paddingTop: '2px' }}>
                    <span>Sem comissão</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                      R$ {appt.products.reduce((s, p) => s + p.quantity * p.unitPrice, 0).toFixed(2).replace('.', ',')}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {appt.notes && (
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                <div className={styles.infoText}>
                  <span className={styles.notesLabel}>Observações</span>
                  <p className={styles.notesContent}>{appt.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.panelBottom}>
          {(() => {
            const fullyBilled = serviceAlreadyBilled && (!hasProducts || productsAlreadyBilled);
            const partiallyBilled = serviceAlreadyBilled || (hasProducts && productsAlreadyBilled);
            return (
              <>
                {fullyBilled && (
                  <div className={styles.billedBadge}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    FATURADO
                  </div>
                )}
                {!fullyBilled && partiallyBilled && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {serviceAlreadyBilled && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '2px 8px' }}>✓ SERVIÇO FAT.</span>
                    )}
                    {productsAlreadyBilled && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '4px', padding: '2px 8px' }}>✓ PRODUTOS FAT.</span>
                    )}
                  </div>
                )}
                {canBill && !fullyBilled && (
                  <button className={styles.faturarBtn} onClick={() => setIsBilling(true)}>
                    {partiallyBilled ? 'FATURAR RESTANTE' : 'FATURAR'}
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {canManageAppointments && appt.status !== 'blocked' && (
          <div className={styles.panelFooter}>
            <span className={styles.footerLabel}>Alterar status</span>
            <div className={styles.footerBtns}>
              {(['confirmed', 'cancelled'] as const)
                .filter(s => s !== appt.status)
                .filter(s => !(s === 'cancelled' && appt.isBilled))
                .map(s => (
                  <button
                    key={s}
                    className={styles.statusBtn}
                    style={{ color: STATUS_DOT[s], borderColor: STATUS_DOT[s] + '50' }}
                    onClick={() => s === 'cancelled' ? setConfirmCancel(true) : onStatusChange(appt._id, s)}
                    disabled={isPending || isDeleting}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))
              }
            </div>
          </div>
        )}
        </>
        ) : (
          <div className={styles.billingSection}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Finalizar Atendimento</h2>
              <button className={styles.closeBtn} onClick={() => setIsBilling(false)}><XIcon /></button>
            </div>

            <div className={styles.panelBody}>
              <div className={styles.billingForm}>
                {/* What to bill - checkboxes when products exist */}
                {hasProducts && (
                  <div className={styles.billingField}>
                    <label className={styles.billingLabel}>O que faturar</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: serviceAlreadyBilled ? 'default' : 'pointer', opacity: serviceAlreadyBilled ? 0.6 : 1 }}>
                        <input
                          type="checkbox"
                          checked={serviceAlreadyBilled || billService}
                          disabled={serviceAlreadyBilled}
                          onChange={e => setBillService(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: serviceAlreadyBilled ? 'default' : 'pointer', accentColor: '#B8860B' }}
                        />
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--text-primary, #111827)' }}>Serviço: {appt.serviceId?.name ?? 'Serviço'}</span>
                          {serviceAlreadyBilled
                            ? <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '0.75rem' }}>✓ Faturado</span>
                            : <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 600 }}>R$ {(appt.price ?? 0).toFixed(2).replace('.', ',')}</span>
                          }
                        </div>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: productsAlreadyBilled ? 'default' : 'pointer', opacity: productsAlreadyBilled ? 0.6 : 1 }}>
                        <input
                          type="checkbox"
                          checked={productsAlreadyBilled || billProducts}
                          disabled={productsAlreadyBilled}
                          onChange={e => setBillProducts(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: productsAlreadyBilled ? 'default' : 'pointer', accentColor: '#B8860B' }}
                        />
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--text-primary, #111827)' }}>Produtos ({appt.products!.length} {appt.products!.length === 1 ? 'item' : 'itens'})</span>
                          {productsAlreadyBilled
                            ? <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '0.75rem' }}>✓ Faturado</span>
                            : <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 600 }}>R$ {productsTotal.toFixed(2).replace('.', ',')}</span>
                          }
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* Price field - only when billing service and not already billed */}
                {(billService && !serviceAlreadyBilled) && (
                  <div className={styles.billingField}>
                    <label className={styles.billingLabel}>{hasProducts ? 'Valor do Serviço' : 'Valor Final'}</label>
                    <div className={styles.billingInputWrap}>
                      <span>R$</span>
                      <input
                        type="text"
                        className={styles.billingInput}
                        value={localPrice}
                        onChange={e => setLocalPrice(e.target.value.replace(/[^0-9,]/g, ''))}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {appt.usedPackageId ? (
                  <div className={styles.packageNotice}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    <span>Sessão de Pacote</span>
                  </div>
                ) : (
                  <div className={styles.billingField}>
                    <label className={styles.billingLabel}>Forma de Pagamento</label>
                    <div className={styles.paymentGrid}>
                      {[
                        {
                          id: 'money',
                          label: 'Dinheiro',
                          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                        },
                        {
                          id: 'debit',
                          label: 'Débito',
                          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                        },
                        {
                          id: 'credit',
                          label: 'Crédito',
                          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/><circle cx="18" cy="15" r="2"/></svg>
                        },
                        {
                          id: 'pix',
                          label: 'Pix',
                          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        },
                        {
                          id: 'other',
                          label: 'Outro',
                          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                        },
                      ].map(pm => (
                        <button
                          key={pm.id}
                          className={`${styles.paymentBtn} ${paymentMethod === pm.id ? styles.active : ''}`}
                          onClick={() => setPaymentMethod(pm.id as any)}
                        >
                          <span className={styles.pmIcon}>{pm.icon}</span>
                          <span className={styles.pmLabel}>{pm.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panelFooter}>
               <div className={styles.billingActions}>
                  <button className={styles.cancelBillingBtn} onClick={() => setIsBilling(false)}>Voltar</button>
                  <button
                    className={styles.confirmBillingBtn}
                    disabled={isPending || (!billService && !billProducts)}
                    onClick={async () => {
                      const priceVal = (billService && !serviceAlreadyBilled) ? parseFloat(localPrice.replace(',', '.')) : undefined;
                      await onStatusChange(appt._id, 'completed', {
                        price: priceVal,
                        paymentMethod,
                        billService: billService && !serviceAlreadyBilled,
                        billProducts: billProducts && !productsAlreadyBilled,
                      });
                      setIsBilling(false);
                    }}
                  >
                    {isPending ? 'Processando...' : 'Confirmar e Faturar'}
                  </button>
               </div>
            </div>
          </div>
        )}
      </div>

      {showWhatsApp && (
        <WhatsAppModal
          appt={appt}
          onClose={() => setShowWhatsApp(false)}
          businessName={businessName}
          onReminderSent={() => onUpdateAppt?.(appt._id, { reminderSent: true })}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={appt.status === 'blocked' ? 'Remover Bloqueio?' : 'Excluir agendamento?'}
          message={appt.status === 'blocked' ? 'O horário voltará a ficar disponível para agendamento.' : `O agendamento de ${appt.clientId?.name ?? 'cliente'} será excluído permanentemente.`}
          confirmLabel={appt.status === 'blocked' ? 'Remover Bloqueio' : 'Excluir'}
          danger
          onConfirm={() => { onDelete(appt._id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          isPending={isDeleting}
        />
      )}
      {confirmCancel && (
        <ConfirmModal
          title="Cancelar agendamento?"
          message={`O atendimento de ${appt.clientId?.name ?? 'cliente'} será marcado como cancelado.`}
          confirmLabel="Cancelar agendamento"
          danger
          onConfirm={() => { onStatusChange(appt._id, 'cancelled'); setConfirmCancel(false); }}
          onCancel={() => setConfirmCancel(false)}
          isPending={isPending}
        />
      )}
      {confirmDeleteSeries && (
        <SeriesDeleteModal
          apptName={appt.clientId?.name ?? 'cliente'}
          onDeleteSingle={() => { onDelete(appt._id, 'single'); setConfirmDeleteSeries(false); }}
          onDeleteFuture={() => { onDelete(appt._id, 'this-and-future'); setConfirmDeleteSeries(false); }}
          onCancel={() => setConfirmDeleteSeries(false)}
          isPending={isDeleting}
        />
      )}
    </div>
  );
}

function SeriesDeleteModal({ apptName, onDeleteSingle, onDeleteFuture, onCancel, isPending }: {
  apptName: string;
  onDeleteSingle: () => void;
  onDeleteFuture: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()} style={{ zIndex: 1002 }}>
      <div className={styles.panel} style={{ maxWidth: 340 }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>Excluir Agendamento</span>
          <button className={styles.closeBtn} onClick={onCancel}><XIcon /></button>
        </div>
        <div className={styles.panelBody} style={{ padding: '0.5rem 0' }}>
          <button
            onClick={onDeleteSingle}
            disabled={isPending}
            style={{ width: '100%', padding: '1rem 1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.9375rem', color: '#111827', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Remover somente este
          </button>
          <div style={{ height: '1px', background: '#F3F4F6', margin: '0 1rem' }} />
          <button
            onClick={onDeleteFuture}
            disabled={isPending}
            style={{ width: '100%', padding: '1rem 1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.9375rem', color: '#EF4444', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Remover este e os próximos
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotChoiceModal({ prompt, onNewAppt, onBlock, onCancel }: { prompt: { employeeName: string; time: string }; onNewAppt: () => void; onBlock: () => void; onCancel: () => void }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.panel} style={{ maxWidth: 340 }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>{prompt.employeeName} • {prompt.time}</span>
          <button className={styles.closeBtn} onClick={onCancel}><XIcon /></button>
        </div>
        <div className={styles.panelBody} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={onNewAppt}
            style={{ padding: '0.75rem 1rem', background: '#111827', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Agendamento
          </button>
          <button
            onClick={onBlock}
            style={{ padding: '0.75rem 1rem', background: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            Bloquear Horário
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockModal({ prompt, onConfirm, onCancel, isPending }: any) {
  const [startH, startM] = prompt.time.split(':').map(Number);
  const defaultEndMins = startH * 60 + startM + 60;
  const defaultEndTime = `${Math.floor(defaultEndMins / 60).toString().padStart(2, '0')}:${(defaultEndMins % 60).toString().padStart(2, '0')}`;
  const [endTime, setEndTime] = useState(defaultEndTime);

  const inputStyle = { padding: '0.6rem', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#F9FAFB', fontSize: '0.95rem', width: '100%' };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.panel} style={{ maxWidth: 400 }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>Bloquear Horário</span>
          <button className={styles.closeBtn} onClick={onCancel}><XIcon /></button>
        </div>
        <div className={styles.panelBody} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>
            Bloquear agenda de <strong>{prompt.employeeName}</strong>:
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4B5563' }}>Hora de início</label>
              <input type="time" value={prompt.time} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4B5563' }}>Hora de fim</label>
              <input
                type="time"
                value={endTime}
                min={prompt.time}
                onChange={e => setEndTime(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className={styles.panelFooter} style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #E5E7EB' }}>
          <button onClick={onCancel} disabled={isPending} style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#6B7280' }}>Cancelar</button>
          <button onClick={() => onConfirm(endTime)} disabled={isPending || endTime <= prompt.time} style={{ padding: '0.5rem 1rem', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
            {isPending ? 'Bloqueando...' : 'Confirmar Bloqueio'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  appointments: ScheduleAppointment[];
  employees: ScheduleEmployee[];
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  onUpdate?: () => void;
  onNewAppt?: () => void;
  onBack?: () => void;
  onEdit?: (appt: ScheduleAppointment) => void;
  onUpdateAppt?: (id: string, data: any) => Promise<void>;
  unitId?: string;
  workingDays?: number[];
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
  // Handlers for decoupling from API
  onStatusChange: (id: string, status: string, options?: any) => Promise<void>;
  onDelete: (id: string, mode?: 'single' | 'this-and-future') => Promise<void>;
  onBlock: (payload: any) => Promise<void>;
  onNewApptAtSlot?: (employeeId: string, time: string) => void;
  isProcessing?: boolean;
  isDeleting?: boolean;
  onProfileClick?: (clientId: string) => void;
  onEmployeeClick?: (employeeId: string) => void;
  businessName?: string;
  canBill?: boolean;
  canManageAppointments?: boolean;
  slotDuration?: number;
}

export default function StaffSchedule({
  appointments,
  employees,
  selectedDate,
  onDateChange,
  onUpdate,
  onNewAppt,
  onBack,
  onEdit,
  unitId,
  workingDays,
  workingHours,
  onStatusChange,
  onDelete,
  onBlock,
  onNewApptAtSlot,
  isProcessing = false,
  isDeleting = false,
  onUpdateAppt,
  onProfileClick,
  onEmployeeClick,
  businessName,
  canBill = true,
  canManageAppointments = true,
  slotDuration = 30,
}: Props) {
  const startHour = workingHours?.start ? parseInt(workingHours.start.split(':')[0], 10) : 8;
  const endHour   = workingHours?.end   ? parseInt(workingHours.end.split(':')[0], 10) + (parseInt(workingHours.end.split(':')[1], 10) > 0 ? 1 : 0) : 21;
  const { totalH: TOTAL_H, timeSlots: TIME_SLOTS, slotsPerHour } = buildGrid(startHour, Math.max(endHour, startHour + 1), slotDuration);
  const timeToTop = makeTimeToTop(startHour, slotDuration);

  const [selectedAppt, setSelectedAppt] = useState<ScheduleAppointment | null>(null);
  const [blockPrompt, setBlockPrompt] = useState<{ employeeId: string; employeeName: string; time: string } | null>(null);
  const [slotMenu, setSlotMenu] = useState<{ employeeId: string; employeeName: string; time: string } | null>(null);

  const palette = selectedAppt
    ? PALETTES[employees.findIndex(e => e._id === selectedAppt.employeeId?._id) % PALETTES.length] ?? PALETTES[0]
    : PALETTES[0];

  function confirmBlock(endTime: string) {
    if (!canManageAppointments) return;
    if (!blockPrompt) return;
    onBlock({
      employeeId: blockPrompt.employeeId,
      unitId,
      date: format(selectedDate, 'yyyy-MM-dd'),
      startTime: blockPrompt.time,
      endTime,
      status: 'blocked',
      price: 0
    });
  }

  const isT = isToday(selectedDate);
  const dateLabel = format(selectedDate, "EEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const shortDateLabel = format(selectedDate, "dd/MM/yy");

  const scrollRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const nowTop = useMemo(() => {
    const h = now.getHours();
    const m = now.getMinutes();
    return timeToTop(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }, [now]);

  useEffect(() => {
    if (isT && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 160);
    }
  }, [isT, selectedDate]);

  const byEmployee = useMemo(() => {
    const map: Record<string, ScheduleAppointment[]> = {};
    for (const a of appointments) {
      const eid = a.employeeId?._id ?? '__none__';
      (map[eid] ??= []).push(a);
    }
    return map;
  }, [appointments]);

  const cols = employees.length || 1;
  const gridCols = `56px repeat(${cols}, minmax(150px, 1fr))`;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button className={styles.datePickerBtn} onClick={() => dateInputRef.current?.showPicker()} title="Escolher data">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <input
              ref={dateInputRef}
              className={styles.dateInput}
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={e => e.target.value && onDateChange(new Date(`${e.target.value}T12:00:00`))}
              tabIndex={-1}
            />
          </button>
          <button
            className={`${styles.todayBtn} ${isT ? styles.todayActive : ''}`}
            onClick={() => onDateChange(new Date())}
          >
            <span className={styles.hideMobile}>Hoje</span>
            <span className={styles.showMobile}>H</span>
          </button>
          <div className={styles.navGroup}>
            <button className={styles.navBtn} onClick={() => onDateChange(subDays(selectedDate, 1))}><ChevL /></button>
            <button className={styles.navBtn} onClick={() => onDateChange(addDays(selectedDate, 1))}><ChevR /></button>
          </div>
          <span className={styles.dateLabel}>
            <span className={styles.hideMobile}>{dateLabel}</span>
            <span className={styles.showMobile}>{shortDateLabel}</span>
          </span>
        </div>
        {canManageAppointments && (
          <button className={styles.newBtn} onClick={onNewAppt}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className={styles.hideMobile}>Novo Agendamento</span>
            <span className={styles.showMobile}>Novo</span>
          </button>
        )}
      </div>

      <div className={styles.scheduleOuter} ref={scrollRef}>
        <div className={styles.grid} style={{ gridTemplateColumns: gridCols }}>
          <div className={styles.corner} style={{ height: HEADER_H }} />
          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            return (
              <div key={emp._id} className={styles.empHeader} style={{ height: HEADER_H }}>
                <div
                  className={styles.avatar}
                  style={{ background: pal.avatar, cursor: onEmployeeClick ? 'pointer' : 'default' }}
                  title={onEmployeeClick ? `Ver perfil de ${emp.name}` : undefined}
                  onClick={() => onEmployeeClick?.(emp._id)}
                >
                  {emp.avatar ? (
                    <img src={emp.avatar} alt={emp.name} className={styles.avatarImg} />
                  ) : (
                    initials(emp.name)
                  )}
                </div>
                <span className={styles.empName}>{emp.name.split(' ')[0]}</span>
              </div>
            );
          })}
          {employees.length === 0 && <div className={styles.corner} style={{ height: HEADER_H }} />}

          <div className={styles.timeCol} style={{ height: TOTAL_H }}>
            {TIME_SLOTS.map((t, i) => (
              <div key={t} className={`${styles.timeCell} ${i % slotsPerHour === 0 ? styles.timeCellHour : ''}`} style={{ height: SLOT_H }}>
                {i % slotsPerHour === 0 && <span className={styles.timeLabel}>{t}</span>}
              </div>
            ))}
            {isT && (
              <div className={styles.nowDot} style={{ top: nowTop }} />
            )}
          </div>

          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            const appts = byEmployee[emp._id] ?? [];
            const isoDate = format(selectedDate, 'yyyy-MM-dd');
            const isBlockedDay = emp.blockedDays?.includes(isoDate) || emp.vacations?.some(v => isoDate >= v.start && isoDate <= v.end);
            const dayOfWeek = selectedDate.getDay();
            const isUnitClosedDay = workingDays != null && !workingDays.includes(dayOfWeek);

            // Per-day employee schedule for current weekday
            const empDaySchedule = emp.daySchedules?.length
              ? (emp.daySchedules.find(ds => ds.day === dayOfWeek) ?? null)
              : null;
            const isOffDay = (emp.daySchedules?.length ?? 0) > 0 && !empDaySchedule;
            const fullyBlocked = isBlockedDay || isOffDay;

            return (
              <div key={emp._id} className={styles.empCol} style={{ height: TOTAL_H }}>
                {TIME_SLOTS.map((t, si) => {
                  const endMins = startHour * 60 + (si + 1) * slotDuration;
                  const endT = `${Math.floor(endMins / 60).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}`;
                  return (
                    <div
                      key={t}
                      className={`${styles.slot} ${si % slotsPerHour === 0 ? styles.slotHour : ''}`}
                      style={{ height: SLOT_H, cursor: (fullyBlocked || isUnitClosedDay || !canManageAppointments) ? 'default' : 'pointer' }}
                      data-time={`${t} – ${endT}`}
                      onClick={() => {
                        if (canManageAppointments && !fullyBlocked && !isUnitClosedDay) {
                          setSlotMenu({ employeeId: emp._id, employeeName: emp.name.split(' ')[0], time: t });
                        }
                      }}
                    />
                  );
                })}

                {(fullyBlocked || isUnitClosedDay) ? (
                  <div className={styles.lunchBreak} style={{ top: 0, height: TOTAL_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, opacity: 0.8 }}>
                      {isUnitClosedDay ? 'FECHADO' : 'FOLGA / INDISPONÍVEL'}
                    </span>
                  </div>
                ) : (
                  <>
                    {empDaySchedule ? (
                      // Per-day schedule overrides unit working hours
                      (() => {
                        const sortedSlots = [...empDaySchedule.slots].sort((a, b) => a.start.localeCompare(b.start));
                        const firstStart = sortedSlots[0]?.start;
                        const lastEnd = sortedSlots[sortedSlots.length - 1]?.end;
                        return (
                          <>
                            {firstStart && timeToTop(firstStart) > 0 && (
                              <div className={styles.offHours} style={{ top: 0, height: timeToTop(firstStart), pointerEvents: 'none' }} />
                            )}
                            {lastEnd && timeToTop(lastEnd) < TOTAL_H && (
                              <div className={styles.offHours} style={{ top: timeToTop(lastEnd), height: TOTAL_H - timeToTop(lastEnd), pointerEvents: 'none' }} />
                            )}
                            {sortedSlots.slice(0, -1).map((slot, idx) => {
                              const gapTop = timeToTop(slot.end);
                              const gapHeight = timeToTop(sortedSlots[idx + 1].start) - gapTop;
                              return gapHeight > 0 ? (
                                <div key={idx} className={styles.lunchBreak} style={{ top: gapTop, height: gapHeight, pointerEvents: 'none' }}>
                                  <span>ALMOÇO</span>
                                </div>
                              ) : null;
                            })}
                          </>
                        );
                      })()
                    ) : emp.workSchedule ? (
                      <>
                        {timeToTop(emp.workSchedule.start) > 0 && (
                          <div className={styles.offHours} style={{ top: 0, height: timeToTop(emp.workSchedule.start), pointerEvents: 'none' }} />
                        )}
                        {timeToTop(emp.workSchedule.end) < TOTAL_H && (
                          <div className={styles.offHours} style={{ top: timeToTop(emp.workSchedule.end), height: TOTAL_H - timeToTop(emp.workSchedule.end), pointerEvents: 'none' }} />
                        )}
                        {emp.workSchedule.lunchStart && emp.workSchedule.lunchEnd && (
                          <div className={styles.lunchBreak} style={{ top: timeToTop(emp.workSchedule.lunchStart), height: timeToHeight(emp.workSchedule.lunchStart, emp.workSchedule.lunchEnd, slotDuration), pointerEvents: 'none' }}>
                            <span>ALMOÇO</span>
                          </div>
                        )}
                      </>
                    ) : workingHours ? (
                      <>
                        {timeToTop(workingHours.start) > 0 && (
                          <div className={styles.offHours} style={{ top: 0, height: timeToTop(workingHours.start), pointerEvents: 'none' }} />
                        )}
                        {timeToTop(workingHours.end) < TOTAL_H && (
                          <div className={styles.offHours} style={{ top: timeToTop(workingHours.end), height: TOTAL_H - timeToTop(workingHours.end), pointerEvents: 'none' }} />
                        )}
                        {workingHours.lunchStart && workingHours.lunchEnd && (
                          <div className={styles.lunchBreak} style={{ top: timeToTop(workingHours.lunchStart), height: timeToHeight(workingHours.lunchStart, workingHours.lunchEnd, slotDuration), pointerEvents: 'none' }}>
                            <span>ALMOÇO</span>
                          </div>
                        )}
                      </>
                    ) : null}
                  </>
                )}

                {!fullyBlocked && isT && <div className={styles.nowLine} style={{ top: nowTop }} />}
                {!fullyBlocked && appts.map(appt => (
                  <div
                    key={appt._id}
                    className={styles.apptCard}
                    style={{
                      top: timeToTop(appt.startTime),
                      height: timeToHeight(appt.startTime, appt.endTime, slotDuration),
                      background: appt.status === 'blocked' ? '#374151' : pal.bg,
                      borderLeftColor: appt.status === 'blocked' ? '#6B7280' : pal.border,
                      color: appt.status === 'blocked' ? '#E5E7EB' : pal.text,
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                  >
                    <div className={styles.apptCardHeader}>
                      <div className={styles.apptTime}>{appt.startTime} – {appt.endTime}</div>
                      <div className={styles.apptIcons}>
                        {/* Plane Icon — só aparece quando lembrete foi enviado */}
                        {appt.reminderSent && (
                          <svg className={styles.iconSm} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Lembrete enviado</title><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        )}
                        
                        {/* Globe Icon (Booked Online - only for guest bookings) */}
                        {appt.source === 'guest' && (
                          <svg className={styles.iconSm} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        )}

                        {/* Checks */}
                        <div className={styles.checkGroup}>
                          {/* First Check: Confirmed or better */}
                          {(appt.status === 'confirmed' || appt.status === 'completed') && (
                             <svg className={styles.iconCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                          {/* Second Check: Billed */}
                          {appt.isBilled && (
                             <svg className={styles.iconCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" style={{ marginLeft: -6 }}><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.apptClient}>
                      {appt.status === 'blocked' ? 'BLOQUEADO' : (appt.clientId?.name ?? '—')}
                    </div>
                    
                    {appt.serviceId?.name && appt.status !== 'blocked' && (
                      <div className={styles.apptService} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.serviceId.name}</span>
                        {appt.products && appt.products.length > 0 && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7, flexShrink: 0 }}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                        )}
                      </div>
                    )}

                    <span className={styles.statusDot} style={{ background: STATUS_DOT[appt.status] }} />
                  </div>
                ))}
              </div>
            );
          })}

          {employees.length === 0 && (
            <div className={styles.emptyCol} style={{ height: TOTAL_H }}>
              <span>Nenhum funcionário cadastrado.</span>
            </div>
          )}
        </div>
      </div>

      {selectedAppt && (
        <ApptModal
          appt={selectedAppt}
          palette={palette}
          onClose={() => setSelectedAppt(null)}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          isPending={isProcessing}
          isDeleting={isDeleting}
          onUpdateAppt={onUpdateAppt}
          onProfileClick={onProfileClick}
          businessName={businessName}
          canBill={canBill}
          canManageAppointments={canManageAppointments}
          onEdit={(a) => {
            setSelectedAppt(null);
            onEdit?.(a);
          }}
        />
      )}

      {canManageAppointments && slotMenu && (
        <SlotChoiceModal
          prompt={slotMenu}
          onNewAppt={() => {
            onNewApptAtSlot?.(slotMenu.employeeId, slotMenu.time);
            setSlotMenu(null);
          }}
          onBlock={() => {
            setBlockPrompt({ employeeId: slotMenu.employeeId, employeeName: slotMenu.employeeName, time: slotMenu.time });
            setSlotMenu(null);
          }}
          onCancel={() => setSlotMenu(null)}
        />
      )}

      {blockPrompt && (
        <BlockModal
          prompt={blockPrompt}
          onConfirm={confirmBlock}
          onCancel={() => setBlockPrompt(null)}
          isPending={isProcessing}
        />
      )}
    </div>
  );
}
