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
}

interface ConfirmState {
  type: 'discount' | 'delete';
  vale: Transaction;
}

interface CreateValePayload {
  type: 'expense';
  category: 'voucher';
  amount: number;
  description: string;
  date: string;
  employeeId: string;
  unitId?: string;
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

export default function EmployeeVales({ employeeId, unitId }: Props) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const qc = useQueryClient();

  const { data: vales = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['employee-vales', employeeId, unitId],
    queryFn: async () => {
      const params = new URLSearchParams({ employeeId, category: 'voucher' });
      if (unitId) params.set('unitId', unitId);
      const { data } = await api.get(`/finance/transactions?${params.toString()}`);
      return Array.isArray(data) ? data : data.data ?? [];
    },
  });

  const invalidateFinance = () => {
    qc.invalidateQueries({ queryKey: ['employee-vales', employeeId, unitId] });
    qc.invalidateQueries({ queryKey: ['finance-summary'] });
    qc.invalidateQueries({ queryKey: ['commissions-summary'] });
    qc.invalidateQueries({ queryKey: ['remuneration-summary'] });
  };

  const createVale = useMutation({
    mutationFn: (payload: CreateValePayload) => api.post('/finance/transactions', payload),
    onSuccess: () => {
      invalidateFinance();
      setShowAdd(false);
      setAmount('');
      setDescription('');
    },
  });

  const deleteVale = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/transactions/${id}`),
    onSuccess: () => {
      invalidateFinance();
      setConfirm(null);
    },
  });

  const discountVale = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/finance/transactions/${id}`, { isPaid: true, appointmentId: null }),
    onSuccess: () => {
      invalidateFinance();
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
      discountVale.mutate(confirm.vale._id);
    } else {
      deleteVale.mutate(confirm.vale._id);
    }
  }

  const totalPending = vales.filter(v => !v.isPaid).reduce((sum, v) => sum + v.amount, 0);
  const totalDiscounted = vales.filter(v => v.isPaid).reduce((sum, v) => sum + v.amount, 0);
  const isPending = discountVale.isPending || deleteVale.isPending;

  return (
    <div className={styles.container}>
      {confirm && (
        <div className={styles.modalOverlay} onClick={() => !isPending && setConfirm(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <p className={styles.modalText}>
              {confirm.type === 'discount'
                ? <>Descontar <strong>{formatCurrency(confirm.vale.amount)}</strong> do pagamento semanal do funcionario?</>
                : <>Excluir o vale de <strong>{formatCurrency(confirm.vale.amount)}</strong>? Esta acao nao pode ser desfeita.</>
              }
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirm(null)} disabled={isPending}>
                Cancelar
              </button>
              <button
                className={confirm.type === 'discount' ? styles.modalConfirmGreen : styles.modalConfirmRed}
                onClick={handleConfirm}
                disabled={isPending}
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
            <label>Descricao / Motivo</label>
            <input
              type="text"
              placeholder="Ex: Adiantamento de salario"
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
            <span>Descontado da semana:</span>
            <span className={styles.discountedValue}>{formatCurrency(totalDiscounted)}</span>
          </div>
        )}
      </div>

      <div className={styles.list}>
        {isLoading && <p className={styles.empty}>Carregando vales...</p>}
        {!isLoading && vales.length === 0 && <p className={styles.empty}>Nenhum vale registrado para este funcionario.</p>}
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
                  onClick={() => setConfirm({ type: 'discount', vale: v })}
                  title="Descontar da semana"
                >
                  - Descontar
                </button>
              )}
              {!v.isPaid && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => setConfirm({ type: 'delete', vale: v })}
                  title="Excluir vale"
                >
                  x
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
