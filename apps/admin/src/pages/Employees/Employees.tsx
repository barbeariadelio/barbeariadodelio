import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import EmployeeForm from './EmployeeForm';
import EmployeeVales from './EmployeeVales';
import { ConfirmModal } from '@barber/ui';
import styles from './Employees.module.scss';

interface DaySchedule { day: number; slots: { start: string; end: string }[]; }

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Employee {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string;
  daySchedules?: DaySchedule[];
  workSchedule?: {
    start: string;
    end: string;
    lunchStart?: string;
    lunchEnd?: string;
  };
  vacations?: { start: string; end: string }[];
  blockedDays?: string[];
  isActive: boolean;
  unitId?: string | { _id: string; name: string };
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendente',
  completed: 'Concluído',
  blocked: 'Bloqueado',
};

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6' },
  pending:   { bg: 'rgba(234,179,8,.12)',  color: '#ca8a04' },
  completed: { bg: 'rgba(34,197,94,.12)',  color: '#16a34a' },
  blocked:   { bg: 'rgba(107,114,128,.12)', color: '#6b7280' },
};

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function EmployeeHistory({ employeeId, unitId }: { employeeId: string; unitId?: string }) {
  const now = new Date();
  const [mode, setMode] = useState<'dia' | 'mes' | 'ano'>('mes');
  const [day,   setDay]   = useState(todayISO());
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [year,  setYear]  = useState(String(now.getFullYear()));

  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)), []);

  const { start, end } = useMemo(() => {
    if (mode === 'dia') return { start: day, end: day };
    if (mode === 'mes') {
      const [y, m] = month.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      return {
        start: `${y}-${String(m).padStart(2, '0')}-01`,
        end:   `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }, [mode, day, month, year]);

  const qs = new URLSearchParams({ start, end, employeeId, limit: '500' });
  if (unitId) qs.set('unitId', unitId);

  const { data: appts = [], isLoading } = useQuery<any[]>({
    queryKey: ['emp-history', employeeId, start, end],
    queryFn: () =>
      api.get(`/appointments?${qs}`).then(r => Array.isArray(r.data) ? r.data : []),
    enabled: !!employeeId,
  });

  const completed = appts.filter(a => a.status === 'completed');
  const totalRevenue = completed.reduce((acc, a) => acc + (a.price ?? 0), 0);

  return (
    <div className={styles.historySection}>
      <div className={styles.historyHeader}>
        <span className={styles.historySectionTitle}>Histórico de Atendimentos</span>
      </div>

      <div className={styles.historyFilters}>
        <div className={styles.modeToggle}>
          {(['dia', 'mes', 'ano'] as const).map(m => (
            <button
              key={m}
              className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'dia' ? 'Dia' : m === 'mes' ? 'Mês' : 'Ano'}
            </button>
          ))}
        </div>

        {mode === 'dia' && (
          <input
            type="date"
            className={styles.historyDateInput}
            value={day}
            onChange={e => setDay(e.target.value)}
          />
        )}
        {mode === 'mes' && (
          <input
            type="month"
            className={styles.historyDateInput}
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        )}
        {mode === 'ano' && (
          <select
            className={styles.historyDateInput}
            value={year}
            onChange={e => setYear(e.target.value)}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {!isLoading && appts.length > 0 && (
        <div className={styles.historySummary}>
          <span>{appts.length} atend. · {completed.length} concluído{completed.length !== 1 ? 's' : ''}</span>
          <span>{fmt.format(totalRevenue)}</span>
        </div>
      )}

      {isLoading ? (
        <p className={styles.historyEmpty}>Carregando...</p>
      ) : appts.length === 0 ? (
        <p className={styles.historyEmpty}>Nenhum atendimento neste período.</p>
      ) : (
        <div className={styles.historyList}>
          {appts.map((a: any) => {
            const clientName = a.clientId?.name || '—';
            const svcName = a.serviceId?.name || '—';
            const dateStr = a.date ? a.date.split('-').reverse().slice(0, 2).join('/') : '—';
            const st = STATUS_COLOR[a.status] ?? STATUS_COLOR.confirmed;
            return (
              <div key={a._id} className={styles.historyRow}>
                <div className={styles.historyRowLeft}>
                  <span className={styles.historyDate}>{dateStr}</span>
                  <span className={styles.historyTime}>{a.startTime}</span>
                </div>
                <div className={styles.historyRowMid}>
                  <span className={styles.historyClient}>{clientName}</span>
                  <span className={styles.historySvc}>{svcName}</span>
                </div>
                <div className={styles.historyRowRight}>
                  <span className={styles.historyPrice}>{fmt.format(a.price ?? 0)}</span>
                  <span className={styles.historyStatus} style={{ background: st.bg, color: st.color }}>
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner:    'Proprietário',
  cashier:  'Caixa',
  employee: 'Funcionário',
};

interface DetailProps {
  emp: Employee;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isToggling: boolean;
}

function EmployeeDetail({ emp, onClose, onEdit, onToggle, onDelete, isToggling }: DetailProps) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} style={{ maxHeight: '90vh', overflowY: 'auto' }}>

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
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Horários</span>
              <span className={styles.infoValue}>
                {emp.daySchedules && emp.daySchedules.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {[...emp.daySchedules].sort((a, b) => a.day - b.day).map(ds => (
                      <div key={ds.day} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 700, minWidth: '30px', fontSize: '0.8rem' }}>{DAY_SHORT[ds.day]}:</span>
                        <span style={{ fontSize: '0.8rem' }}>{ds.slots.map(s => `${s.start}–${s.end}`).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                ) : emp.workSchedule ? (
                  `${emp.workSchedule.start} às ${emp.workSchedule.end}`
                ) : 'Não definido'}
              </span>
            </div>
            {emp.vacations && emp.vacations.length > 0 && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Férias</span>
                <span className={styles.infoValue}>
                  {emp.vacations.map((v, i) => (
                    <div key={i}>{v.start.split('-').reverse().join('/')} até {v.end.split('-').reverse().join('/')}</div>
                  ))}
                </span>
              </div>
            )}
            {emp.blockedDays && emp.blockedDays.length > 0 && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Bloqueios Avulsos</span>
                <span className={styles.infoValue}>
                  {emp.blockedDays.map(d => d.split('-').reverse().join('/')).join(', ')}
                </span>
              </div>
            )}
          </div>

          <EmployeeVales
            employeeId={emp._id}
            unitId={typeof emp.unitId === 'object' ? emp.unitId._id : emp.unitId}
          />

          <EmployeeHistory
            employeeId={emp._id}
            unitId={typeof emp.unitId === 'object' ? emp.unitId._id : emp.unitId}
          />
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
          {!emp.isActive && (
            <button className={styles.deleteAction} onClick={onDelete}>
              Excluir
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export default function Employees() {
  const { user } = useAuth();
  const unitId = getSelectedUnitId() || (user as any)?.unitId;
  const [formTarget, setFormTarget]               = useState<Employee | null | 'new'>(null);
  const [detailTarget, setDetailTarget]           = useState<Employee | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete]         = useState<Employee | null>(null);
  const qc = useQueryClient();

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', unitId],
    queryFn: async () => {
      const { data } = await api.get('/employees');
      return Array.isArray(data) ? data : data.employees ?? [];
    },
    enabled: !!user,
  });

  const toggleActive = useMutation({
    mutationFn: (emp: Employee) =>
      api.patch(`/employees/${emp._id}`, { isActive: !emp.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setDetailTarget(null);
      setConfirmDeactivate(null);
    },
  });

  const hardDelete = useMutation({
    mutationFn: (emp: Employee) => api.delete(`/employees/${emp._id}/permanent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setDetailTarget(null);
      setConfirmDelete(null);
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
              {!emp.isActive && (
                <button
                  className={`${styles.toggleBtn} ${styles.deactivate}`}
                  style={{ background: 'rgba(239,68,68,.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,.25)' }}
                  onClick={() => setConfirmDelete(emp)}
                >
                  Excluir
                </button>
              )}
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
          onDelete={() => { setDetailTarget(null); setConfirmDelete(detailTarget); }}
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

      {confirmDelete && (
        <ConfirmModal
          title="Excluir funcionário permanentemente?"
          message={`Esta ação remove ${confirmDelete.name} do sistema definitivamente, incluindo o acesso à página de permissões. Não pode ser desfeita.`}
          confirmLabel="Excluir permanentemente"
          danger
          onConfirm={() => hardDelete.mutate(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          isPending={hardDelete.isPending}
        />
      )}

      {formTarget !== null && (
        <EmployeeForm
          employee={formTarget === 'new' ? null : (formTarget as any)}
          onClose={() => setFormTarget(null)}
          onSuccess={() => {
            setFormTarget(null);
            qc.invalidateQueries({ queryKey: ['employees'] });
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}
    </div>
  );
}
