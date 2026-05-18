import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import styles from './StaffSchedule.module.scss';

const SLOT_H = 54;
const HEADER_H = 72;

function buildGrid(startHour: number, endHour: number) {
  const totalSlots = (endHour - startHour) * 2;
  const totalH = totalSlots * SLOT_H;
  const timeSlots = Array.from({ length: totalSlots }, (_, i) => {
    const mins = startHour * 60 + i * 30;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  });
  return { totalSlots, totalH, timeSlots };
}

function makeTimeToTop(startHour: number) {
  return (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return Math.max(0, ((h * 60 + m) - startHour * 60) / 30 * SLOT_H);
  };
}

const PALETTES = [
  { bg: 'rgba(21,101,192,0.18)',  border: '#1565C0', text: '#90CAF9', avatar: '#1565C0' },
  { bg: 'rgba(46,125,50,0.18)',   border: '#2E7D32', text: '#A5D6A7', avatar: '#2E7D32' },
  { bg: 'rgba(106,27,154,0.18)',  border: '#6A1B9A', text: '#CE93D8', avatar: '#6A1B9A' },
  { bg: 'rgba(230,81,0,0.18)',    border: '#E65100', text: '#FFCC80', avatar: '#E65100' },
  { bg: 'rgba(0,96,100,0.18)',    border: '#006064', text: '#80DEEA', avatar: '#006064' },
  { bg: 'rgba(136,14,79,0.18)',   border: '#880E4F', text: '#F48FB1', avatar: '#880E4F' },
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
  isBilled?: boolean;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
}

function timeToHeight(s: string, e: string) {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return Math.max(SLOT_H * 0.6, ((eh * 60 + em) - (sh * 60 + sm)) / 30 * SLOT_H - 2);
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
function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 8.38 8.38 0 0 1 3.8.9L21 3z" />
    </svg>
  );
}

