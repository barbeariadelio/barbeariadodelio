import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './TransactionForm.module.scss';

interface Unit { _id: string; name: string; }

interface Props {
  units: Unit[];
  initialData?: {
    _id: string;
    type: 'income' | 'expense' | 'royalty';
    category: string;
    amount: number;
    description: string;
    date: string;
    unitId?: { _id: string } | string;
    employeeId?: { _id: string } | string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatBR(n: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function parseBR(s: string) {
  return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Serviço',
  product: 'Produto',
  salary: 'Salário',
  rent: 'Aluguel',
  voucher: 'Vale',
  commission: 'Comissão',
  other: 'Outro',
};

export default function TransactionForm({ units, initialData, onClose, onSuccess }: Props) {
  const isEdit = !!initialData;
  const initialUnitId = typeof initialData?.unitId === 'object' ? initialData.unitId._id : (initialData?.unitId || units[0]?._id || '');

  const [type, setType] = useState<'income' | 'expense'>(initialData?.type === 'royalty' ? 'expense' : (initialData?.type || 'income'));
  const [category, setCategory] = useState(initialData?.category || 'service');
  const [amount, setAmount] = useState(initialData ? formatBR(initialData.amount) : '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [date, setDate] = useState(initialData?.date || todayISO());
  const [unitId, setUnitId] = useState(initialUnitId);
  const [employeeId, setEmployeeId] = useState(typeof initialData?.employeeId === 'object' ? initialData.employeeId._id : (initialData?.employeeId || ''));
  const [error, setError] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', unitId],
    queryFn: async () => {
      const { data } = await api.get(`/employees?unitId=${unitId}`);
      return Array.isArray(data) ? data : data.employees ?? [];
    },
    enabled: !!unitId,
  });

  const mutation = useMutation({
    mutationFn: (payload: object) => 
      isEdit 
        ? api.patch(`/finance/transactions/${initialData._id}`, payload)
        : api.post('/finance/transactions', payload),
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao salvar transação.');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: any = { type, category, amount: parseBR(amount), description, date, unitId };
    if (category === 'voucher' || category === 'salary') {
      payload.employeeId = employeeId || null;
    }
    mutation.mutate(payload);
  }

  const incomeCategories = ['service', 'product', 'other'];
  const expenseCategories = ['salary', 'rent', 'product', 'voucher', 'commission', 'other'];
  const categories = type === 'income' ? incomeCategories : expenseCategories;

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'EDITAR LANÇAMENTO' : 'NOVA TRANSAÇÃO'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.typeTabs}>
            <button
              type="button"
              className={`${styles.typeTab} ${type === 'income' ? styles.income : ''}`}
              onClick={() => { setType('income'); setCategory('service'); }}
            >
              Receita
            </button>
            <button
              type="button"
              className={`${styles.typeTab} ${type === 'expense' ? styles.expense : ''}`}
              onClick={() => { setType('expense'); setCategory('salary'); }}
            >
              Despesa
            </button>
          </div>

          {units.length > 1 && (
            <div className={styles.field}>
              <label className={styles.label}>Unidade *</label>
              <select className={styles.select} value={unitId} onChange={e => setUnitId(e.target.value)} required>
                {units.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Categoria *</label>
            <select className={styles.select} value={category} onChange={e => {
              setCategory(e.target.value);
              if (e.target.value !== 'voucher' && e.target.value !== 'salary') setEmployeeId('');
            }}>
              {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>
          </div>

          {(category === 'voucher' || category === 'salary') && (
            <div className={styles.field}>
              <label className={styles.label}>Funcionário</label>
              <select className={styles.select} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Selecione um funcionário (opcional)</option>
                {employees.map((emp: any) => (
                  <option key={emp._id} value={emp._id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Valor *</label>
              <div className={styles.currencyWrap}>
                <span className={styles.currencyPrefix}>R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.currencyInput}
                  placeholder="0,00"
                  value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                  onBlur={() => { const n = parseBR(amount); if (n > 0) setAmount(formatBR(n)); }}
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Data *</label>
              <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descrição *</label>
            <input className={styles.input} value={description} onChange={e => setDescription(e.target.value)} required placeholder="Ex: Corte de cabelo + barba" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
