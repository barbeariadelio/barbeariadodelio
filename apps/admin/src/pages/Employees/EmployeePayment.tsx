import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import styles from './EmployeePayment.module.scss';

interface Commission {
  _id: string;
  amount: number;
  description: string;
  date: string;
  isPaid?: boolean;
  appointmentId?: {
    date?: string;
    startTime?: string;
    clientId?: any;
    serviceId?: any;
    price?: number;
  };
}

interface Props {
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

export default function EmployeePayment({ employeeId, unitId }: Props) {
  const { user } = useAuth();
  const isEmployee = (user as any)?.role === 'employee';
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payDesc, setPayDesc] = useState('');

  const qs = new URLSearchParams({ employeeId });
  if (unitId) qs.set('unitId', unitId);

  const { data: commissions = [], isLoading } = useQuery<Commission[]>({
    queryKey: ['employee-commissions', employeeId],
    queryFn: async () => {
      const { data } = await api.get(`/finance/remunerations?${qs}`);
      return Array.isArray(data) ? data : [];
    },
  });

  const unpaid = commissions.filter(c => !c.isPaid);
  const paid = commissions.filter(c => c.isPaid);

  const selectedTotal = unpaid
    .filter(c => selected.has(c._id))
    .reduce((sum, c) => sum + c.amount, 0);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(unpaid.map(c => c._id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openPayForm() {
    setPayAmount(formatBR(selectedTotal));
    setPayDesc(`Pagamento de comissões (${selected.size} atend.)`);
    setShowPayForm(true);
  }

  const registerPayment = useMutation({
    mutationFn: (payload: any) => api.post('/finance/payment', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-commissions', employeeId] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      setShowPayForm(false);
      setSelected(new Set());
      setPayAmount('');
      setPayDesc('');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseBR(payAmount);
    if (!amount || selected.size === 0) return;
    registerPayment.mutate({
      employeeId,
      unitId,
      commissionIds: Array.from(selected),
      amount,
      description: payDesc,
      date: payDate,
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Comissões / Remuneração</h3>
        {!isEmployee && unpaid.length > 0 && selected.size > 0 && !showPayForm && (
          <button className={styles.payBtn} onClick={openPayForm}>
            Registrar Pagamento
          </button>
        )}
      </div>

      {!isEmployee && unpaid.length > 0 && !showPayForm && (
        <div className={styles.selectBar}>
          <button className={styles.selectAllBtn} onClick={selectAll}>Selecionar todos</button>
          {selected.size > 0 && (
            <button className={styles.clearBtn} onClick={clearSelection}>Limpar</button>
          )}
          {selected.size > 0 && (
            <span className={styles.selTotal}>
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''} · {formatCurrency(selectedTotal)}
            </span>
          )}
        </div>
      )}

      {showPayForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Valor pago (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                onBlur={() => { const n = parseBR(payAmount); if (n > 0) setPayAmount(formatBR(n)); }}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Data</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
            </div>
          </div>
          <div className={styles.field}>
            <label>Descrição</label>
            <input
              type="text"
              value={payDesc}
              onChange={e => setPayDesc(e.target.value)}
            />
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>
              Cancelar
            </button>
            <button type="submit" className={styles.submitBtn} disabled={registerPayment.isPending}>
              {registerPayment.isPending ? 'Salvando...' : 'Confirmar Pagamento'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className={styles.empty}>Carregando...</p>
      ) : unpaid.length === 0 && paid.length === 0 ? (
        <p className={styles.empty}>Nenhuma comissão registrada.</p>
      ) : (
        <>
          {unpaid.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Pendentes ({unpaid.length})</div>
              <div className={styles.list}>
                {unpaid.map(c => {
                  const isSelected = selected.has(c._id);
                  const appt = c.appointmentId;
                  const label = appt?.serviceId?.name || c.description;
                  const dateStr = appt?.date ? formatDate(appt.date) : formatDate(c.date);
                  const clientName = appt?.clientId?.name;
                  return (
                    <div
                      key={c._id}
                      className={`${styles.commRow} ${isSelected ? styles.commRowSelected : ''} ${!isEmployee ? styles.commRowClickable : ''}`}
                      onClick={() => !isEmployee && toggleSelect(c._id)}
                    >
                      {!isEmployee && (
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isSelected}
                          onChange={() => toggleSelect(c._id)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <div className={styles.commInfo}>
                        <span className={styles.commDesc}>{label}</span>
                        {clientName && <span className={styles.commClient}>{clientName}</span>}
                        <span className={styles.commDate}>{dateStr}{appt?.startTime ? ` · ${appt.startTime}` : ''}</span>
                      </div>
                      <span className={styles.commAmount}>{formatCurrency(c.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isEmployee && paid.length > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ marginTop: '1.25rem' }}>Pagos ({paid.length})</div>
              <div className={styles.list}>
                {paid.map(c => {
                  const appt = c.appointmentId;
                  const label = appt?.serviceId?.name || c.description;
                  const dateStr = appt?.date ? formatDate(appt.date) : formatDate(c.date);
                  const clientName = appt?.clientId?.name;
                  return (
                    <div key={c._id} className={`${styles.commRow} ${styles.commRowPaid}`}>
                      <div className={styles.commInfo}>
                        <span className={styles.commDesc}>{label}</span>
                        {clientName && <span className={styles.commClient}>{clientName}</span>}
                        <span className={styles.commDate}>{dateStr}{appt?.startTime ? ` · ${appt.startTime}` : ''}</span>
                      </div>
                      <div className={styles.commRight}>
                        <span className={styles.commAmount}>{formatCurrency(c.amount)}</span>
                        <span className={styles.paidBadge}>Pago</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
