import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiErrorNotifications, AppErrorBoundary } from '@barber/ui';
import { reportApiError } from '@barber/utils';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import '../../../packages/styles/src/index.scss';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => reportApiError(error, () => query.fetch()),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.options.onError) reportApiError(error);
    },
  }),
  defaultOptions: { queries: { retry: 1, staleTime: 0 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary applicationName="painel administrativo">
      <ThemeProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <QueryClientProvider client={queryClient}>
            <ApiErrorNotifications />
            <AuthProvider>
              <App />
            </AuthProvider>
          </QueryClientProvider>
        </BrowserRouter>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
