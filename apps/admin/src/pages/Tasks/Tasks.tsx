import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmModal } from '@barber/ui';
import { apiClient } from '../../api/client';
import styles from './Tasks.module.scss';

interface Task {
  _id: string;
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
}

const SYSTEM = 'admin';

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; priority: Task['priority']; dueDate: string }>({ title: '', description: '', priority: 'medium', dueDate: '' });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', SYSTEM],
    queryFn: async () => {
      const res = await apiClient.get('/tasks', { params: { system: SYSTEM } });
      return res.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks', SYSTEM] });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      apiClient.patch(`/tasks/${id}/status`, { status }),
    onSuccess: invalidate,
  });

  const createTask = useMutation({
    mutationFn: (data: typeof form) =>
      apiClient.post('/tasks', { ...data, system: SYSTEM }),
    onSuccess: () => { invalidate(); setShowModal(false); setForm({ title: '', description: '', priority: 'medium', dueDate: '' }); },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tasks/${id}`),
    onSuccess: () => { invalidate(); setDeletingId(null); },
  });

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find(t => t._id === taskId);
    if (taskId && task && task.status !== status) {
      updateStatus.mutate({ id: taskId, status });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    createTask.mutate(form);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tarefas</h1>
          <p className={styles.subtitle}>Organize o fluxo de trabalho e pendências da barbearia</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Tarefa
        </button>
      </header>

      <div className={styles.columns}>
        {(['todo', 'doing', 'done'] as const).map(status => (
          <div
            key={status}
            className={styles.column}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, status)}
          >
            <div className={styles.columnHead}>
              <h3 className={styles.columnTitle}>
                {status === 'todo' ? 'A Fazer' : status === 'doing' ? 'Em Andamento' : 'Concluído'}
              </h3>
              <span className={styles.columnCount}>
                {tasks.filter(t => t.status === status).length}
              </span>
            </div>
            <div className={styles.taskList}>
              {tasks.filter(t => t.status === status).map(task => (
                <div
                  key={task._id}
                  className={styles.taskCard}
                  draggable
                  onDragStart={(e) => onDragStart(e, task._id)}
                >
                  <div className={styles.taskHeader}>
                    <span className={`${styles.priority} ${styles[task.priority]}`}>
                      {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa'}
                    </span>
                    <button
                      className={styles.btnCheck}
                      onClick={() => updateStatus.mutate({ id: task._id, status: task.status === 'done' ? 'todo' : 'done' })}
                    >
                      <IconCheck />
                    </button>
                  </div>
                  <h4 className={styles.taskTitle}>{task.title}</h4>
                  <p className={styles.taskDesc}>{task.description}</p>
                  <div className={styles.taskFooter}>
                    {task.dueDate && (
                      <div className={styles.dueDate}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                    <button className={styles.btnDelete} onClick={() => setDeletingId(task._id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Nova Tarefa</h2>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className={styles.field}>
                <label>Título *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Repor estoque de pomadas"
                />
              </div>
              <div className={styles.field}>
                <label>Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes opcionais..."
                />
              </div>
              <div className={styles.field}>
                <label>Prioridade</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Task['priority'] }))}>
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Data limite</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => { setShowModal(false); setForm({ title: '', description: '', priority: 'medium', dueDate: '' }); }}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={createTask.isPending}>
                  {createTask.isPending ? 'Salvando...' : 'Criar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir tarefa?"
          message="Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          danger
          onConfirm={() => deleteTask.mutate(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
