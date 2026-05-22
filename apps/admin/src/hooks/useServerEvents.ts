import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiBaseUrl, getStoredAccessToken, refreshAccessToken } from '../api/client';

const EVENT_INVALIDATIONS: Record<string, string[][]> = {
  'appointments:change': [['appointments-day'], ['appointments-month'], ['emp-history']],
  'clients:change': [['clients'], ['client-detail'], ['clients-for-package']],
  'finance:change': [['finance'], ['transactions'], ['emp-vales']],
  'employees:change': [['employees']],
  'products:change': [['products']],
  'services:change': [['services']],
};

export function useServerEvents() {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const token = getStoredAccessToken();
      if (!token) return;

      const es = new EventSource(`${apiBaseUrl}/events?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      for (const [eventName, queryKeys] of Object.entries(EVENT_INVALIDATIONS)) {
        es.addEventListener(eventName, () => {
          queryKeys.forEach(key => qc.invalidateQueries({ queryKey: key }));
        });
      }

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!destroyed) {
          reconnectTimer.current = setTimeout(async () => {
            await refreshAccessToken();
            connect();
          }, 5_000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [qc]);
}
