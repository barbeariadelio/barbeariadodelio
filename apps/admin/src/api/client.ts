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
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const envUnitId = import.meta.env.VITE_UNIT_ID;
  if (envUnitId && !config.params?.unitId) {
    config.params = { ...config.params, unitId: envUnitId };
  }

  return config;
});

apiClient.interceptors.response.use(
  res => {
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      res.data = res.data.data;
    }
    return res;
  },
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${apiBaseUrl}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.data.accessToken);
          error.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return axios(error.config);
        } catch {
          localStorage.clear();
          window.location.href = `${import.meta.env.BASE_URL}login`;
        }
      }
    }
    return Promise.reject(error);
  },
);

export const api = apiClient;
