import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './EmployeeVales.module.scss';

interface Transaction {
  _id: string;
  type: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  isPaid?: boolean;
}

interface Props {
  employeeId: string;
  unitId?: string;
  onClose?: () => void;
  availableCommissions?: CommissionOption[];
}

interface ConfirmState {
  type: 'discount' | 'delete';
  vale: Transaction;
}

interface CommissionOption {
  _id: string;
  amount: number;
  description: string;
  date: string;
  appointmentId?: {
    _id?: string;
    date?: string;
    startTime?: string;
    clientId?: { name: string } | null;
    serviceId?: { name: string } | null;
  };
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso: string) {
  return iso.split('-').reverse().join('/');
}

function formatBR(n: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function parseBR(s: string) {
  return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

export default function EmployeeVales({ employeeId, unitId, availableCommissions = [] }: Props) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState('');
  const [selectedDiscountDate, setSelectedDiscountDate] = useState('');
  const qc = useQueryClient();

  const { data: vales = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['employee-vales', employeeId],
    queryFn: async () => {
      const { data } = await api.get(`/finance/transactions?employeeId=${employeeId}&category=voucher`);
      return Array.isArray(data) ? data : data.data ?? [];
    },
  });

  const createVale = useMutation({
    mutationFn: (payload: any) => api.post('/finance/transactions', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-vales', employeeId] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      qc.invalidateQueries({ queryKey: ['remuneration-summary'] });
      setShowAdd(false);
      setAmount('');
      setDescription('');
    },
  });

  const deleteVale = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-vales', employeeId] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      qc.invalidateQueries({ queryKey: ['remuneration-summary'] });
      setConfirm(null);
    },
  });

  const discountVale = useMutation({
    mutationFn: ({ id, appointmentId }: { id: string; appointmentId?: string }) =>
      api.patch(`/finance/transactions/${id}`, { isPaid: true, ...(appointmentId ? { appointmentId } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-vales', employeeId] });
      qc.invalidateQueries({ queryKey: ['remuneration-summary'] });
      qc.invalidateQueries({ queryKey: ['commissions-summary'] });
      setConfirm(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    const descriptionText = description.trim();
    createVale.mutate({
      type: 'expense',
      category: 'voucher',
      amount: parseBR(amount),
      description: descriptionText ? `Vale: ${descriptionText}` : 'Vale',
      date,
      employeeId,
      unitId,
    });
  };

  function handleConfirm() {
    if (!confirm) return;
    if (confirm.type === 'discount') {
      const selectedCommission = discountOptions.find(c => c._id === selectedCommissionId);
      discountVale.mutate({
        id: confirm.vale._id,
        appointmentId: selectedCommission?.appointmentId?._id,
      });
    } else {
      deleteVale.mutate(confirm.vale._id);
    }
  }

  function openDiscountConfirm(vale: Transaction) {
    setSelectedCommissionId('');
    setSelectedDiscountDate('');
    setConfirm({ type: 'discount', vale });
  }

  const totalPending = vales.filter(v => !v.isPaid).reduce((sum, v) => sum + v.amount, 0);
  const totalDiscounted = vales.filter(v => v.isPaid).reduce((sum, v) => sum + v.amount, 0);
  const isPending = discountVale.isPending || deleteVale.isPending;
  const discountOptions = availableCommissions.filter(commission => commission.appointmentId?._id);
  const filteredDiscountOptions = selectedDiscountDate
    ? discountOptions.filter(commission => (commission.appointmentId?.date || commission.date) === selectedDiscountDate)
    : discountOptions;

  return (
    <div className={styles.container}>
      {/* Confirm modal */}
      {confirm && (
        <div className={styles.modalOverlay} onClick={() => !isPending && setConfirm(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <p className={styles.modalText}>
              {confirm.type === 'discount'
                ? <>Descontar <strong>{formatCurrency(confirm.vale.amount)}</strong> da comissão do funcionário?</>
                : <>Excluir o vale de <strong>{formatCurrency(confirm.vale.amount)}</strong>? Esta ação não pode ser desfeita.</>
              }
            </p>
            {confirm.type === 'discount' && (
              <div className={styles.modalField}>
                <div className={styles.modalFieldRow}>
                  <div>
                    <label>Filtrar por data</label>
                    <input
                      type="date"
                      value={selectedDiscountDate}
                      onChange={e => {
                        setSelectedDiscountDate(e.target.value);
                        setSelectedCommissionId('');
                      }}
                      disabled={isPending || discountOptions.length === 0}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.clearDateBtn}
                    onClick={() => {
                      setSelectedDiscountDate('');
                      setSelectedCommissionId('');
                    }}
                    disabled={isPending || !selectedDiscountDate}
                  >
                    Limpar
                  </button>
                </div>
                <label>Agendamento para descontar</label>
                <div className={styles.appointmentList}>
                  {filteredDiscountOptions.map(commission => {
                    const appt = commission.appointmentId;
                    const label = appt?.serviceId?.name || commission.description;
                    const client = appt?.clientId?.name;
                    const dateText = appt?.date ? formatDate(appt.date) : formatDate(commission.date);
                    const selected = selectedCommissionId === commission._id;
                    return (
                      <button
                        key={commission._id}
                        type="button"
                        className={`${styles.appointmentOption} ${selected ? styles.appointmentOptionSelected : ''}`}
                        onClick={() => setSelectedCommissionId(commission._id)}
                        disabled={isPending}
                      >
                        <span className={styles.appointmentRadio} />
                        <span className={styles.appointmentInfo}>
                          <span className={styles.appointmentTitle}>{label}</span>
                          <span className={styles.appointmentMeta}>
                            {client ? `${client} · ` : ''}{dateText}{appt?.startTime ? ` · ${appt.startTime}` : ''}
                          </span>
                        </span>
                        <span className={styles.appointmentAmount}>{formatCurrency(commission.amount)}</span>
                      </button>
                    );
                  })}
                </div>
                {discountOptions.length === 0 && (
                  <span className={styles.modalHint}>Nenhuma comissão pendente para vincular este vale.</span>
                )}
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirm(null)} disabled={isPending}>
                Cancelar
              </button>
              <button
                className={confirm.type === 'discount' ? styles.modalConfirmGreen : styles.modalConfirmRed}
                onClick={handleConfirm}
                disabled={isPending || (confirm.type === 'discount' && (!selectedCommissionId || filteredDiscountOptions.length === 0))}
              >
                {isPending ? 'Aguarde...' : confirm.type === 'discount' ? 'Descontar' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h3 className={styles.title}>Vales / Adiantamentos</h3>
        <button className={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancelar' : '+ Novo Vale'}
        </button>
      </div>

      {showAdd && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                onBlur={() => { const n = parseBR(amount); if (n > 0) setAmount(formatBR(n)); }}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
          <div className={styles.field}>
            <label>Descrição / Motivo</label>
            <input
              type="text"
              placeholder="Ex: Adiantamento de salário"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <button className={styles.submitBtn} disabled={createVale.isPending}>
            {createVale.isPending ? 'Salvando...' : 'Registrar Vale'}
          </button>
        </form>
      )}

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>Pendente:</span>
          <span className={styles.totalValue}>{formatCurrency(totalPending)}</span>
        </div>
        {totalDiscounted > 0 && (
          <div className={styles.summaryRow}>
            <span>Descontado da comissão:</span>
            <span className={styles.discountedValue}>{formatCurrency(totalDiscounted)}</span>
          </div>
        )}
      </div>

      <div className={styles.list}>
        {isLoading && <p className={styles.empty}>Carregando vales...</p>}
        {!isLoading && vales.length === 0 && <p className={styles.empty}>Nenhum vale registrado para este funcionário.</p>}
        {vales.map(v => (
          <div key={v._id} className={`${styles.valeRow} ${v.isPaid ? styles.valeRowDiscounted : ''}`}>
            <div className={styles.valeInfo}>
              <div className={styles.valeDescRow}>
                <span className={styles.valeDesc}>{v.description.replace('Vale: ', '')}</span>
                {v.isPaid && <span className={styles.discountedBadge}>Descontado</span>}
              </div>
              <span className={styles.valeDate}>{formatDate(v.date)}</span>
            </div>
            <div className={styles.valeRight}>
              <span className={`${styles.valeAmount} ${v.isPaid ? styles.valeAmountDiscounted : ''}`}>{formatCurrency(v.amount)}</span>
              {!v.isPaid && (
                <button
                  className={styles.discountBtn}
                  onClick={() => openDiscountConfirm(v)}
                  title="Descontar da comissão"
                >
                  − Descontar
                </button>
              )}
              {!v.isPaid && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => setConfirm({ type: 'delete', vale: v })}
                  title="Excluir vale"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
