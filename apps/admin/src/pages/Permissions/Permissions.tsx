import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './Permissions.module.scss';

type AppUser = {
  _id: string;
  name: string;
  email: string;
  role: 'owner' | 'franchisor' | 'franchisee' | 'employee' | 'client';
  isActive: boolean;
  unitId?: string | { name: string; _id: string };
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono (Admin)',
  franchisor: 'Franqueador',
  franchisee: 'Franqueado',
  employee: 'Funcionário',
  client: 'Cliente',
};

const ALL_PAGES = [
  { group: 'Visão Geral', items: [{ key: 'dashboard', label: 'Dashboard' }, { key: 'franchise', label: 'Visão Franquia' }] },
  { group: 'Gestão', items: [
    { key: 'clients', label: 'Clientes' },
    { key: 'employees', label: 'Funcionários' },
    { key: 'services', label: 'Serviços' },
    { key: 'units', label: 'Unidades' },
  ]},
  { group: 'Operações', items: [
    { key: 'finance', label: 'Financeiro' },
    { key: 'inventory', label: 'Estoque' },
  ]},
  { group: 'Sistema', items: [
    { key: 'settings', label: 'Configurações' },
    { key: 'permissions', label: 'Permissões' },
  ]},
];

const ALL_KEYS = ALL_PAGES.flatMap(g => g.items.map(i => i.key));

export default function Permissions() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => {
      const data = res.data;
      return Array.isArray(data) ? data : data.users ?? [];
    }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<AppUser>) => api.put(`/users/${selected?._id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      alert('Alterações salvas com sucesso!');
    },
  });

  const initials = (name?: string) =>
    (name || '??').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '??';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Permissões</h1>
          <p className={styles.subtitle}>Gerencie usuários e controle o acesso às funcionalidades do sistema</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Usuário
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.userList}>
          <p className={styles.listTitle}>Usuários ({users.length})</p>
          <div className={styles.listScroll}>
            {users.map(u => (
              <div
                key={u._id}
                className={`${styles.userCard} ${selected?._id === u._id ? styles.userCardActive : ''}`}
                onClick={() => setSelected(u)}
              >
                <div className={styles.userAvatar}>{initials(u.name)}</div>
                <div className={styles.userInfo}>
                  <p className={styles.userName}>{u.name}</p>
                  <p className={styles.userEmail}>{u.email}</p>
                </div>
                <div className={styles.userMeta}>
                  <span className={`${styles.badge} ${u.role === 'owner' ? styles.badgeGold : styles.badgeGray}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {isLoading && <p className={styles.empty}>Carregando usuários...</p>}
          {!isLoading && users.length === 0 && <p className={styles.empty}>Nenhum usuário encontrado.</p>}
        </div>

        <div className={styles.permPanel}>
          {!selected ? (
            <div className={styles.permEmpty}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <p>Selecione um usuário para gerenciar permissões</p>
            </div>
          ) : (
            <>
              <div className={styles.permHeader}>
                <div>
                  <h2 className={styles.permTitle}>Permissões de {selected.name}</h2>
                  <p className={styles.permSub}>Nível de acesso atual: <strong>{ROLE_LABELS[selected.role]}</strong></p>
                </div>
              </div>

              <div className={styles.roleSelector}>
                <label className={styles.label}>Alterar Nível de Acesso</label>
                <select 
                  className={styles.select}
                  value={selected.role}
                  onChange={(e) => updateMutation.mutate({ role: e.target.value as any })}
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.permGroups}>
                {ALL_PAGES.map(group => (
                  <div key={group.group} className={styles.permGroup}>
                    <p className={styles.permGroupLabel}>{group.group}</p>
                    {group.items.map(item => (
                      <label key={item.key} className={styles.permItem}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selected.role === 'owner' || (selected.role === 'franchisor')}
                          readOnly
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              <div className={styles.permFooter}>
                <button 
                  className={styles.btnDanger} 
                  onClick={() => {
                    if(confirm(`Desativar usuário ${selected.name}?`)) {
                      updateMutation.mutate({ isActive: !selected.isActive });
                    }
                  }}
                >
                  {selected.isActive ? 'Desativar Usuário' : 'Ativar Usuário'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
