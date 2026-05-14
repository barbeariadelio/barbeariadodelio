import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { User } from '@barber/types';
import { api } from '../api/client';

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
      localStorage.setItem('accessToken', urlToken);
    }
    if (urlUnitId) {
      localStorage.setItem('selectedUnitId', urlUnitId);
    }

    if (urlToken || urlUnitId) {
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
      const stored = localStorage.getItem('user');
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    async function init() {
      const token = localStorage.getItem('accessToken');
      if (token && !user) {
        try {
          const { data } = await api.get('/auth/me');
          handleSetUser(data);
        } catch {
          localStorage.removeItem('accessToken');
        }
      }
      setLoading(false);
    }
    init();
  }, [user]);

  function handleSetUser(u: User | null) {
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
    }
    setUser(u);
  }

  function logout() {
    localStorage.clear();
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
