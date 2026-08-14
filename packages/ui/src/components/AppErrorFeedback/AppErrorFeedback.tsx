import { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import { API_ERROR_EVENT, ApiErrorNotice } from '@barber/utils';

interface AppErrorBoundaryProps {
  applicationName?: string;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught application error', { error, errorInfo });
  }

  public render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const appName = this.props.applicationName ? ` no ${this.props.applicationName}` : '';
    return (
      <div style={fallbackStyle.page}>
        <h1 style={fallbackStyle.title}>Ops! Algo deu errado{appName}.</h1>
        <p style={fallbackStyle.description}>
          Recarregue a página para continuar. Se o problema persistir, fale com a equipe responsável.
        </p>
        <button type="button" onClick={() => window.location.reload()} style={fallbackStyle.button}>
          Recarregar página
        </button>
      </div>
    );
  }
}

export function ApiErrorNotifications(): JSX.Element | null {
  const [notice, setNotice] = useState<ApiErrorNotice>();
  const [retrying, setRetrying] = useState(false);
  const lastNotice = useRef<{ key: string; at: number }>();

  useEffect(() => {
    const handleNotice = (event: Event) => {
      const detail = (event as CustomEvent<ApiErrorNotice>).detail;
      if (!detail?.error) return;

      const key = `${detail.error.code}:${detail.error.message}:${detail.error.requestId ?? ''}`;
      const now = Date.now();
      if (lastNotice.current?.key === key && now - lastNotice.current.at < 2_000) return;

      lastNotice.current = { key, at: now };
      setRetrying(false);
      setNotice(detail);
    };

    window.addEventListener(API_ERROR_EVENT, handleNotice);
    return () => window.removeEventListener(API_ERROR_EVENT, handleNotice);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(undefined), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  const { error, retry } = notice;
  const retryRequest = async () => {
    if (!retry || retrying) return;
    setRetrying(true);
    try {
      await retry();
      setNotice(undefined);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <aside role="alert" aria-live="assertive" style={noticeStyle.container}>
      <div style={noticeStyle.content}>
        <strong style={noticeStyle.title}>Não foi possível concluir a ação</strong>
        <span style={noticeStyle.message}>{error.message}</span>
        {error.requestId && <small style={noticeStyle.requestId}>Código: {error.requestId}</small>}
      </div>
      <div style={noticeStyle.actions}>
        {retry && (
          <button type="button" onClick={retryRequest} disabled={retrying} style={noticeStyle.retryButton}>
            {retrying ? 'Tentando...' : 'Tentar novamente'}
          </button>
        )}
        <button type="button" onClick={() => setNotice(undefined)} aria-label="Fechar aviso de erro" style={noticeStyle.closeButton}>
          ×
        </button>
      </div>
    </aside>
  );
}

const fallbackStyle: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', textAlign: 'center', background: '#0a0a0a', color: '#f5f5f5', fontFamily: 'system-ui, sans-serif' },
  title: { margin: 0, fontSize: '1.5rem' },
  description: { margin: 0, maxWidth: '26rem', color: '#b0b0b0', lineHeight: 1.5 },
  button: { padding: '0.75rem 1.25rem', border: 0, borderRadius: '0.375rem', background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};

const noticeStyle: Record<string, React.CSSProperties> = {
  container: { position: 'fixed', zIndex: 10_000, right: '1rem', bottom: '1rem', display: 'flex', maxWidth: '28rem', gap: '1rem', padding: '1rem', border: '1px solid #f4b5b5', borderRadius: '0.5rem', background: '#fff7f7', color: '#4a1010', boxShadow: '0 12px 28px rgba(0, 0, 0, 0.2)', fontFamily: 'system-ui, sans-serif' },
  content: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: { fontSize: '0.875rem' },
  message: { fontSize: '0.8125rem', lineHeight: 1.4 },
  requestId: { fontSize: '0.6875rem', color: '#7a3d3d' },
  actions: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem' },
  retryButton: { border: 0, borderRadius: '0.25rem', padding: '0.375rem 0.5rem', background: '#8f1d1d', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  closeButton: { border: 0, padding: 0, background: 'transparent', color: '#6d2424', fontSize: '1.25rem', lineHeight: 1, cursor: 'pointer' },
};
