import axios from 'axios';

export const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

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
    // Always use the app-scoped unit ID from env so each app (admin vs franchise)
    // reads and writes data for its own unit only.
    const envUnitId: string | undefined = import.meta.env.VITE_UNIT_ID;
    if (envUnitId) {
      config.params = { ...config.params, unitId: envUnitId };
    }
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
          await axios.post(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true });
          return instance(error.config);
        } catch {
          localStorage.removeItem('user');
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
