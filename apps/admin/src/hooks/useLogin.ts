import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, storageKeys } from '../api/client';
import type { User } from '@barber/types';

interface LoginForm {
  identifier: string;
  password: string;
  appId?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user?: MeResponse;
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
      localStorage.setItem(storageKeys.accessToken, auth.accessToken);
      localStorage.setItem(storageKeys.refreshToken, auth.refreshToken);

      const me = auth.user || (await api.get<MeResponse>('/auth/me')).data;

      if (me.role === 'client') {
        localStorage.removeItem(storageKeys.accessToken);
        localStorage.removeItem(storageKeys.refreshToken);
        throw new Error('Acesso restrito. Use o aplicativo de agendamento.');
      }

      // Persist unitId so the interceptor can scope requests to the right unit.
      if (me.unitId && !localStorage.getItem(storageKeys.selectedUnitId)) {
        localStorage.setItem(storageKeys.selectedUnitId, me.unitId);
      }

      setUser(me as unknown as User);
      navigate('/dashboard');
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string } } })?.response;
      const message =
        response?.data?.message ||
        (err instanceof Error ? err.message : null) ||
        'E-mail ou senha inválidos.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return { login, loading, error };
}
