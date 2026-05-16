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
});

apiClient.interceptors.request.use(config => {
  const envUnitId = import.meta.env.VITE_UNIT_ID;
  if (envUnitId && !config.params?.unitId) {
    config.params = { ...config.params, unitId: envUnitId };
  }
  return config;
});

export function setupInterceptors(instance: any) {
  instance.interceptors.request.use((config: any) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (res: any) => {
      if (res.data && typeof res.data === 'object' && 'data' in res.data) {
        res.data = res.data.data;
      }
      return res;
    },
    async (error: any) => {
      const config = error.config;
      if (
        error.response?.status === 401 &&
        !config?._retry &&
        !config?.url?.includes('/auth/refresh')
      ) {
        config._retry = true;
        try {
          const refreshToken = localStorage.getItem('refreshToken');
          const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken });
          const accessToken = data?.data?.accessToken || data?.accessToken;
          if (accessToken) {
            localStorage.setItem('accessToken', accessToken);
            config.headers = config.headers || {};
            config.headers['Authorization'] = `Bearer ${accessToken}`;
          }
          return instance(config);
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
        }
      }
      return Promise.reject(error);
    }
  );
}

setupInterceptors(apiClient);

export const api = apiClient;
