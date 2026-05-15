import axios from 'axios';

export const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const storageKeys = {
  accessToken: 'barber.admin.accessToken',
  refreshToken: 'barber.admin.refreshToken',
  selectedUnitId: 'barber.admin.selectedUnitId',
  user: 'barber.admin.user',
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
}

export function resolveApiBaseUrl(unitApiUrl?: string): string {
  if (unitApiUrl && !(import.meta.env.PROD && unitApiUrl.includes('localhost'))) {
    return unitApiUrl;
  }
  return apiBaseUrl;
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

apiClient.interceptors.request.use(config => {
  const hasUnitId = config.params?.unitId || config.url?.includes('unitId=');

  if (!hasUnitId) {
    // Check localStorage for a dynamically selected unit first (for context switching)
    // before falling back to the default env unit ID.
    const dynamicUnitId = getSelectedUnitId() || import.meta.env.VITE_UNIT_ID;
    if (dynamicUnitId) {
      config.params = { ...config.params, unitId: dynamicUnitId };
    }
  }

  const token = getStoredAccessToken();
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function setupInterceptors(instance: any) {
  instance.interceptors.response.use(
    (res: any) => {
      if (res.data && typeof res.data === 'object' && 'data' in res.data) {
        res.data = res.data.data;
      }
      return res;
    },
    async (error: any) => {
      const isAuthRoute = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/refresh');
  
      if (error.response?.status === 401 && !isAuthRoute) {
        try {
          const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken: getStoredRefreshToken() }, { withCredentials: true });
          const accessToken = data?.data?.accessToken || data?.accessToken;
          if (accessToken) localStorage.setItem(storageKeys.accessToken, accessToken);
          return instance(error.config);
        } catch {
          clearAuthStorage();
          const loginUrl = `${import.meta.env.BASE_URL}login`.replace('//', '/');
          window.location.href = loginUrl;
        }
      }
      return Promise.reject(error);
    },
  );
}

setupInterceptors(apiClient);

export const api = apiClient;
