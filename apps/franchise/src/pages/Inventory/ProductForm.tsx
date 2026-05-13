import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './ProductForm.module.scss';

interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  minStock: number;
  category?: string;
}

interface Props {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Currency helpers (centavos-based, like a POS terminal) ───────────────
/** Convert a number (e.g. 35.50) to its centavos integer (3550). */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Format centavos integer as "35,50" (no R$ prefix — it's in the UI). */
function centsToDisplay(cents: number): string {
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const decPart = String(abs % 100).padStart(2, '0');
  const formatted = intPart.toLocaleString('pt-BR') + ',' + decPart;
  return cents < 0 ? '-' + formatted : formatted;
}

/** Strip non-digits and return cents integer. */
function inputToCents(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : parseInt(digits, 10);
}

export default function ProductForm({ product, onClose, onSuccess }: Props) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [costCents, setCostCents] = useState(toCents(product?.costPrice ?? 0));
  const [priceCents, setPriceCents] = useState(toCents(product?.price ?? 0));
  const [stockQuantity, setStockQuantity] = useState<number | ''>(product ? product.stockQuantity : '');
  const [minStock, setMinStock] = useState(product?.minStock ?? 5);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      product
        ? api.put(`/products/${product._id}`, data)
        : api.post('/products', data),
    onSuccess,
  });

  function handleCurrency(setter: (v: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(inputToCents(e.target.value));
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name,
      description: description || undefined,
      price: priceCents / 100,
      costPrice: costCents / 100,
      stockQuantity: stockQuantity === '' ? 0 : stockQuantity,
      minStock,
    };
    mutation.mutate(payload);
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{product ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Nome do Produto *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Pomada Modeladora Matte"
              required
            />
          </div>


          <div className={styles.field}>
            <label>Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Breve descrição do produto..."
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Preço de Custo</label>
              <div className={styles.currencyInput}>
                <span className={styles.prefix}>R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={centsToDisplay(costCents)}
                  onChange={handleCurrency(setCostCents)}
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Preço de Venda</label>
              <div className={styles.currencyInput}>
                <span className={styles.prefix}>R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={centsToDisplay(priceCents)}
                  onChange={handleCurrency(setPriceCents)}
                  required
                />
              </div>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Quantidade em Estoque</label>
              <input
                type="number"
                value={stockQuantity}
                onChange={e => setStockQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                placeholder="0"
              />
            </div>
            <div className={styles.field}>
              <label>Estoque Mínimo (Alerta)</label>
              <input
                type="number"
                value={minStock}
                onChange={e => setMinStock(Number(e.target.value))}
                min={0}
                required
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Salvar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
