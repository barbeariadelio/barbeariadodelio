import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import EmployeeForm from './EmployeeForm';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import styles from './Employees.module.scss';

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string;
  isActive: boolean;
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner:      'Proprietário',
  employee:   'Funcionário',
  franchisee: 'Franqueado',
  franchisor: 'Franqueador',
};

interface DetailProps {
  emp: Employee;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  isToggling: boolean;
}

function EmployeeDetail({ emp, onClose, onEdit, onToggle, isToggling }: DetailProps) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>

        <div className={styles.panelTop}>
          <div className={styles.panelAvatar}>
            {emp.avatar ? (
              <img src={emp.avatar} alt={emp.name} className={styles.avatarImg} />
            ) : (
              getInitials(emp.name)
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        <div className={styles.panelBody}>
          <h2 className={styles.panelName}>{emp.name}</h2>
          <div className={styles.panelBadges}>
            <span className={styles.rolePill}>{ROLE_LABELS[emp.role] ?? emp.role}</span>
            <span
              className={styles.statusPill}
              style={emp.isActive
                ? { background: 'rgba(34,197,94,.1)', color: '#22C55E', borderColor: 'rgba(34,197,94,.3)' }
                : { background: 'rgba(90,90,90,.12)', color: '#5A5A5A', borderColor: 'rgba(90,90,90,.3)' }}
            >
              {emp.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>E-mail</span>
              <span className={styles.infoValue}>{emp.email}</span>
            </div>
            {emp.phone && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Telefone</span>
                <span className={styles.infoValue}>{emp.phone}</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.panelFooter}>
          <button className={styles.editAction} onClick={() => { onClose(); onEdit(); }}>
            Editar cadastro
          </button>
          <button
            className={`${styles.toggleAction} ${emp.isActive ? styles.deactivateAction : styles.activateAction}`}
            onClick={onToggle}
            disabled={isToggling}
          >
            {emp.isActive ? 'Desativar' : 'Ativar'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function Employees() {
  const [formTarget, setFormTarget]         = useState<Employee | null | 'new'>(null);
  const [detailTarget, setDetailTarget]     = useState<Employee | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const qc = useQueryClient();

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await api.get('/employees');
      return Array.isArray(data) ? data : data.employees ?? [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: (emp: Employee) =>
      api.patch(`/employees/${emp._id}`, { isActive: !emp.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      setDetailTarget(null);
      setConfirmDeactivate(null);
    },
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>FUNCIONÁRIOS</h1>
        <button className={styles.newBtn} onClick={() => setFormTarget('new')}>
          + Novo Funcionário
        </button>
      </div>

      {isLoading && <p className={styles.empty}>Carregando...</p>}
      {!isLoading && employees.length === 0 && (
        <p className={styles.empty}>Nenhum funcionário cadastrado.</p>
      )}

      <div className={styles.grid}>
        {employees.map(emp => (
          <div
            key={emp._id}
            className={`${styles.card} ${!emp.isActive ? styles.inactive : ''}`}
            onClick={() => setDetailTarget(emp)}
          >
            <div className={styles.cardTop}>
              <div className={styles.avatar}>
                {emp.avatar ? (
                  <img src={emp.avatar} alt={emp.name} className={styles.avatarImg} />
                ) : (
                  getInitials(emp.name)
                )}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>{emp.name}</span>
                <span className={styles.email}>{emp.email}</span>
                {emp.phone && <span className={styles.phone}>{emp.phone}</span>}
              </div>
              <span className={styles.roleBadge}>{ROLE_LABELS[emp.role] ?? emp.role}</span>
            </div>
            <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
              <button className={styles.editBtn} onClick={() => setFormTarget(emp)}>
                Editar
              </button>
              <button
                className={`${styles.toggleBtn} ${emp.isActive ? styles.deactivate : styles.activate}`}
                onClick={() => emp.isActive ? setConfirmDeactivate(emp) : toggleActive.mutate(emp)}
                disabled={toggleActive.isPending}
              >
                {emp.isActive ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {detailTarget && (
        <EmployeeDetail
          emp={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => setFormTarget(detailTarget)}
          onToggle={() => detailTarget.isActive ? setConfirmDeactivate(detailTarget) : toggleActive.mutate(detailTarget)}
          isToggling={toggleActive.isPending}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          title="Desativar funcionário?"
          message={`${confirmDeactivate.name} não estará mais disponível para agendamentos.`}
          confirmLabel="Desativar"
          danger
          onConfirm={() => toggleActive.mutate(confirmDeactivate)}
          onCancel={() => setConfirmDeactivate(null)}
          isPending={toggleActive.isPending}
        />
      )}

      {formTarget !== null && (
        <EmployeeForm
          employee={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSuccess={() => {
            setFormTarget(null);
            qc.invalidateQueries({ queryKey: ['employees'] });
          }}
        />
      )}
    </div>
  );
}
