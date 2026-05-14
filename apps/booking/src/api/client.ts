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
  const envUnitId = import.meta.env.VITE_UNIT_ID;
  if (envUnitId && !config.params?.unitId) {
    config.params = { ...config.params, unitId: envUnitId };
  }
  return config;
});

export function setupInterceptors(instance: any) {
  // Attach the JWT from localStorage to every request (unless flagged to skip,
  // which happens after a token refresh so we rely on the fresh cookie instead).
  instance.interceptors.request.use((config: any) => {
    if (!config._skipAuthHeader) {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
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
      // Only attempt a single refresh cycle (prevent infinite retry loop).
      if (
        error.response?.status === 401 &&
        !config?._retry &&
        !config?.url?.includes('/auth/refresh')
      ) {
        config._retry = true;
        try {
          // Ask the server for a new access token via the refresh cookie.
          await axios.post(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true });
          // After refresh the server sets a new httpOnly cookie.
          // Skip the stale localStorage token on the retry so the fresh cookie is used.
          config._skipAuthHeader = true;
          delete config.headers?.['Authorization'];
          return instance(config);
        } catch {
          // Refresh also failed — clear stale local state.
          // Do NOT redirect: the booking app has no /login page; let bookMutation
          // onError handle the 401 (it calls logout() and shows the guest form).
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
