import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { User } from '@barber/types';
import { api, clearAuthStorage, getStoredAccessToken, storageKeys } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(() => {
    // Check for token in URL (SSO from Admin)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUnitId = params.get('unitId');
    
    if (urlToken) {
      localStorage.setItem(storageKeys.accessToken, urlToken);
    }
    if (urlUnitId) {
      localStorage.setItem(storageKeys.selectedUnitId, urlUnitId);
    }

    if (urlToken || urlUnitId) {
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
      const stored = localStorage.getItem(storageKeys.user);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    async function init() {
      const token = getStoredAccessToken();
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          handleSetUser(data);
        } catch {
          // refresh failed inside interceptor → auth storage already cleared
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSetUser(u: User | null) {
    if (u) {
      localStorage.setItem(storageKeys.user, JSON.stringify(u));
      // Persist the user's unitId so the API interceptor always filters by unit.
      // Only override if not already set (e.g. via SSO URL param from portal).
      const unitId = (u as unknown as { unitId?: string }).unitId;
      if (unitId && !localStorage.getItem(storageKeys.selectedUnitId)) {
        localStorage.setItem(storageKeys.selectedUnitId, unitId);
      }
    } else {
      localStorage.removeItem(storageKeys.user);
      localStorage.removeItem(storageKeys.accessToken);
      localStorage.removeItem(storageKeys.selectedUnitId);
    }
    setUser(u);
  }

  function logout() {
    clearAuthStorage();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser: handleSetUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
