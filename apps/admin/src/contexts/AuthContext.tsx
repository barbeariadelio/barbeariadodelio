import { createContext, useContext, useState, ReactNode } from 'react';
import type { User } from '@barber/types';
import { clearAuthStorage, storageKeys } from '../api/client';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(storageKeys.user);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });

  function handleSetUser(u: User | null) {
    if (u) {
      localStorage.setItem(storageKeys.user, JSON.stringify(u));
      // Persist unitId so the interceptor always scopes requests to this unit.
      const unitId = (u as unknown as { unitId?: string }).unitId;
      if (unitId && !localStorage.getItem(storageKeys.selectedUnitId)) {
        localStorage.setItem(storageKeys.selectedUnitId, unitId);
      }
    } else {
      localStorage.removeItem(storageKeys.user);
      localStorage.removeItem(storageKeys.selectedUnitId);
    }
    setUser(u);
  }

  function logout() {
    clearAuthStorage();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser: handleSetUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
