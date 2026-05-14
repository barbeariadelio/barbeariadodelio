import { createContext, useContext, useState, ReactNode } from 'react';
import type { User } from '@barber/types';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Decode the JWT payload and check whether it has already expired. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // exp is in seconds; add a 10-second buffer to avoid edge cases
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() + 10_000;
  } catch {
    return true; // malformed token → treat as expired
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('user');
      const token = localStorage.getItem('accessToken');
      if (!stored || !token) return null;
      // If the stored access token is already expired, clear it immediately
      // so the booking confirm step shows the guest form right away.
      if (isTokenExpired(token)) {
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        return null;
      }
      return JSON.parse(stored) as User;
    } catch {
      return null;
    }
  });

  function handleSetUser(u: User | null) {
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
    setUser(u);
  }

  function logout() {
    localStorage.clear();
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
