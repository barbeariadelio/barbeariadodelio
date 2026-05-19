import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getSelectedUnitId } from '../../api/client';
import styles from './Permissions.module.scss';

type AppUser = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: 'owner' | 'cashier' | 'employee' | 'client';
  password?: string;
  passwordPlain?: string;
  isActive: boolean;
  unitId?: string | { name: string; _id: string };
  allowedApps?: string[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Admin',
  cashier: 'Caixa',
  employee: 'Funcionário',
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['Todos os Sistemas', 'Gestão Total', 'Configurações', 'Permissões'],
  cashier: ['Agenda', 'Vendas', 'Clientes', 'Atendimento', 'Agendamento'],
  employee: ['Própria Agenda', 'Salário', 'Comissões'],
};

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function normalizeRole(role: string): string {
  const r = role?.toLowerCase();
  if (r === 'staff' || r === 'employee' || r === 'funcionario' || r === 'funcionário') return 'employee';
  if (r === 'cashier' || r === 'caixa') return 'cashier';
  return r;
}

export default function Permissions() {
  const qc = useQueryClient();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [pendingRole, setPendingRole] = useState<string>('');
  const [pendingAllowedApps, setPendingAllowedApps] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [pendingPhone, setPendingPhone] = useState<string>('');
  const [pendingLoginType, setPendingLoginType] = useState<'email' | 'phone'>('email');
  const [pendingPassword, setPendingPassword] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; userId: string; userName: string; isActive: boolean; action?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '19', password: '', role: 'employee', allowedApps: ['franchise'] });
  const [loginType, setLoginType] = useState<'email' | 'phone'>('phone');

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setToast({ message: 'Copiado para a área de transferência!', type: 'success' });
    setTimeout(() => setCopiedField(null), 1500);
  };

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => {
      const data = res.data;
      const allUsers = Array.isArray(data) ? data : data.users ?? [];
      return allUsers.filter((u: AppUser) => u.role !== 'client');
    }),
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (expandedRow) {
      const u = users.find(x => x._id === expandedRow);
      if (u) {
        const role = normalizeRole(u.role);
        setPendingRole(role);
        const initialApps = u.allowedApps && u.allowedApps.length > 0
          ? u.allowedApps
          : ['franchise'];
        setPendingAllowedApps(initialApps);
        setPendingEmail(u.email || '');
        setPendingPhone(u.phone || '');
        setPendingLoginType(u.email ? 'email' : 'phone');
        setPendingPassword('');
      }
    }
  }, [expandedRow, users]);

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      // Clean up empty fields based on loginType
      const payload = { ...data };
      if (loginType === 'email') {
        delete payload.phone;
        payload.email = payload.email.toLowerCase();
      } else {
        delete payload.email;
        payload.phone = payload.phone.replace(/\D/g, '');
      }
      // Explicitly set unitId from the active franchise unit so the employee is
      // scoped to this unit even when the owner's JWT has no unitId.
      const activeUnitId = getSelectedUnitId() || '69fa463aa078044937f70250';
      payload.unitId = activeUnitId;
      payload.allowedApps = [activeUnitId];
      return api.post('/users/register', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setNewUser({ name: '', email: '', phone: '19', password: '', role: 'employee', allowedApps: ['franchise'] });
      setToast({ message: 'Usuário criado com sucesso!', type: 'success' });
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || 'Erro ao criar usuário. Verifique os dados.';
      setToast({ message, type: 'error' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: Partial<AppUser> & { id: string; password?: string }) => {
      const activeUnitId = getSelectedUnitId();
      if (activeUnitId && !(payload as any).unitId) (payload as any).unitId = activeUnitId;
      return api.put(`/users/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setToast({ message: 'Usuário atualizado com sucesso!', type: 'success' });
      setExpandedRow(null);
    },
    onError: () => setToast({ message: 'Erro ao salvar alterações.', type: 'error' })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setToast({ message: 'Usuário removido com sucesso!', type: 'success' });
    },
    onError: () => setToast({ message: 'Erro ao remover usuário.', type: 'error' })
  });

  const togglePassword = (id: string) => {
    const next = new Set(visiblePasswords);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisiblePasswords(next);
  };

  const toggleApp = (app: string) => {
    setPendingAllowedApps(prev => 
      prev.includes(app) ? prev.filter(a => a !== app) : [...prev, app]
    );
  };

  const toggleNewUserApp = (app: string) => {
    setNewUser(prev => ({
      ...prev,
      allowedApps: prev.allowedApps.includes(app)
        ? prev.allowedApps.filter(a => a !== app)
        : [...prev.allowedApps, app],
    }));
  };

  const generatePassword = () => {
    const pass = Math.floor(100000 + Math.random() * 900000).toString();
    setNewUser(prev => ({ ...prev, password: pass }));
  };

  const initials = (name?: string) =>
    (name || '??').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '??';

  const IconPlus = (props: React.SVGProps<SVGSVGElement>) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  const IconEye = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  const IconEyeOff = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" x2="23" y2="23"/></svg>;
  const IconTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
  const IconShield = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  const IconUsers = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  const IconChevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
  const IconAlert = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  const IconCopy = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {toast.type === 'success' ? (
              <polyline points="20 6 9 17 4 12"/>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </>
            )}
          </svg>
          {toast.message}
        </div>
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Permissões</h1>
          <p className={styles.subtitle}>Gerencie usuários e controle o acesso às funcionalidades</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
          <IconPlus /> Novo Usuário
        </button>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}><IconShield /> Administrador</span>
            <span className={styles.cardSub}>Acesso completo ao sistema</span>
          </div>
          <div className={styles.permList}>
            {ROLE_PERMISSIONS.owner.slice(0, 6).map(p => <span key={p} className={`${styles.badge} ${styles.badgeGold}`}>{p}</span>)}
            {ROLE_PERMISSIONS.owner.length > 6 && <span className={styles.cardSub}>+ {ROLE_PERMISSIONS.owner.length - 6} módulos</span>}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle} style={{ color: '#3b82f6' }}><IconUsers /> Caixa</span>
            <span className={styles.cardSub}>Operações e vendas</span>
          </div>
          <div className={styles.permList}>
            {ROLE_PERMISSIONS.cashier.map(p => <span key={p} className={`${styles.badge} ${styles.badgeBlue}`}>{p}</span>)}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle} style={{ color: 'var(--text-muted)' }}><IconUsers /> Funcionário</span>
            <span className={styles.cardSub}>Agenda e comissões</span>
          </div>
          <div className={styles.permList}>
            {ROLE_PERMISSIONS.employee.map(p => <span key={p} className={`${styles.badge} ${styles.badgeGray}`}>{p}</span>)}
          </div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.cardTitle}>Usuários Cadastrados</h3>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Usuário</th>
                <th className={styles.th}>Papel</th>
                <th className={styles.th}>Identificador</th>
                <th className={styles.th}>Senha</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const role = normalizeRole(u.role);
                const isPassVisible = visiblePasswords.has(u._id);
                const isExpanded = expandedRow === u._id;
                const hasChanges = pendingRole !== role ||
                                 JSON.stringify(u.allowedApps || []) !== JSON.stringify(pendingAllowedApps) ||
                                 (pendingLoginType === 'email' ? pendingEmail !== (u.email || '') : pendingPhone !== (u.phone || '')) ||
                                 (u.email && pendingLoginType === 'phone') || (u.phone && pendingLoginType === 'email') ||
                                 pendingPassword.length > 0;

                return (
                  <Fragment key={u._id}>
                    <tr className={`${styles.tr} ${isExpanded ? styles.trActive : ''}`} onClick={() => setExpandedRow(isExpanded ? null : u._id)}>
                      <td className={styles.td}>
                        <div className={styles.userCell}>
                          <div className={styles.avatarSmall}>{initials(u.name)}</div>
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.badge} ${
                          role === 'owner' ? styles.badgeGold : 
                          role === 'cashier' ? styles.badgeBlue : 
                          styles.badgeGray
                        }`}>
                          {ROLE_LABELS[role] || role}
                        </span>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.passCell}>
                          <span>{u.email || u.phone}</span>
                          <button className={styles.btnAction} title="Copiar identificador" onClick={(e) => { e.stopPropagation(); copyToClipboard((u.email || u.phone) || '', `id-${u._id}`); }}>
                            {copiedField === `id-${u._id}` ? <IconCheck /> : <IconCopy />}
                          </button>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.passCell}>
                          <span>{isPassVisible ? (u.passwordPlain || '••••••') : '••••••••'}</span>
                          <button className={styles.btnAction} onClick={(e) => { e.stopPropagation(); togglePassword(u._id); }}>
                            {isPassVisible ? <IconEyeOff /> : <IconEye />}
                          </button>
                          <button className={styles.btnAction} title="Copiar senha" onClick={(e) => { e.stopPropagation(); copyToClipboard(u.passwordPlain || '', `pw-${u._id}`); }}>
                            {copiedField === `pw-${u._id}` ? <IconCheck /> : <IconCopy />}
                          </button>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.isActive !== false ? '#10b981' : '#ef4444' }} />
                          {u.isActive !== false ? 'Ativo' : 'Inativo'}
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.actions}>
                          <div className={`${styles.btnAction} ${isExpanded ? styles.expanded : ''}`}>
                            <IconChevron />
                          </div>
                          <button className={`${styles.btnAction} ${styles.btnActionDanger}`} title="Excluir" onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({ show: true, userId: u._id, userName: u.name, isActive: u.isActive !== false, action: 'delete' });
                          }}>
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={styles.accordionRow}>
                        <td colSpan={6} className={styles.accordionTd}>
                          <div className={styles.accordionContent}>
                            <div className={styles.accordionGrid}>
                              <div className={styles.accordionCol}>
                                <label className={styles.label}>Configurações de Login</label>
                                <div className={styles.toggleGroup} style={{ marginBottom: '0.75rem', width: 'fit-content' }}>
                                  <button 
                                    type="button" 
                                    className={`${styles.toggleBtn} ${pendingLoginType === 'email' ? styles.active : ''}`} 
                                    onClick={(e) => { e.stopPropagation(); setPendingLoginType('email'); }}
                                  >
                                    E-mail
                                  </button>
                                  <button 
                                    type="button" 
                                    className={`${styles.toggleBtn} ${pendingLoginType === 'phone' ? styles.active : ''}`} 
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setPendingLoginType('phone'); 
                                      if (!pendingPhone) setPendingPhone('19');
                                    }}
                                  >
                                    Telefone
                                  </button>
                                </div>
                                {pendingLoginType === 'email' ? (
                                  <input 
                                    className={styles.input} 
                                    type="email" 
                                    value={pendingEmail} 
                                    onChange={e => setPendingEmail(e.target.value)} 
                                    onClick={e => e.stopPropagation()}
                                    placeholder="exemplo@email.com" 
                                  />
                                ) : (
                                  <input 
                                    className={styles.input} 
                                    type="tel" 
                                    value={pendingPhone} 
                                    onChange={e => setPendingPhone(e.target.value)} 
                                    onClick={e => e.stopPropagation()}
                                    placeholder="(00) 00000-0000" 
                                  />
                                )}
                              </div>
                              <div className={styles.accordionCol}>
                                <label className={styles.label}>Nova Senha (opcional)</label>
                                <div className={styles.inputGroup}>
                                  <input
                                    className={styles.input}
                                    type="text"
                                    value={pendingPassword}
                                    onChange={e => setPendingPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onClick={e => e.stopPropagation()}
                                    placeholder="6 dígitos numéricos"
                                    maxLength={6}
                                  />
                                  <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    style={{ whiteSpace: 'nowrap' }}
                                    onClick={(e) => { e.stopPropagation(); setPendingPassword(Math.floor(100000 + Math.random() * 900000).toString()); }}
                                  >
                                    Gerar
                                  </button>
                                </div>
                              </div>
                              <div className={styles.accordionCol}>
                                <label className={styles.label}>Nível de Acesso</label>
                                <div className={styles.roleActionRow}>
                                  <select 
                                    className={styles.select}
                                    value={pendingRole}
                                    onChange={(e) => setPendingRole(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                      <option key={val} value={val}>{label}</option>
                                    ))}
                                  </select>
                                  {hasChanges && (
                                    <div className={styles.editActions}>
                                      <button 
                                        className={styles.btnSave}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const payload: any = { role: pendingRole as any, allowedApps: pendingAllowedApps };
                                          if (pendingLoginType === 'email') {
                                            payload.email = pendingEmail.toLowerCase();
                                            payload.phone = null;
                                          } else {
                                            payload.phone = pendingPhone.replace(/\D/g, '');
                                            payload.email = null;
                                          }
                                          if (pendingPassword.length > 0) payload.password = pendingPassword;
                                          updateMutation.mutate({ id: u._id, ...payload });
                                        }}
                                        disabled={updateMutation.isPending}
                                      >
                                        {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                                      </button>
                                      <button 
                                        className={styles.btnCancel}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPendingRole(role);
                                          const initialApps = u.allowedApps && u.allowedApps.length > 0
                                            ? u.allowedApps
                                            : ['franchise'];
                                          setPendingAllowedApps(initialApps);
                                          setPendingPassword('');
                                        }}
                                      >
                                        Não salvar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={styles.accordionCol}>
                                <label className={styles.label}>Acesso ao Sistema</label>
                                <div className={styles.systemsGrid}>
                                  <label className={styles.checkboxLabel}>
                                    <input
                                      type="checkbox"
                                      className={styles.checkbox}
                                      checked={pendingAllowedApps.includes('admin')}
                                      onChange={() => toggleApp('admin')}
                                    />
                                    <span>Morada do Sol</span>
                                  </label>
                                  <label className={styles.checkboxLabel}>
                                    <input
                                      type="checkbox"
                                      className={styles.checkbox}
                                      checked={pendingAllowedApps.includes('franchise')}
                                      onChange={() => toggleApp('franchise')}
                                    />
                                    <span>Nova Veneza</span>
                                  </label>
                                </div>
                              </div>
                              <div className={styles.accordionCol}>
                                <label className={styles.label}>Status da Conta</label>
                                <button 
                                  className={u.isActive !== false ? styles.btnActionDanger : styles.btnPrimary}
                                  style={{ padding: '0.625rem 1rem', width: 'fit-content' }}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setConfirmModal({ show: true, userId: u._id, userName: u.name, isActive: u.isActive !== false });
                                  }}
                                >
                                  {u.isActive !== false ? 'Desativar Usuário' : 'Reativar Usuário'}
                                </button>
                              </div>
                            </div>
                            
                            <div className={styles.includedModules}>
                              <label className={styles.label}>Módulos Inclusos ({pendingRole})</label>
                              <div className={styles.permList} style={{ marginTop: '0.5rem' }}>
                                {ROLE_PERMISSIONS[pendingRole]?.map(p => <span key={p} className={styles.badge}>{p}</span>)}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {isLoading && <div className={styles.empty}>Carregando usuários...</div>}
          {!isLoading && users.length === 0 && <div className={styles.empty}>Nenhum usuário encontrado.</div>}
        </div>
      </div>

      {confirmModal?.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '380px' }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {confirmModal.action === 'delete' ? 'Excluir Usuário' : confirmModal.isActive ? 'Desativar Usuário' : 'Reativar Usuário'}
              </h2>
              <button className={styles.btnClose} onClick={() => setConfirmModal(null)}>
                <span style={{ display: 'flex', transform: 'rotate(45deg)' }}><IconPlus /></span>
              </button>
            </div>
            <div className={styles.modalBody} style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}><IconAlert /></div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem', margin: 0 }}>
                {confirmModal.action === 'delete'
                  ? <>Tem certeza que deseja excluir <strong>{confirmModal.userName}</strong>?</>
                  : <>Tem certeza que deseja {confirmModal.isActive ? 'desativar' : 'reativar'} o acesso de <strong>{confirmModal.userName}</strong>?</>
                }
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                {confirmModal.action === 'delete'
                  ? 'Esta ação não pode ser desfeita.'
                  : confirmModal.isActive ? 'O usuário não conseguirá mais realizar login no sistema.' : 'O usuário voltará a ter acesso normal ao sistema.'
                }
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setConfirmModal(null)}>Cancelar</button>
              <button
                className={styles.btnDanger}
                onClick={() => {
                  if (confirmModal.action === 'delete') {
                    deleteMutation.mutate(confirmModal.userId);
                  } else {
                    updateMutation.mutate({ id: confirmModal.userId, isActive: !confirmModal.isActive });
                  }
                  setConfirmModal(null);
                }}
              >
                {confirmModal.action === 'delete' ? 'Sim, Excluir' : confirmModal.isActive ? 'Sim, Desativar' : 'Sim, Reativar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Novo Usuário</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newUser); }}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nome Completo</label>
                  <input className={styles.input} type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="Ex: João Silva" />
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>Tipo de Login</label>
                  <div className={styles.toggleGroup}>
                    <button type="button" className={`${styles.toggleBtn} ${loginType === 'email' ? styles.active : ''}`} onClick={() => setLoginType('email')}>E-mail</button>
                    <button type="button" className={`${styles.toggleBtn} ${loginType === 'phone' ? styles.active : ''}`} onClick={() => { setLoginType('phone'); if(!newUser.phone) setNewUser({...newUser, phone: '19'}); }}>Telefone</button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>{loginType === 'email' ? 'E-mail de Login' : 'Telefone de Login'}</label>
                  {loginType === 'email' ? (
                    <input className={styles.input} type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="exemplo@email.com" />
                  ) : (
                    <input className={styles.input} type="tel" required value={newUser.phone} onChange={e => setNewUser({...newUser, phone: maskPhone(e.target.value)})} placeholder="(00) 00000-0000" />
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Senha (6 dígitos)</label>
                  <div className={styles.inputGroup}>
                    <input 
                      className={styles.input} 
                      type="text" 
                      required 
                      maxLength={6}
                      value={newUser.password} 
                      onChange={e => setNewUser({...newUser, password: e.target.value.replace(/\D/g, '')})} 
                      placeholder="123456" 
                    />
                    <button type="button" className={styles.btnSecondary} onClick={generatePassword}>Gerar</button>
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nível de Acesso</label>
                  <select className={styles.select} value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})}>
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pode fazer login em</label>
                  <div className={styles.systemsGrid}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={newUser.allowedApps.includes('admin')}
                        onChange={() => toggleNewUserApp('admin')}
                      />
                      <span>Morada do Sol</span>
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={newUser.allowedApps.includes('franchise')}
                        onChange={() => toggleNewUserApp('franchise')}
                      />
                      <span>Nova Veneza</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