function WhatsAppModal({ appt, onClose }: { appt: any, onClose: () => void }) {
  const defaultMsg = `Olá, ${appt.clientId?.name}! Você tem um horário marcado para ${appt.date.split('-').reverse().join('/')} às ${appt.startTime}.\n\n` +
    `${appt.serviceId?.name ?? 'Serviço'}\n\n` +
    `Podemos confirmar o seu horário?\n\n` +
    `Obrigado,\n` +
    `Barbearia do Delio`;

  const [message, setMessage] = useState(defaultMsg);

  const handleSend = () => {
    const phone = appt.clientId?.phone?.replace(/\D/g, '');
    if (!phone) return;
    const msg = encodeURIComponent(message);
    window.open(`https://wa.me/55${phone}?text=${msg}`, '_blank');
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
  onStatusChange: (id: string, status: string, options?: any) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isDeleting: boolean;
  onUpdateAppt?: (id: string, data: any) => void;
}

function ApptModal({ appt, palette, onClose, onStatusChange, onDelete, isPending, isDeleting, onEdit, onUpdateAppt }: ModalProps & { onEdit?: (a: ScheduleAppointment) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isBilling, setIsBilling] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'money' | 'credit' | 'pix' | 'other'>('pix');
  const navigate = useNavigate();

  const dateFmt = format(new Date(appt.date + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR });

  const [localPrice, setLocalPrice] = useState(appt.price?.toString().replace('.', ',') || '0,00');

  useEffect(() => {
    setLocalPrice(appt.price?.toString().replace('.', ',') || '0,00');
  }, [appt.price]);

  const handlePriceBlur = () => {
    const numeric = parseFloat(localPrice.replace(',', '.'));
    if (!isNaN(numeric) && numeric !== appt.price) {
      onUpdateAppt?.(appt._id, { price: numeric });
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ borderTop: `4px solid ${appt.status === 'blocked' ? '#6B7280' : palette.border}` }}>
        {!isBilling ? (
          <>
        <div className={styles.panelHead}>
          <div className={styles.panelActions}>
             <button className={styles.actionIcon} title="Enviar WhatsApp" onClick={() => setShowWhatsApp(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
             <button className={styles.actionIcon} title="Editar" onClick={() => onEdit?.(appt)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
             {!appt.isBilled && <button className={styles.actionIcon} title="Excluir" onClick={() => setConfirmDelete(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>}
             <button className={styles.actionIcon} title="Perfil do Cliente" onClick={() => appt.clientId?._id && navigate(`/clients?id=${appt.clientId._id}`)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
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
              </div>
            </div>

            {(appt as any).notes && (
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                <div className={styles.infoText}>
                  <span className={styles.notesLabel}>Observações</span>
                  <p className={styles.notesContent}>{(appt as any).notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.panelBottom}>
          <button 
            className={styles.faturarBtn}
            onClick={() => setIsBilling(true)}
          >
            FATURAR
          </button>
        </div>

        {appt.status !== 'blocked' && (
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
                <div className={styles.billingField}>
                  <label className={styles.billingLabel}>Valor Final</label>
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
                        id: 'credit',
                        label: 'Cartão',
                        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
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
              </div>
            </div>

            <div className={styles.panelFooter}>
               <div className={styles.billingActions}>
                  <button className={styles.cancelBillingBtn} onClick={() => setIsBilling(false)}>Voltar</button>
                  <button 
                    className={styles.confirmBillingBtn} 
                    disabled={isPending}
                    onClick={() => onStatusChange(appt._id, 'completed', { 
                      price: parseFloat(localPrice.replace(',', '.')), 
                      paymentMethod 
                    })}
                  >
                    {isPending ? 'Processando...' : 'Confirmar e Concluir'}
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
    </div>
  );
}

function BlockModal({ prompt, duration, onDurationChange, onConfirm, onCancel, isPending }: any) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={styles.panel} style={{ maxWidth: 400 }}>
        <div className={styles.panelHead}>
          <span className={styles.panelClient}>Bloquear Horário</span>
          <button className={styles.closeBtn} onClick={onCancel}><XIcon /></button>
        </div>
        <div className={styles.panelBody} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>
            Deseja bloquear a agenda de <strong>{prompt.employeeName}</strong> a partir das <strong>{prompt.time}</strong>?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4B5563' }}>Duração do bloqueio:</label>
            <select
              value={duration}
              onChange={e => onDurationChange(Number(e.target.value))}
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#F9FAFB', fontSize: '0.95rem' }}
            >
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1 hora e 30 minutos</option>
              <option value={120}>2 horas</option>
              <option value={180}>3 horas</option>
              <option value={240}>4 horas</option>
              <option value={480}>O resto do dia (8h)</option>
            </select>
          </div>
        </div>
        <div className={styles.panelFooter} style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #E5E7EB' }}>
          <button onClick={onCancel} disabled={isPending} style={{ padding: '0.5rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#6B7280' }}>Cancelar</button>
          <button onClick={onConfirm} disabled={isPending} style={{ padding: '0.5rem 1rem', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
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
  onUpdateAppt?: (id: string, data: any) => void;
  unitId?: string;
  workingDays?: number[];   // 0=Sun … 6=Sat
  workingHours?: { start: string; end: string; lunchStart?: string; lunchEnd?: string };
}

export default function StaffSchedule({ appointments, employees, selectedDate, onDateChange, onUpdate, onNewAppt, onBack, onEdit, unitId, workingDays, workingHours }: Props) {
  // ── Dynamic grid based on unit working hours ──
  const startHour = workingHours?.start ? parseInt(workingHours.start.split(':')[0], 10) : 8;
  const endHour   = workingHours?.end   ? parseInt(workingHours.end.split(':')[0], 10) + (parseInt(workingHours.end.split(':')[1], 10) > 0 ? 1 : 0) : 21;
  const { totalH: TOTAL_H, timeSlots: TIME_SLOTS } = buildGrid(startHour, Math.max(endHour, startHour + 1));
  const timeToTop = makeTimeToTop(startHour);

  const [selectedAppt, setSelectedAppt] = useState<ScheduleAppointment | null>(null);
  const [blockPrompt, setBlockPrompt] = useState<{ employeeId: string; employeeName: string; time: string } | null>(null);
  const [blockDuration, setBlockDuration] = useState(30);

  const palette = selectedAppt
    ? PALETTES[employees.findIndex(e => e._id === selectedAppt.employeeId?._id) % PALETTES.length] ?? PALETTES[0]
    : PALETTES[0];

  const statusMut = useMutation({
    mutationFn: ({ id, status, options }: { id: string; status: string; options?: any }) =>
      api.patch(`/appointments/${id}/status`, { status, ...options }),
    onSuccess: () => { setSelectedAppt(null); onUpdate?.(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => { setSelectedAppt(null); onUpdate?.(); },
  });

  const blockMut = useMutation({
    mutationFn: (payload: any) => api.post('/appointments', payload),
    onSuccess: () => { setBlockPrompt(null); setBlockDuration(30); onUpdate?.(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/appointments/${id}`, data),
    onSuccess: () => onUpdate?.(),
  });

  function confirmBlock() {
    if (!blockPrompt) return;
    const [h, m] = blockPrompt.time.split(':').map(Number);
    const totalMins = h * 60 + m + blockDuration;
    const endH = Math.floor(totalMins / 60).toString().padStart(2, '0');
    const endM = (totalMins % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;
    
    blockMut.mutate({
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

  /* ── Current time indicator ── */
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to current time when viewing today
  useEffect(() => {
    if (isT && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 160);
    }
  }, [isT, selectedDate]); // re-run when date changes, not every minute

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
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {onBack && (
            <button className={styles.backBtn} onClick={onBack}>
              <ChevL /><span className={styles.hideMobile}>Calendário</span>
            </button>
          )}
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
        <button className={styles.newBtn} onClick={onNewAppt}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className={styles.hideMobile}>Novo Agendamento</span>
          <span className={styles.showMobile}>Novo</span>
        </button>
      </div>

      {/* ── Schedule ── */}
      <div className={styles.scheduleOuter} ref={scrollRef}>
        <div className={styles.grid} style={{ gridTemplateColumns: gridCols }}>

          {/* ── Row 1: Corner + Employee headers ── */}
          <div className={styles.corner} style={{ height: HEADER_H }} />
          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            return (
              <div key={emp._id} className={styles.empHeader} style={{ height: HEADER_H }}>
                <div className={styles.avatar} style={{ background: pal.avatar }}>
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

          {/* ── Row 2: Time column ── */}
          <div className={styles.timeCol} style={{ height: TOTAL_H }}>
            {TIME_SLOTS.map((t, i) => (
              <div key={t} className={`${styles.timeCell} ${i % 2 === 0 ? styles.timeCellHour : ''}`} style={{ height: SLOT_H }}>
                {i % 2 === 0 && <span className={styles.timeLabel}>{t}</span>}
              </div>
            ))}
            {isT && (
              <div className={styles.nowDot} style={{ top: nowTop }} />
            )}
          </div>

          {/* ── Row 2: Employee columns ── */}
          {employees.map((emp, i) => {
            const pal = PALETTES[i % PALETTES.length];
            const appts = byEmployee[emp._id] ?? [];
            const isoDate = format(selectedDate, 'yyyy-MM-dd');
            const isBlockedDay = emp.blockedDays?.includes(isoDate) || emp.vacations?.some(v => isoDate >= v.start && isoDate <= v.end);

            // Unit-level closed day
            const dayOfWeek = selectedDate.getDay();
            const isUnitClosedDay = workingDays != null && !workingDays.includes(dayOfWeek);

            return (
              <div key={emp._id} className={styles.empCol} style={{ height: TOTAL_H }}>
                {TIME_SLOTS.map((t, si) => {
                  const endMins = startHour * 60 + (si + 1) * 30;
                  const endT = `${Math.floor(endMins / 60).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}`;
                  return (
                    <div
                      key={t}
                      className={`${styles.slot} ${si % 2 === 0 ? styles.slotHour : ''}`}
                      style={{ height: SLOT_H, cursor: (isBlockedDay || isUnitClosedDay) ? 'default' : 'pointer' }}
                      data-time={`${t} – ${endT}`}
                      onClick={() => {
                        if (!isBlockedDay && !isUnitClosedDay) {
                          setBlockPrompt({ employeeId: emp._id, employeeName: emp.name.split(' ')[0], time: t });
                        }
                      }}
                    />
                  );
                })}

                {(isBlockedDay || isUnitClosedDay) ? (
                  <div
                    className={styles.lunchBreak}
                    style={{ top: 0, height: TOTAL_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', pointerEvents: 'none' }}
                  >
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, opacity: 0.8 }}>
                      {isUnitClosedDay ? 'FECHADO' : 'FOLGA / INDISPONÍVEL'}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* ── Unit working hours overlays ── */}
                    {workingHours && (
                      <>
                        {timeToTop(workingHours.start) > 0 && (
                          <div className={styles.offHours} style={{ top: 0, height: timeToTop(workingHours.start), pointerEvents: 'none' }} />
                        )}
                        {timeToTop(workingHours.end) < TOTAL_H && (
                          <div className={styles.offHours} style={{ top: timeToTop(workingHours.end), height: TOTAL_H - timeToTop(workingHours.end), pointerEvents: 'none' }} />
                        )}
                        {workingHours.lunchStart && workingHours.lunchEnd && !emp.workSchedule?.lunchStart && (
                          <div
                            className={styles.lunchBreak}
                            style={{ top: timeToTop(workingHours.lunchStart), height: timeToHeight(workingHours.lunchStart, workingHours.lunchEnd), pointerEvents: 'none' }}
                          >
                            <span>ALMOÇO</span>
                          </div>
                        )}
                      </>
                    )}
                    {/* ── Employee work schedule overlays ── */}
                    {emp.workSchedule && (
                      <>
                        {timeToTop(emp.workSchedule.start) > 0 && (
                          <div className={styles.offHours} style={{ top: 0, height: timeToTop(emp.workSchedule.start), pointerEvents: 'none' }} />
                        )}
                        {timeToTop(emp.workSchedule.end) < TOTAL_H && (
                          <div className={styles.offHours} style={{ top: timeToTop(emp.workSchedule.end), height: TOTAL_H - timeToTop(emp.workSchedule.end), pointerEvents: 'none' }} />
                        )}
                        {emp.workSchedule.lunchStart && emp.workSchedule.lunchEnd && (
                          <div
                            className={styles.lunchBreak}
                            style={{ top: timeToTop(emp.workSchedule.lunchStart), height: timeToHeight(emp.workSchedule.lunchStart, emp.workSchedule.lunchEnd), pointerEvents: 'none' }}
                          >
                            <span>ALMOÇO</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {!isBlockedDay && isT && <div className={styles.nowLine} style={{ top: nowTop }} />}
                {!isBlockedDay && appts.map(appt => (
                  <div
                    key={appt._id}
                    className={styles.apptCard}
                    style={{
                      top: timeToTop(appt.startTime),
                      height: timeToHeight(appt.startTime, appt.endTime),
                      background: appt.status === 'blocked' ? '#374151' : pal.bg,
                      borderLeftColor: appt.status === 'blocked' ? '#6B7280' : pal.border,
                      color: appt.status === 'blocked' ? '#E5E7EB' : pal.text,
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedAppt(appt); }}
                  >
                    <div className={styles.apptTime}>{appt.startTime} – {appt.endTime}</div>
                    <div className={styles.apptClient}>{appt.status === 'blocked' ? 'BLOQUEADO' : (appt.clientId?.name ?? '—')}</div>
                    {appt.serviceId?.name && appt.status !== 'blocked' && (
                      <div className={styles.apptService}>{appt.serviceId.name}</div>
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
          onStatusChange={(id, status, options) => statusMut.mutate({ id, status, options })}
          onDelete={(id) => deleteMut.mutate(id)}
          isPending={statusMut.isPending}
          isDeleting={deleteMut.isPending}
          onUpdateAppt={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(a) => {
            setSelectedAppt(null);
            onEdit?.(a);
          }}
        />
      )}

      {blockPrompt && (
        <BlockModal
          prompt={blockPrompt}
          duration={blockDuration}
          onDurationChange={setBlockDuration}
          onConfirm={confirmBlock}
          onCancel={() => setBlockPrompt(null)}
          isPending={blockMut.isPending}
        />
      )}
    </div>
  );
}
