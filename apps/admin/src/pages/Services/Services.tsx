import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import ServiceForm from './ServiceForm';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import styles from './Services.module.scss';

interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  image?: string;
  isActive: boolean;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface DetailProps {
  svc: Service;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  isToggling: boolean;
}

function ServiceDetail({ svc, onClose, onEdit, onToggle, isToggling }: DetailProps) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>

        <div className={styles.panelHead}>
          <div className={styles.panelHeadInfo}>
            <span className={styles.panelTitle}>{svc.name}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        {svc.image && (
          <div className={styles.panelImage}>
            <img src={svc.image} alt={svc.name} className={styles.panelImg} />
          </div>
        )}

        <div className={styles.panelBody}>
          <div className={styles.priceRow}>
            <span className={styles.bigPrice}>{formatCurrency(svc.price)}</span>
            <span className={styles.durationChip}>{svc.durationMinutes} min</span>
          </div>

          <span
            className={styles.statusPill}
            style={svc.isActive
              ? { background: 'rgba(34,197,94,.1)', color: '#22C55E', borderColor: 'rgba(34,197,94,.3)' }
              : { background: 'rgba(90,90,90,.12)', color: '#5A5A5A', borderColor: 'rgba(90,90,90,.3)' }}
          >
            {svc.isActive ? 'Ativo' : 'Inativo'}
          </span>

          {svc.description && (
            <p className={styles.descBlock}>{svc.description}</p>
          )}
        </div>

        <div className={styles.panelFooter}>
          <button className={styles.editAction} onClick={() => { onClose(); onEdit(); }}>
            Editar serviço
          </button>
          <button
            className={`${styles.toggleAction} ${svc.isActive ? styles.deactivateAction : styles.activateAction}`}
            onClick={onToggle}
            disabled={isToggling}
          >
            {svc.isActive ? 'Desativar' : 'Ativar'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function Services() {
  const [formTarget, setFormTarget]             = useState<Service | null | 'new'>(null);
  const [detailTarget, setDetailTarget]         = useState<Service | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Service | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const unitId = (user as unknown as { unitId?: string })?.unitId;

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ['services', unitId],
    queryFn: async () => {
      const params = unitId ? `?unitId=${unitId}` : '';
      const { data } = await api.get(`/services${params}`);
      return Array.isArray(data) ? data : data.services ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: (svc: Service) =>
      api.patch(`/services/${svc._id}`, { isActive: !svc.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      setDetailTarget(null);
      setConfirmDeactivate(null);
    },
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>SERVIÇOS</h1>
        <button className={styles.newBtn} onClick={() => setFormTarget('new')}>
          + Novo Serviço
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Carregando...</p>}
      {!isLoading && services.length === 0 && (
        <p className={styles.empty}>Nenhum serviço cadastrado.</p>
      )}

      <div className={styles.grid}>
        {services.map(svc => (
          <div
            key={svc._id}
            className={`${styles.card} ${!svc.isActive ? styles.inactive : ''}`}
            onClick={() => setDetailTarget(svc)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.headerMain}>
                <span className={styles.serviceName}>{svc.name}</span>
                <span
                  className={styles.activeBadge}
                  style={
                    svc.isActive
                      ? { background: 'rgba(34,197,94,.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }
                      : { background: 'rgba(90,90,90,0.15)', color: '#5A5A5A', border: '1px solid rgba(90,90,90,0.3)' }
                  }
                >
                  {svc.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              {svc.image && (
                <div className={styles.cardThumb}>
                  <img src={svc.image} alt={svc.name} />
                </div>
              )}
            </div>

            {svc.description && (
              <p className={styles.description}>{svc.description}</p>
            )}

            <div className={styles.meta}>
              <span className={styles.price}>{formatCurrency(svc.price)}</span>
              <span className={styles.duration}>{svc.durationMinutes} min</span>
            </div>

            <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
              <button className={styles.editBtn} onClick={() => setFormTarget(svc)}>
                Editar
              </button>
              <button
                className={`${styles.toggleBtn} ${svc.isActive ? styles.deactivate : styles.activate}`}
                onClick={() => svc.isActive ? setConfirmDeactivate(svc) : toggleActive.mutate(svc)}
                disabled={toggleActive.isPending}
              >
                {svc.isActive ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {detailTarget && (
        <ServiceDetail
          svc={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => setFormTarget(detailTarget)}
          onToggle={() => detailTarget.isActive ? setConfirmDeactivate(detailTarget) : toggleActive.mutate(detailTarget)}
          isToggling={toggleActive.isPending}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          title="Desativar serviço?"
          message={`"${confirmDeactivate.name}" não aparecerá mais como opção nos agendamentos.`}
          confirmLabel="Desativar"
          danger
          onConfirm={() => toggleActive.mutate(confirmDeactivate)}
          onCancel={() => setConfirmDeactivate(null)}
          isPending={toggleActive.isPending}
        />
      )}

      {formTarget !== null && (
        <ServiceForm
          service={formTarget === 'new' ? null : formTarget}
          unitId={unitId}
          onClose={() => setFormTarget(null)}
          onSuccess={() => {
            setFormTarget(null);
            qc.invalidateQueries({ queryKey: ['services'] });
          }}
        />
      )}
    </div>
  );
}
