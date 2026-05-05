import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './Units.module.scss';

interface Unit {
  _id: string;
  name: string;
  address: string;
  phone: string;
  status: 'active' | 'inactive';
}

function IconMapPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

export default function Units() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const isLocal = window.location.hostname === 'localhost';

  const { data: units, isLoading } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: () => api.get('/units').then(res => {
      const data = res.data;
      return Array.isArray(data) ? data : data.units ?? [];
    }),
  });

  const mutation = useMutation({
    mutationFn: (unit: Partial<Unit>) => {
      if (editingUnit) return api.patch(`/units/${editingUnit._id}`, unit);
      return api.post('/units', unit);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setShowModal(false);
    setEditingUnit(null);
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      phone: formData.get('phone') as string,
      status: formData.get('status') as 'active' | 'inactive',
    };
    mutation.mutate(data);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Unidades</h1>
          <p className={styles.subtitle}>Gerencie as unidades da sua franquia</p>
        </div>
      </header>

      {isLoading ? (
        <div className={styles.loading}>Carregando unidades...</div>
      ) : (
        <div className={styles.grid}>
          {units?.map(unit => {
            const isNovaVeneza = unit.name.toLowerCase().includes('nova veneza');
            const isMoradaDoSol = unit.name.toLowerCase().includes('morada do sol');

            return (
              <div key={unit._id} className={styles.portalCard}>
                <div className={styles.portalTop}>
                  <div className={styles.portalIcon}>
                    <IconBuilding />
                  </div>
                  <div className={styles.portalInfo}>
                    <h3 className={styles.unitName}>{unit.name}</h3>
                    <div className={styles.portalSub}>Sistema de Gestão Local</div>
                  </div>
                  <div className={styles.portalStatus}>
                    <span className={`${styles.statusDot} ${styles.active}`} />
                    <span className={styles.statusLabel}>
                      Online
                    </span>
                  </div>
                </div>
                
                <div className={styles.cardBody}>
                  <div className={styles.infoRow}>
                    <IconMapPin />
                    <span>{unit.address}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <IconPhone />
                    <span>{unit.phone}</span>
                  </div>
                </div>

                <div class={styles.portalFooter}>
                  <div className={styles.mainActions}>
                    <a 
                      href={`${isLocal ? 'http://localhost:5174/franchise-app/' : '/franchise-app/'}?unitId=${unit._id}&token=${localStorage.getItem('accessToken')}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={styles.mainAccessBtn}
                    >
                      Entrar no Sistema
                      <IconExternal />
                    </a>

                    <a 
                      href={`${isLocal ? 'http://localhost:5175/booking/' : '/booking/'}?unitId=${unit._id}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={styles.bookingAccessBtn}
                    >
                      <IconCalendar />
                      Link de Agendamento
                    </a>
                  </div>
                  
                  <div className={styles.secondaryActions}>
                    <button className={styles.secondaryBtn} onClick={() => handleEdit(unit)}>Configurar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && handleClose()}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>{editingUnit ? 'Editar Unidade' : 'Nova Unidade'}</h2>
              <button className={styles.closeBtn} onClick={handleClose}><IconX /></button>
            </div>
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Nome da Unidade</label>
                <input name="name" defaultValue={editingUnit?.name} className={styles.input} placeholder="Ex: Unidade Centro" required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Endereço Completo</label>
                <input name="address" defaultValue={editingUnit?.address} className={styles.input} placeholder="Rua, Número, Bairro" required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Telefone de Contato</label>
                <input name="phone" defaultValue={editingUnit?.phone} className={styles.input} placeholder="(00) 00000-0000" required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Status</label>
                <select name="status" defaultValue={editingUnit?.status ?? 'active'} className={styles.select}>
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
              <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : (editingUnit ? 'Salvar Alterações' : 'Criar Unidade')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
