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
}

interface Props {
  employeeId: string;
  unitId?: string;
  onClose?: () => void;
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
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    createVale.mutate({
      type: 'expense',
      category: 'voucher',
      amount: parseBR(amount),
      description: `Vale: ${description}`,
      date,
      employeeId,
      unitId,
    });
  };

  const total = vales.reduce((sum, v) => sum + v.amount, 0);

  return (
    <div className={styles.container}>
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
              required 
            />
          </div>
          <button className={styles.submitBtn} disabled={createVale.isPending}>
            {createVale.isPending ? 'Salvando...' : 'Registrar Vale'}
          </button>
        </form>
      )}

      <div className={styles.summary}>
        <span>Total em vales:</span>
        <span className={styles.totalValue}>{formatCurrency(total)}</span>
      </div>

      <div className={styles.list}>
        {isLoading && <p className={styles.empty}>Carregando vales...</p>}
        {!isLoading && vales.length === 0 && <p className={styles.empty}>Nenhum vale registrado para este funcionário.</p>}
        {vales.map(v => (
          <div key={v._id} className={styles.valeRow}>
            <div className={styles.valeInfo}>
              <span className={styles.valeDesc}>{v.description.replace('Vale: ', '')}</span>
              <span className={styles.valeDate}>{formatDate(v.date)}</span>
            </div>
            <div className={styles.valeRight}>
              <span className={styles.valeAmount}>{formatCurrency(v.amount)}</span>
              <button 
                className={styles.deleteBtn} 
                onClick={() => confirm('Excluir este vale?') && deleteVale.mutate(v._id)}
                title="Excluir vale"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
