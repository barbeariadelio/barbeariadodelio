import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, storageKeys, getSelectedUnitId } from '../api/client';
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
      // Pass the active unit ID as appId so the server validates the user's
      // allowedApps and rejects accounts that don't belong to this franchise unit.
      const unitId = getSelectedUnitId() || import.meta.env.VITE_UNIT_ID;
      const { data: auth } = await api.post<AuthResponse>('/auth/login', {
        ...form,
        appId: unitId || form.appId,
      });
      localStorage.setItem(storageKeys.accessToken, auth.accessToken);
      localStorage.setItem(storageKeys.refreshToken, auth.refreshToken);

      const me = auth.user || (await api.get<MeResponse>('/auth/me')).data;
      // Persist unitId immediately so the interceptor filters all subsequent requests.
      if (me.unitId && !getSelectedUnitId()) {
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
