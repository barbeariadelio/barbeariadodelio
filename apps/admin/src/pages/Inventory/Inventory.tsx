import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmModal } from '@barber/ui';
import ProductForm from './ProductForm';
import styles from './Inventory.module.scss';

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

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function IconPackage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const unitId = getSelectedUnitId() || (user as any)?.unitId;
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', unitId],
    queryFn: async () => {
      const { data } = await api.get('/products?limit=1000');
      return Array.isArray(data) ? data : data.products ?? [];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    }
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleDelete(p: Product) {
    setProductToDelete(p);
    setIsDeleteModalOpen(true);
  }

  function handleRowClick(p: Product, e: React.MouseEvent) {
    // Don't open details if clicking on action buttons
    if ((e.target as HTMLElement).closest(`.${styles.actions}`)) return;
    setDetailedProduct(p);
    setShowDetails(true);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Estoque</h1>
          <p className={styles.subtitle}>Gestão de produtos, insumos e controle de reposição</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => { setSelectedProduct(null); setShowForm(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Produto
        </button>
      </header>

      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.blue}`}>
          <span className={styles.kpiLabel}>Itens Cadastrados</span>
          <span className={styles.kpiValue}>{products.length}</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.amber}`}>
          <span className={styles.kpiLabel}>Estoque Crítico</span>
          <span className={styles.kpiValue}>
            {products.filter(p => p.stockQuantity <= p.minStock).length}
          </span>
        </div>
        <div className={`${styles.kpiCard} ${styles.green}`}>
          <span className={styles.kpiLabel}>Valor Patrimonial</span>
          <span className={styles.kpiValue}>
            {formatCurrency(products.reduce((acc, p) => acc + (p.costPrice * p.stockQuantity), 0))}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <input 
            className={styles.searchInput} 
            placeholder="Buscar por nome ou categoria..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th align="center">Qtd.</th>
              <th align="right">Preço Venda</th>
              <th align="right">Lucro Un.</th>
              <th align="right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className={styles.empty}>Carregando...</td></tr>}
            {!isLoading && filteredProducts.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Nenhum produto encontrado.</td></tr>
            )}
            {filteredProducts.map(p => {
              const isLow = p.stockQuantity <= p.minStock;
              return (
                <tr key={p._id} className={`${styles.row} ${isLow ? styles.lowStockRow : ''}`} onClick={(e) => handleRowClick(p, e)}>
                  <td>
                    <div className={styles.productCell}>
                      <div className={styles.productIcon}><IconPackage /></div>
                      <div className={styles.productInfo}>
                        <span className={styles.productName}>{p.name}</span>
                        <span className={styles.productDesc}>{p.description || 'Sem descrição'}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className={styles.categoryBadge}>{p.category || 'Geral'}</span></td>
                  <td align="center">
                    <span className={`${styles.stockBadge} ${isLow ? styles.badgeRed : styles.badgeGreen}`}>
                      {p.stockQuantity} un
                    </span>
                  </td>
                  <td align="right" className={styles.priceCell}>{formatCurrency(p.price)}</td>
                  <td align="right" className={styles.profitCell}>{formatCurrency(p.price - p.costPrice)}</td>
                  <td align="right">
                    <div className={styles.actions}>
                      <button className={styles.btnAction} onClick={(e) => { e.stopPropagation(); setSelectedProduct(p); setShowForm(true); }}>Editar</button>
                      <button className={`${styles.btnAction} ${styles.btnDanger}`} onClick={(e) => { e.stopPropagation(); handleDelete(p); }}>Excluir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ProductForm
          product={selectedProduct}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}

      {showDetails && detailedProduct && (
        <div className={styles.modalOverlay} onClick={() => setShowDetails(false)}>
          <div className={styles.detailsModal} onClick={e => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{detailedProduct.name}</h2>
                <span className={styles.modalSub}>{detailedProduct.category || 'Categoria Geral'}</span>
              </div>
              <button className={styles.btnClose} onClick={() => setShowDetails(false)}>&times;</button>
            </header>

            <div className={styles.modalBody}>
              <div className={styles.specGrid}>
                <div className={styles.specItem}>
                  <label>ID do Produto</label>
                  <span>#{detailedProduct._id.slice(-6).toUpperCase()}</span>
                </div>
                <div className={styles.specItem}>
                  <label>Estoque Atual</label>
                  <span className={detailedProduct.stockQuantity <= detailedProduct.minStock ? styles.textRed : styles.textGreen}>
                    {detailedProduct.stockQuantity} unidades
                  </span>
                </div>
                <div className={styles.specItem}>
                  <label>Estoque Mínimo</label>
                  <span>{detailedProduct.minStock} unidades</span>
                </div>
                <div className={styles.specItem}>
                  <label>Preço de Custo</label>
                  <span>{formatCurrency(detailedProduct.costPrice)}</span>
                </div>
                <div className={styles.specItem}>
                  <label>Preço de Venda</label>
                  <span className={styles.textBlue}>{formatCurrency(detailedProduct.price)}</span>
                </div>
                <div className={styles.specItem}>
                  <label>Margem de Lucro</label>
                  <span className={styles.textGreen}>
                    {formatCurrency(detailedProduct.price - detailedProduct.costPrice)} ({(((detailedProduct.price - detailedProduct.costPrice) / detailedProduct.price) * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>

              <div className={styles.descriptionBox}>
                <label>Descrição Detalhada</label>
                <p>{detailedProduct.description || 'Nenhuma descrição adicional cadastrada para este produto.'}</p>
              </div>

              <div className={styles.valuationBox}>
                <div className={styles.valuationItem}>
                  <label>Valor Total em Estoque (Custo)</label>
                  <span>{formatCurrency(detailedProduct.costPrice * detailedProduct.stockQuantity)}</span>
                </div>
                <div className={styles.valuationItem}>
                  <label>Potencial de Receita (Venda)</label>
                  <span>{formatCurrency(detailedProduct.price * detailedProduct.stockQuantity)}</span>
                </div>
              </div>
            </div>

            <footer className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowDetails(false)}>Fechar</button>
              <button className={styles.btnPrimary} onClick={() => { 
                setSelectedProduct(detailedProduct); 
                setShowDetails(false);
                setShowForm(true); 
              }}>Editar Produto</button>
            </footer>
          </div>
        </div>
      )}
      {isDeleteModalOpen && productToDelete && (
        <ConfirmModal
          title="Excluir Produto"
          message={`Tem certeza que deseja excluir o produto "${productToDelete.name}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(productToDelete._id)}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setProductToDelete(null);
          }}
        />
      )}
    </div>
  );
}
