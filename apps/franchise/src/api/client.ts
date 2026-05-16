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
  const hasUnitId = config.params?.unitId || config.url?.includes('unitId=');

  if (!hasUnitId) {
    // For Franchise apps, the unit ID should be retrieved from localStorage first
    // (set dynamically when navigating from the portal), then fallback to env.
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
      const config = error.config;
      const isAuthRoute = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

      if (error.response?.status === 401 && !isAuthRoute && !config?._retry) {
        config._retry = true;
        try {
          const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken: getStoredRefreshToken() });
          const accessToken = data?.data?.accessToken || data?.accessToken;
          if (accessToken) {
            localStorage.setItem(storageKeys.accessToken, accessToken);
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${accessToken}`;
          }
          return instance(config);
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
