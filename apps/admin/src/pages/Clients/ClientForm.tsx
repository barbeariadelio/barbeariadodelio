import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './ClientForm.module.scss';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  client?: {
    _id: string;
    name: string;
    phone?: string;
    notes?: string;
  } | null;
}

function maskPhone(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function ClientForm({ onClose, onSuccess, client }: Props) {
  const isEditing = !!client;
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ? maskPhone(client.phone) : '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: object) => client?._id ? api.patch(`/clients/${client._id}`, payload) : api.post('/clients', payload),
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : `Erro ao ${isEditing ? 'salvar' : 'criar'} cliente.`);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ name, phone: phone.replace(/\D/g, ''), notes });
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required placeholder="Nome completo" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telefone</label>
            <input className={styles.input} type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(19) 9XXXX-XXXX" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Observações</label>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Preferências, alergias, observações..." />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
