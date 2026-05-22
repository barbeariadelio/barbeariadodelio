import axios from 'axios';

export const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const storageKeys = {
  accessToken: 'barber.franchise.accessToken',
  refreshToken: 'barber.franchise.refreshToken',
  selectedUnitId: 'barber.franchise.selectedUnitId',
  user: 'barber.franchise.user',
};

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(storageKeys.accessToken);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(storageKeys.refreshToken);
}

export function getSelectedUnitId(): string | null {
  return localStorage.getItem(storageKeys.selectedUnitId);
}

export function clearAuthStorage(): void {
  localStorage.removeItem(storageKeys.accessToken);
  localStorage.removeItem(storageKeys.refreshToken);
  localStorage.removeItem(storageKeys.user);
  localStorage.removeItem(storageKeys.selectedUnitId);
}

export function resolveApiBaseUrl(unitApiUrl?: string): string {
  if (unitApiUrl && !(import.meta.env.PROD && unitApiUrl.includes('localhost'))) {
    return unitApiUrl;
  }
  return apiBaseUrl;
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
});

apiClient.interceptors.request.use(config => {
  // Resolve the active unit for this franchise instance.
  // Priority: localStorage (set on login or SSO) → VITE_UNIT_ID env var.
  const dynamicUnitId = getSelectedUnitId() || import.meta.env.VITE_UNIT_ID;

  if (dynamicUnitId) {
    // Send as both query param (legacy support) and X-Unit-ID header
    // (read by resolveUnitId() on the server for owner-level scoping).
    const hasUnitId = config.params?.unitId || config.url?.includes('unitId=');
    if (!hasUnitId) {
      config.params = { ...config.params, unitId: dynamicUnitId };
    }
    config.headers = config.headers || {};
    config.headers['X-Unit-ID'] = dynamicUnitId;
  }

  config.headers = config.headers || {};
  config.headers['X-App-Scope'] = 'franchise';

  const token = getStoredAccessToken();
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios
    .post(`${apiBaseUrl}/auth/refresh`, { refreshToken: getStoredRefreshToken() })
    .then(({ data }) => {
      const token = data?.data?.accessToken || data?.accessToken;
      if (token) localStorage.setItem(storageKeys.accessToken, token);
      return token ?? null;
    })
    .catch(() => null)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function setupInterceptors(instance: any) {
  instance.interceptors.response.use(
    (res: any) => {
      if (res.data && typeof res.data === 'object' && 'data' in res.data) {
        res.data = res.data.data;
      }
      return res;
    },
    async (error: any) => {
      const config = error.config;
      const isAuthRoute = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

      if (error.response?.status === 401 && !isAuthRoute) {
        if (!config?._retry) {
          config._retry = true;
          const newToken = await refreshAccessToken();
          if (newToken) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${newToken}`;
            return instance(config);
          }
        }
        // Refresh falhou ou o retry também deu 401 → deslogar
        clearAuthStorage();
        const loginUrl = `${import.meta.env.BASE_URL}login`.replace('//', '/');
        if (!window.location.pathname.includes('/login')) {
          window.location.href = loginUrl;
        }
      }
      return Promise.reject(error);
    },
  );
}

setupInterceptors(apiClient);

export const api = apiClient;
