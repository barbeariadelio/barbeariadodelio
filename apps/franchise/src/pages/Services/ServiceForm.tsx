import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './ServiceForm.module.scss';

interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  image?: string;
  isActive: boolean;
}

interface Props {
  service: Service | null;
  unitId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function formatBR(n: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function parseBR(s: string) {
  return parseFloat(s.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

export default function ServiceForm({ service, unitId, onClose, onSuccess }: Props) {
  const isEdit = !!service;
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service?.price != null ? formatBR(service.price) : '');
  const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? '30'));
  const [image, setImage] = useState(service?.image ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/services/${service!._id}`, payload)
        : api.post('/services', payload),
    onSuccess,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao salvar serviço.');
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      description,
      price: parseBR(price),
      durationMinutes: parseInt(durationMinutes, 10),
      image,
      ...(unitId && !isEdit ? { unitId } : {}),
    });
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'EDITAR SERVIÇO' : 'NOVO SERVIÇO'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.imageSection}>
            <div className={styles.imagePreview}>
              {image ? (
                <img src={image} alt="Preview" className={styles.imageImg} />
              ) : (
                <div className={styles.imagePlaceholder}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              )}
              <label className={styles.imageLabel}>
                <input type="file" accept="image/*" onChange={handleFile} hidden />
                <span>Mudar Imagem</span>
              </label>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Preço *</label>
              <div className={styles.currencyWrap}>
                <span className={styles.currencyPrefix}>R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.currencyInput}
                  placeholder="0,00"
                  value={price}
                  onChange={e => setPrice(e.target.value.replace(/[^0-9,]/g, ''))}
                  onBlur={() => { const n = parseBR(price); if (n > 0) setPrice(formatBR(n)); }}
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Duração (min) *</label>
              <input type="number" min="5" step="5" className={styles.input} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required />
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Serviço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
