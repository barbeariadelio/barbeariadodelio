import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import ClientForm from './ClientForm';
import styles from './Clients.module.scss';

interface Client {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  birthdate?: string;
  notes?: string;
}

interface AppointmentItem {
  _id: string;
  date: string;
  startTime: string;
  serviceId: { name: string } | null;
  employeeId: { name: string } | null;
  status: string;
  price: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   '#F59E0B',
  confirmed: '#1E88E5',
  completed: '#22C55E',
  cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending:   'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function isGuestEmail(email?: string) { return email?.includes('@delio.guest') ?? false; }

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Clients() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(search, 400);
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : '';
      const { data } = await api.get(`/clients${params}`);
      return Array.isArray(data) ? data : data.clients ?? [];
    },
  });

  const { data: appointments = [] } = useQuery<AppointmentItem[]>({
    queryKey: ['client-appointments', selectedId],
    queryFn: async () => {
      const { data } = await api.get(`/appointments/client/${selectedId}`);
      return Array.isArray(data) ? data : data.appointments ?? [];
    },
    enabled: !!selectedId,
  });

  const selectedClient = clients.find(c => c._id === selectedId) ?? null;

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>CLIENTES</h1>
        <button className={styles.newBtn} onClick={() => setShowForm(true)}>
          + Novo Cliente
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.listPanel}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {isLoading && <p className={styles.empty}>Carregando...</p>}
          {!isLoading && clients.length === 0 && (
            <p className={styles.empty}>Nenhum cliente encontrado.</p>
          )}

          <div className={styles.clientList}>
            {clients.map(client => (
              <div
                key={client._id}
                className={`${styles.clientRow} ${selectedId === client._id ? styles.selected : ''}`}
                onClick={() => handleSelect(client._id)}
              >
                <div className={styles.avatar}>
                  {client.name[0].toUpperCase()}
                </div>
                <div className={styles.clientInfo}>
                  <span className={styles.clientName}>{client.name}</span>
                  <span className={styles.clientSub}>
                    {client.phone ?? ''}{client.phone && client.email && !isGuestEmail(client.email) ? ' · ' : ''}{!isGuestEmail(client.email) ? (client.email ?? '') : ''}
                  </span>
                </div>
                <span className={styles.arrow}>{selectedId === client._id ? '✕' : '›'}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedClient && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div className={styles.detailAvatar}>
                {selectedClient.name[0].toUpperCase()}
              </div>
              <div>
                <h2 className={styles.detailName}>{selectedClient.name}</h2>
                {selectedClient.phone && <p className={styles.detailMeta}>{selectedClient.phone}</p>}
                {selectedClient.email && !isGuestEmail(selectedClient.email) && <p className={styles.detailMeta}>{selectedClient.email}</p>}
                {selectedClient.notes && <p className={styles.detailNotes}>{selectedClient.notes}</p>}
              </div>
            </div>

            <h3 className={styles.historyTitle}>Histórico de Atendimentos</h3>

            {appointments.length === 0 && (
              <p className={styles.empty}>Nenhum atendimento registrado.</p>
            )}

            <div className={styles.historyList}>
              {appointments.map(appt => (
                <div key={appt._id} className={styles.historyRow}>
                  <div className={styles.historyInfo}>
                    <span className={styles.historyDate}>{formatDate(appt.date)} — {appt.startTime}</span>
                    <span className={styles.historySub}>
                      {appt.serviceId?.name ?? 'Serviço'} · {appt.employeeId?.name ?? 'Barbeiro'}
                    </span>
                  </div>
                  <div className={styles.historyRight}>
                    <span
                      className={styles.badge}
                      style={{
                        background: `${STATUS_COLORS[appt.status]}22`,
                        color: STATUS_COLORS[appt.status],
                        border: `1px solid ${STATUS_COLORS[appt.status]}55`,
                      }}
                    >
                      {STATUS_LABELS[appt.status]}
                    </span>
                    <span className={styles.historyPrice}>{formatCurrency(appt.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['clients'] });
          }}
        />
      )}
    </div>
  );
}
