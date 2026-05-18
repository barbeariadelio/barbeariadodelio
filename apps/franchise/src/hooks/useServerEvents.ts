import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiBaseUrl, getStoredAccessToken } from '../api/client';

const EVENT_INVALIDATIONS: Record<string, string[][]> = {
  'appointments:change': [['appointments-day'], ['appointments-month'], ['emp-history']],
  'clients:change': [['clients']],
  'finance:change': [['finance'], ['transactions'], ['emp-vales']],
  'employees:change': [['employees']],
  'products:change': [['products']],
  'services:change': [['services']],
};

export function useServerEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;

    const url = `${apiBaseUrl}/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    for (const [eventName, queryKeys] of Object.entries(EVENT_INVALIDATIONS)) {
      es.addEventListener(eventName, () => {
        queryKeys.forEach(key => qc.invalidateQueries({ queryKey: key }));
      });
    }

    return () => es.close();
  }, [qc]);
}
