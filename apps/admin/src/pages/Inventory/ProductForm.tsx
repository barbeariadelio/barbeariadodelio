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

export default function ProductForm({ product, onClose, onSuccess }: Props) {
  const [formData, setFormData] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? '',
    price: product?.price ?? 0,
    costPrice: product?.costPrice ?? 0,
    stockQuantity: product?.stockQuantity ?? 0,
    minStock: product?.minStock ?? 5,
  });

  const mutation = useMutation({
    mutationFn: (data: typeof formData) => 
      product 
        ? api.put(`/products/${product._id}`, data) 
        : api.post('/products', data),
    onSuccess,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate(formData);
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
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              required 
            />
          </div>

          <div className={styles.field}>
            <label>Categoria</label>
            <input 
              type="text" 
              value={formData.category} 
              onChange={e => setFormData({ ...formData, category: e.target.value })} 
            />
          </div>

          <div className={styles.field}>
            <label>Descrição</label>
            <textarea 
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })} 
              rows={2}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Preço de Custo (R$)</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.costPrice} 
                onChange={e => setFormData({ ...formData, costPrice: Number(e.target.value) })} 
                required 
              />
            </div>
            <div className={styles.field}>
              <label>Preço de Venda (R$)</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.price} 
                onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} 
                required 
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Quantidade em Estoque</label>
              <input 
                type="number" 
                value={formData.stockQuantity} 
                onChange={e => setFormData({ ...formData, stockQuantity: Number(e.target.value) })} 
                required 
              />
            </div>
            <div className={styles.field}>
              <label>Estoque Mínimo (Alerta)</label>
              <input 
                type="number" 
                value={formData.minStock} 
                onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })} 
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
