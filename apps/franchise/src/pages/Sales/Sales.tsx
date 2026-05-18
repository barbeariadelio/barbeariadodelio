import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Sales.module.scss';

interface Product {
  _id: string;
  name: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  category?: string;
  isActive?: boolean;
}

interface CartItem {
  product: Product;
  qty: number;
}

interface Transaction {
  _id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Sales() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const unitId = getSelectedUnitId() || (user as any)?.unitId as string || '';

  const [tab, setTab] = useState<'pdv' | 'history'>('pdv');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checking, setChecking] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', unitId],
    queryFn: () => api.get(`/products?unitId=${unitId}`).then(r => Array.isArray(r.data) ? r.data : r.data?.products ?? []),
    enabled: !!unitId,
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['sales-history', unitId, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams({ unitId, category: 'product' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      return api.get(`/finance/transactions?${params}`).then(r => {
        const result = r.data;
        return Array.isArray(result) ? result : result?.data ?? result?.transactions ?? [];
      });
    },
    enabled: !!unitId && tab === 'history',
  });

  const activeProducts = products.filter(p => p.isActive !== false && p.stockQuantity > 0);
  const filtered = search.trim()
    ? activeProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : activeProducts;

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.product._id === product._id);
      if (existing) {
        if (existing.qty >= product.stockQuantity) return prev;
        return prev.map(i => i.product._id === product._id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev =>
      prev
        .map(i => i.product._id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    );
  }

  const total = cart.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  async function handleCheckout() {
    if (cart.length === 0 || !unitId) return;
    setChecking(true);
    setSuccessMsg('');
    try {
      await Promise.all(cart.map(i =>
        api.post('/finance/transactions', {
          unitId,
          type: 'income',
          category: 'product',
          amount: i.product.price * i.qty,
          description: `Produto: ${i.product.name} (x${i.qty})`,
          date: todayISO(),
        })
      ));
      await Promise.all(cart.map(i =>
        api.put(`/products/${i.product._id}`, { stockQuantity: i.product.stockQuantity - i.qty })
      ));
      await qc.invalidateQueries({ queryKey: ['products', unitId] });
      await qc.invalidateQueries({ queryKey: ['sales-history', unitId] });
      setCart([]);
      setSuccessMsg(`Venda registrada: ${fmt(total)}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Vendas</h1>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'pdv' ? styles.active : ''}`} onClick={() => setTab('pdv')}>PDV</button>
        <button className={`${styles.tab} ${tab === 'history' ? styles.active : ''}`} onClick={() => setTab('history')}>Histórico</button>
      </div>

      {tab === 'pdv' && (
        <div className={styles.pdvLayout}>
          <div>
            <div className={styles.searchBar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nenhum produto disponível.</p>
            ) : (
              <div className={styles.productGrid}>
                {filtered.map(p => {
                  const inCart = cart.find(i => i.product._id === p._id)?.qty ?? 0;
                  return (
                    <button key={p._id} className={styles.productCard} onClick={() => addToCart(p)} disabled={inCart >= p.stockQuantity}>
                      <div className={styles.productName}>{p.name}</div>
                      <div className={styles.productPrice}>{fmt(p.price)}</div>
                      <div className={styles.productStock}>Estoque: {p.stockQuantity - inCart}</div>
                      {inCart > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700, marginTop: '2px' }}>No carrinho: {inCart}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.cart}>
            <div className={styles.cartTitle}>Carrinho</div>
            {successMsg && (
              <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: '#065f46', marginBottom: '0.75rem', fontWeight: 600 }}>{successMsg}</div>
            )}
            {cart.length === 0 ? (
              <div className={styles.cartEmpty}>Clique nos produtos para adicionar</div>
            ) : (
              <>
                <div className={styles.cartItems}>
                  {cart.map(item => (
                    <div key={item.product._id} className={styles.cartItem}>
                      <span className={styles.cartItemName} title={item.product.name}>{item.product.name}</span>
                      <button className={styles.cartQtyBtn} onClick={() => changeQty(item.product._id, -1)}>−</button>
                      <span className={styles.cartItemQty}>{item.qty}</span>
                      <button className={styles.cartQtyBtn} onClick={() => changeQty(item.product._id, 1)} disabled={item.qty >= item.product.stockQuantity}>+</button>
                      <span className={styles.cartItemPrice}>{fmt(item.product.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <hr className={styles.cartDivider} />
                <div className={styles.cartTotal}><span>Total</span><span>{fmt(total)}</span></div>
                <button className={styles.checkoutBtn} onClick={handleCheckout} disabled={checking}>{checking ? 'Processando...' : 'Finalizar Venda'}</button>
                <button className={styles.clearCartBtn} onClick={() => setCart([])}>Limpar carrinho</button>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div className={styles.historyFilters}>
            <input type="date" className={styles.inputField} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <input type="date" className={styles.inputField} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className={styles.historyTable}>
            <div className={styles.tableHeader}>
              <span>Data</span><span>Descrição</span><span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            {transactions.length === 0 ? (
              <div className={styles.emptyState}>Nenhuma venda registrada no período.</div>
            ) : (
              transactions.map(t => (
                <div key={t._id} className={styles.tableRow}>
                  <span className={styles.rowDate}>{t.date.split('-').reverse().join('/')}</span>
                  <span className={styles.rowDesc}>{t.description}</span>
                  <span className={styles.rowAmount}>{fmt(t.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
