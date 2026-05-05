import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { User } from '@barber/types';

interface LoginForm {
  email: string;
  password: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

interface MeResponse {
  _id: string;
  name: string;
  email: string;
  role: string;
  unitId?: string;
  avatar?: string;
}

export function useLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function login(form: LoginForm) {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await api.post<AuthResponse>('/auth/login', form);
      localStorage.setItem('accessToken', auth.accessToken);
      localStorage.setItem('refreshToken', auth.refreshToken);

      const { data: me } = await api.get<MeResponse>('/auth/me');
      setUser(me as unknown as User);

      navigate('/dashboard');
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'E-mail ou senha inválidos.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return { login, loading, error };
}
