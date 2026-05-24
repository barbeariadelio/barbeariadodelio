import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { format } from 'date-fns';
import styles from './Layout.module.scss';
import logo from '../../assets/logo.png';
import { useServerEvents } from '../../hooks/useServerEvents';

function IconSun() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function IconMoon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function IconGrid() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function IconUsers() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconScissors() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function IconStar() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function IconDollarSign() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function IconSettings() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function IconLogOut() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IconBox() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function IconShield() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IconHome() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function IconShoppingCart() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>; }
function IconPercent() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>; }
function IconMenu() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>; }
function IconBell() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function IconX() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function IconPlus() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function IconEdit() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }

const NAV_ITEMS = [
  { path: '/',            label: 'Unidades',         icon: <IconHome />, external: true, roles: ['owner', 'cashier', 'employee'] },
  { path: '/dashboard',   label: 'Dashboard',      icon: <IconGrid />, roles: ['owner', 'cashier', 'employee'] },
  { path: '/inventory',   label: 'Estoque',        icon: <IconBox />, roles: ['owner', 'cashier'] },
  { path: '/sales',       label: 'Vendas',         icon: <IconShoppingCart />, roles: ['owner', 'cashier'] },
  { path: '/clients',     label: 'Clientes',        icon: <IconUsers />, roles: ['owner', 'cashier'] },
  { path: '/employees',   label: 'Funcionários',    icon: <IconScissors />, roles: ['owner'] },
  { path: '/commissions',  label: 'Comissões',       icon: <IconPercent />, roles: ['owner'] },
  { path: '/services',    label: 'Serviços',        icon: <IconStar />, roles: ['owner'] },
  { path: '/finance',      label: 'Financeiro',      icon: <IconDollarSign />, roles: ['owner', 'employee'] },
  { path: '/permissions',  label: 'Permissões',      icon: <IconShield />, roles: ['owner'] },
  { path: '/settings',    label: 'Configurações',   icon: <IconSettings />, roles: ['owner'] },
];

export default function Layout() {
  const { user, setUser, logout } = useAuth();
  const { theme, toggleTheme, updateTheme } = useTheme();
  const navigate = useNavigate();
  useServerEvents();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const notifsRef = useRef<HTMLDivElement>(null);
  const lastUserId = useRef<string | null>(null);
  const qc = useQueryClient();
  const lastNotifId = useRef<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifsRef.current && !notifsRef.current.contains(event.target as Node)) {
        setNotifsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: notifications = [], refetch: refetchNotifs } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    enabled: !!user,
    refetchInterval: 10000, // Shorter interval for better real-time feel
  });

  // Automatically invalidate appointment queries when new relevant notifications arrive
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      if (latest._id !== lastNotifId.current) {
        lastNotifId.current = latest._id;
        // If it's a booking-related notification, refresh the dashboard data
        if (['new', 'edit', 'cancellation'].includes(latest.type)) {
          qc.invalidateQueries({ queryKey: ['appointments-day'] });
          qc.invalidateQueries({ queryKey: ['appointments-month'] });
        }
      }
    }
  }, [notifications, qc]);

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => refetchNotifs(),
  });

  const unreadCount = notifications.filter(n => !n.readBy?.includes(user?._id)).length;

  const markAllAsReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => refetchNotifs(),
  });

  useEffect(() => {
    if (notifsOpen && unreadCount > 0 && !markAllAsReadMutation.isPending) {
      markAllAsReadMutation.mutate();
    }
  }, [notifsOpen, unreadCount, markAllAsReadMutation]);

  useEffect(() => {
    if (user && user.theme && !lastUserId.current) {
      updateTheme(user.theme as any);
      lastUserId.current = user._id;
    }
  }, [user, updateTheme]);

  const handleToggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    
    try {
      await api.put('/auth/theme', { theme: newTheme });
      if (user) {
        setUser({ ...user, theme: newTheme });
      }
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  function getDynamicLink(path: string) {
    if (!path.startsWith('/')) return path;
    const hostname = window.location.hostname;
    const port = window.location.port;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocal && (port === '3001' || port === '5173' || port === '5174' || port === '5175')) {
      return `http://${hostname}:3001${path}`;
    }
    return path;
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}>
      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <img src={logo} alt="Barbearia Délio" className={styles.logoImg} />
          <button className={styles.closeSidebarBtn} onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          {!collapsed && <span className={styles.unitName}>Jd Morada do Sol</span>}
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.filter(item => item.roles.includes(user?.role || '')).map(item => (
            item.external ? (
              <a key={item.path} href={getDynamicLink(item.path)} className={styles.navItem}>
                <span className={styles.navIcon}>{item.icon}</span>
                {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
              </a>
            ) : (
              <NavLink key={item.path} to={item.path} onClick={() => window.innerWidth <= 768 && setMobileOpen(false)} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                <span className={styles.navIcon}>{item.icon}</span>
                {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
              </NavLink>
            )
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{user?.name?.[0]?.toUpperCase() ?? 'U'}</div>
            {!collapsed && <div className={styles.userMeta}><span className={styles.userName}>{user?.name}</span><span className={styles.userRole}>{user?.role}</span></div>}
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className={styles.logoutBtn} title="Sair"><IconLogOut /></button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.toggleBtn} onClick={() => window.innerWidth <= 768 ? setMobileOpen(!mobileOpen) : setCollapsed(!collapsed)}><IconMenu /></button>
          <div className={styles.topbarActions}>
            <div className={styles.notifWrapper} ref={notifsRef}>
              <button className={`${styles.topbarBtn} ${notifsOpen ? styles.activeBtn : ''}`} onClick={() => setNotifsOpen(!notifsOpen)}>
                <IconBell />
                {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount}</span>}
              </button>
              {notifsOpen && (
                <div className={styles.notifsDropdown}>
                  <div className={styles.notifHeader}><span>Notificações</span><span className={styles.notifCount}>{unreadCount}</span></div>
                  <div className={styles.notifList}>
                    {notifications.length > 0 ? (
                      notifications.map(n => {
                        const isRead = n.readBy?.includes(user?._id);
                        return (
                          <div key={n._id} className={`${styles.notifItem} ${!isRead ? styles.unread : ''}`} onClick={() => !isRead && markAsReadMutation.mutate(n._id)}>
                            <div className={`${styles.notifIcon} ${styles[n.type]}`}>
                              {n.type === 'cancellation' ? <IconX /> : n.type === 'edit' ? <IconEdit /> : <IconPlus />}
                            </div>
                            <div className={styles.notifContent}>
                              <p className={styles.notifText}>{n.message}</p>
                              {n.appointmentId && (
                                <p className={styles.notifApptInfo}>
                                  {n.appointmentId.date.split('-').reverse().join('/')} às {n.appointmentId.startTime} · {n.appointmentId.employeeId?.name || 'Profissional'}
                                </p>
                              )}
                              <p className={styles.notifMeta}>
                                Notificado {format(new Date(n.createdAt), "d/M 'às' HH:mm")}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.notifEmpty}>
                        <p>Nenhuma notificação nova.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button className={styles.themeToggle} onClick={handleToggleTheme} title={`Alternar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
