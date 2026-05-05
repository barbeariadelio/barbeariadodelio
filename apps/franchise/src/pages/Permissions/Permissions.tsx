import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import styles from './Permissions.module.scss';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
}

const PERMISSION_GROUPS = [
  {
    id: 'gestao',
    title: 'Gestão e Unidades',
    keys: ['manage_units', 'view_reports', 'manage_finances', 'manage_employees']
  },
  {
    id: 'operacoes',
    title: 'Operações Diárias',
    keys: ['manage_appointments', 'manage_inventory', 'view_clients', 'manage_services']
  },
  {
    id: 'sistema',
    title: 'Configurações e Sistema',
    keys: ['manage_settings', 'view_logs', 'manage_permissions', 'api_access']
  }
];

const PERMISSION_LABELS: Record<string, string> = {
  manage_units: 'Gerenciar Unidades',
  view_reports: 'Visualizar Relatórios',
  manage_finances: 'Fluxo Financeiro',
  manage_employees: 'Gestão de Equipe',
  manage_appointments: 'Agenda e Reservas',
  manage_inventory: 'Controle de Estoque',
  view_clients: 'Base de Clientes',
  manage_services: 'Menu de Serviços',
  manage_settings: 'Configurações Gerais',
  view_logs: 'Logs de Atividade',
  manage_permissions: 'Controle de Acessos',
  api_access: 'Chaves de API'
};

export default function Permissions() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return Array.isArray(data) ? data : data.users ?? [];
    }
  });

  const selectedUser = users.find(u => u._id === selectedUserId);

  const updateMutation = useMutation({
    mutationFn: (data: { id: string, role: string }) => api.put(`/users/${data.id}`, { role: data.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  });

  function handleRoleChange(role: string) {
    if (!selectedUserId) return;
    updateMutation.mutate({ id: selectedUserId, role });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Permissões</h1>
          <p className={styles.subtitle}>Gerencie níveis de acesso e responsabilidades da equipe</p>
        </div>
      </header>

      <div className={styles.splitView}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <span>Usuários ({users.length})</span>
          </div>
          <div className={styles.userList}>
            {isLoading && <div className={styles.loading}>Carregando...</div>}
            {users.map(user => (
              <button
                key={user._id}
                className={`${styles.userCard} ${selectedUserId === user._id ? styles.active : ''}`}
                onClick={() => setSelectedUserId(user._id)}
              >
                <div className={styles.userAvatar}>
                  {user.name[0].toUpperCase()}
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{user.name}</span>
                  <span className={styles.userEmail}>{user.email}</span>
                </div>
                <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                  {user.role}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.content}>
          {selectedUser ? (
            <div className={styles.details}>
              <div className={styles.detailsHeader}>
                <div className={styles.detailsUser}>
                  <h2>{selectedUser.name}</h2>
                  <span>{selectedUser.email}</span>
                </div>
                <div className={styles.statusToggle}>
                  <span className={styles.statusLabel}>Acesso ao Sistema</span>
                  <div className={styles.toggleActive}>Ativo</div>
                </div>
              </div>

              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Papel no Sistema</h3>
                <div className={styles.roleGrid}>
                  {['admin', 'manager', 'owner', 'employee'].map(role => (
                    <button
                      key={role}
                      className={`${styles.roleOption} ${selectedUser.role === role ? styles.roleActive : ''}`}
                      onClick={() => handleRoleChange(role)}
                    >
                      <span className={styles.roleName}>{role}</span>
                      <span className={styles.roleDesc}>
                        {role === 'admin' ? 'Acesso total e configurações' :
                         role === 'manager' ? 'Gestão de unidade e equipe' :
                         role === 'owner' ? 'Dono da unidade / Franqueado' :
                         'Operador e agendamentos'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Chaves de Acesso Específicas</h3>
                <div className={styles.permissionGroups}>
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.id} className={styles.group}>
                      <h4 className={styles.groupTitle}>{group.title}</h4>
                      <div className={styles.keysList}>
                        {group.keys.map(key => (
                          <label key={key} className={styles.keyItem}>
                            <input
                              type="checkbox"
                              checked={selectedUser.role === 'admin' || (selectedUser.role === 'owner' && group.id !== 'sistema')}
                              readOnly
                            />
                            <span className={styles.keyLabel}>{PERMISSION_LABELS[key]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>Selecione um usuário</h3>
              <p>Escolha um membro da equipe na lista ao lado para gerenciar suas permissões de acesso.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
