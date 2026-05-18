import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './ServiceForm.module.scss';

interface PackageItem {
  serviceId: string;
  quantity: number;
  unitPrice?: number;
}

interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  image?: string;
  isActive: boolean;
  type?: 'single' | 'package';
  showPrice?: boolean;
  showPricePrefix?: boolean;
  packageValidity?: {
    type: 'none' | 'days' | 'weeks' | 'months' | 'years';
    value?: number;
  };
  packageItems?: PackageItem[];
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
  
  const [type, setType] = useState<'single' | 'package'>(service?.type || 'single');
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [price, setPrice] = useState(service?.price != null ? formatBR(service.price) : '');
  const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? '30'));
  const [image, setImage] = useState(service?.image ?? '');
  const [showPrice, setShowPrice] = useState(service?.showPrice !== false);
  const [showPricePrefix, setShowPricePrefix] = useState(service?.showPricePrefix !== false);
  const [error, setError] = useState<string | null>(null);

  // Package fields
  const [validityType, setValidityType] = useState<'none' | 'days' | 'weeks' | 'months' | 'years'>(service?.packageValidity?.type || 'none');
  const [validityValue, setValidityValue] = useState(String(service?.packageValidity?.value ?? ''));
  const [packageItems, setPackageItems] = useState<PackageItem[]>(service?.packageItems || []);

  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ['services-for-package', unitId],
    queryFn: async () => {
      const { data } = await api.get(`/services?unitId=${unitId}`);
      return (Array.isArray(data) ? data : data.services ?? []).filter((s: Service) => s.type !== 'package');
    },
    enabled: type === 'package' && !!unitId,
  });

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/services/${service!._id}`, payload)
        : api.post('/services', payload),
    onSuccess,
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message;
      setError(msg || 'Erro ao salvar serviço.');
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function addPackageItem() {
    if (allServices.length === 0) return;
    setPackageItems([...packageItems, { serviceId: allServices[0]._id, quantity: 1 }]);
  }

  function updatePackageItem(index: number, field: keyof PackageItem, value: string | number) {
    const newItems = [...packageItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setPackageItems(newItems);
  }

  function removePackageItem(index: number) {
    setPackageItems(packageItems.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    
    if (type === 'package' && packageItems.length === 0) {
      setError('Adicione pelo menos um item ao pacote.');
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      description,
      price: parseBR(price),
      durationMinutes: parseInt(durationMinutes, 10) || 30,
      image,
      type,
      showPrice,
      showPricePrefix,
    };

    if (unitId && !isEdit) payload.unitId = unitId;

    if (type === 'package') {
      const validity: { type: string; value?: number } = { type: validityType };
      if (validityType !== 'none') {
        validity.value = parseInt(validityValue, 10) || 1;
      }
      payload.packageValidity = validity;
      payload.packageItems = packageItems.map(item => ({
        serviceId: item.serviceId,
        quantity: item.quantity,
        ...(item.unitPrice !== undefined ? { unitPrice: item.unitPrice } : {})
      }));
    }

    mutation.mutate(payload);
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'EDITAR' : 'CRIAR'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.typeToggle}>
            <button type="button" className={`${styles.typeBtn} ${type === 'single' ? styles.typeActive : ''}`} onClick={() => setType('single')}>
              Serviço Comum
            </button>
            <button type="button" className={`${styles.typeBtn} ${type === 'package' ? styles.typeActive : ''}`} onClick={() => setType('package')}>
              Pacote
            </button>
          </div>

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
            <label className={styles.label}>{type === 'package' ? 'Nome do Pacote *' : 'Nome *'}</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          
          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{type === 'package' ? 'Preço Pacote *' : 'Preço *'}</label>
              <div className={styles.currencyWrap}>
                <span className={styles.currencyPrefix}>R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.currencyInput}
                  placeholder="0,00"
                  value={price}
                  onChange={e => setPrice(e.target.value.replace(/[^0-9,]/g, ''))}
                  onBlur={() => { const n = parseBR(price); if (n >= 0) setPrice(formatBR(n)); }}
                  required
                />
              </div>
            </div>
            
            <div className={styles.field}>
              <label className={styles.label}>Duração (min) *</label>
              <input type="number" min="5" step="5" className={styles.input} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Exibição no agendamento online</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={e => { setShowPrice(e.target.checked); if (!e.target.checked) setShowPricePrefix(false); }}
                  style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>Exibir valor do serviço</span>
              </label>
              {showPrice && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', marginLeft: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={showPricePrefix}
                    onChange={e => setShowPricePrefix(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Exibir &quot;A partir de&quot; antes do valor</span>
                </label>
              )}
            </div>
          </div>

          {type === 'package' && (
            <>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Validade do Pacote</label>
                  <select className={styles.select} value={validityType} onChange={e => setValidityType(e.target.value as typeof validityType)}>
                    <option value="none">Sem prazo de validade</option>
                    <option value="days">Definir prazo em dias</option>
                    <option value="weeks">Definir prazo em semanas</option>
                    <option value="months">Definir prazo em meses</option>
                    <option value="years">Definir prazo em anos</option>
                  </select>
                </div>
                {validityType !== 'none' && (
                  <div className={styles.field}>
                    <label className={styles.label}>Tempo ({validityType === 'days' ? 'Dias' : validityType === 'weeks' ? 'Semanas' : validityType === 'months' ? 'Meses' : 'Anos'})</label>
                    <input type="number" min="1" className={styles.input} value={validityValue} onChange={e => setValidityValue(e.target.value)} required />
                  </div>
                )}
              </div>

              <div className={styles.packageItems}>
                <label className={styles.label}>Itens do Pacote (acesso por mês)</label>
                {packageItems.map((item, idx) => (
                  <div key={idx} className={styles.packageItemRow}>
                    <div className={styles.packageItemCol}>
                      <select className={styles.select} value={item.serviceId} onChange={e => updatePackageItem(idx, 'serviceId', e.target.value)}>
                        {allServices.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.packageItemNumCol}>
                      <input 
                        type="number" 
                        min="1" 
                        className={styles.input} 
                        placeholder="Vezes/mês" 
                        value={item.quantity || ''} 
                        onChange={e => updatePackageItem(idx, 'quantity', parseInt(e.target.value, 10) || 0)} 
                        title="Vezes por mês"
                        required
                      />
                    </div>
                    <button type="button" className={styles.removeItemBtn} onClick={() => removePackageItem(idx)}>✕</button>
                  </div>
                ))}
                
                <button type="button" className={styles.addPackageItemBtn} onClick={addPackageItem}>
                  + ADICIONAR MAIS ITENS
                </button>
              </div>
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
