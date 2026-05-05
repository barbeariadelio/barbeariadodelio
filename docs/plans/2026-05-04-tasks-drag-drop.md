# Tasks Drag-and-Drop + Backend Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace localStorage with MongoDB for task storage, add drag-and-drop to both admin and franchise apps, and implement the "Nova Tarefa" creation modal.

**Architecture:** Single `tasks` collection in MongoDB with a `system` field ('admin' | 'franchise') to separate data per app. Native HTML5 drag-and-drop (already in franchise, to be added to admin). React Query replaces all localStorage logic in both frontends.

**Tech Stack:** Express + Mongoose (server), React + @tanstack/react-query + axios (frontend)

---

### Task 1: Create Task Mongoose Model

**Files:**
- Create: `server/src/modules/tasks/task.model.ts`

**Step 1: Create the model file**

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description?: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  system: 'admin' | 'franchise';
}

const taskSchema = new Schema<ITask>(
  {
    title:       { type: String, required: true },
    description: { type: String },
    status:      { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
    priority:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate:     { type: String },
    system:      { type: String, enum: ['admin', 'franchise'], required: true },
  },
  { timestamps: true },
);

export const TaskModel = mongoose.model<ITask>('Task', taskSchema);
```

**Step 2: Verify the file compiles**

Run from the `server` directory:
```bash
npx tsc --noEmit
```
Expected: no errors.

---

### Task 2: Create Task Service

**Files:**
- Create: `server/src/modules/tasks/task.service.ts`

**Step 1: Create the service file**

```typescript
import { TaskModel } from './task.model';

export class TaskService {
  findBySystem(system: string) {
    return TaskModel.find({ system }).sort({ createdAt: -1 });
  }

  create(data: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    system: string;
  }) {
    return TaskModel.create(data);
  }

  updateStatus(id: string, status: string) {
    return TaskModel.findByIdAndUpdate(id, { status }, { new: true });
  }

  delete(id: string) {
    return TaskModel.findByIdAndDelete(id);
  }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors.

---

### Task 3: Create Task Controller

**Files:**
- Create: `server/src/modules/tasks/task.controller.ts`

**Step 1: Create the controller file**

```typescript
import { Response, NextFunction } from 'express';
import { TaskService } from './task.service';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { ok, created } from '../../shared/utils/responseHelper';

const service = new TaskService();

export async function listTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const system = req.query.system as string;
    if (!system) { ok(res, []); return; }
    const tasks = await service.findBySystem(system);
    ok(res, tasks);
  } catch (e) { next(e); }
}

export async function createTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await service.create(req.body);
    created(res, task);
  } catch (e) { next(e); }
}

export async function updateTaskStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await service.updateStatus(req.params.id, req.body.status);
    ok(res, task);
  } catch (e) { next(e); }
}

export async function deleteTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.delete(req.params.id);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors.

---

### Task 4: Create Task Routes and Register in app.ts

**Files:**
- Create: `server/src/modules/tasks/task.routes.ts`
- Modify: `server/src/app.ts`

**Step 1: Create the routes file**

```typescript
import { Router } from 'express';
import { listTasks, createTask, updateTaskStatus, deleteTask } from './task.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

export const taskRoutes = Router();

taskRoutes.get('/',           authenticate, listTasks);
taskRoutes.post('/',          authenticate, createTask);
taskRoutes.patch('/:id/status', authenticate, updateTaskStatus);
taskRoutes.delete('/:id',     authenticate, deleteTask);
```

**Step 2: Register in app.ts**

In `server/src/app.ts`, add the import after the existing imports:
```typescript
import { taskRoutes } from './modules/tasks/task.routes';
```

Then add the route registration after `app.use('/products', productRoutes);`:
```typescript
app.use('/tasks', taskRoutes);
```

**Step 3: Start the server and verify the endpoint responds**

```bash
# From server directory
npm run dev
```

Then in a new terminal:
```bash
curl -s http://localhost:3001/health
```
Expected: `{"status":"ok","timestamp":"..."}`

**Step 4: Commit**

```bash
git add server/src/modules/tasks/ server/src/app.ts
git commit -m "feat: add tasks module (model, service, controller, routes)"
```

---

### Task 5: Update Franchise Tasks Page

**Files:**
- Modify: `apps/franchise/src/pages/Tasks/Tasks.tsx`
- Modify: `apps/franchise/src/pages/Tasks/Tasks.module.scss`

**Step 1: Add modal styles to Tasks.module.scss**

At the end of the file, append:

```scss
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modalTitle {
  font-size: 1.1rem;
  font-weight: 600;
  color: #F5F5F5;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 0.8rem;
    color: #888;
    font-weight: 500;
  }

  input, textarea, select {
    background: #111;
    border: 1px solid #2A2A2A;
    border-radius: 8px;
    color: #F5F5F5;
    padding: 10px 12px;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;

    &:focus {
      border-color: #1565C0;
    }
  }

  textarea {
    resize: vertical;
    min-height: 80px;
  }

  select option {
    background: #1A1A1A;
  }
}

.modalActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btnSecondary {
  background: transparent;
  border: 1px solid #2A2A2A;
  color: #888;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: #444;
    color: #CCC;
  }
}
```

**Step 2: Replace the full Tasks.tsx with API-connected version**

Replace the entire content of `apps/franchise/src/pages/Tasks/Tasks.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
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

const SYSTEM = 'franchise';

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
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '' });

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
    if (taskId) updateStatus.mutate({ id: taskId, status });
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
          <p className={styles.subtitle}>Organize o fluxo de trabalho e pendências da unidade</p>
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
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
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
                <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
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
```

**Step 3: Verify the franchise app starts without errors**

```bash
# From apps/franchise directory or repo root
npm run dev
```
Expected: no TypeScript errors, page loads, tasks list from API.

**Step 4: Commit**

```bash
git add apps/franchise/src/pages/Tasks/
git commit -m "feat(franchise): wire Tasks page to API with drag-and-drop and Nova Tarefa modal"
```

---

### Task 6: Update Admin Tasks Page

**Files:**
- Modify: `apps/admin/src/pages/Tasks/Tasks.tsx`
- Modify: `apps/admin/src/pages/Tasks/Tasks.module.scss`

**Step 1: Add the same modal styles to admin's Tasks.module.scss**

Append the exact same CSS block from Task 5 Step 1 to `apps/admin/src/pages/Tasks/Tasks.module.scss`.

**Step 2: Check if admin has a ConfirmModal component**

Run:
```bash
ls apps/admin/src/components/
```

If `ConfirmModal` folder exists, import it the same way as franchise.
If it does NOT exist, skip the ConfirmModal and use `window.confirm` as fallback:
```typescript
// fallback delete (no ConfirmModal in admin)
const handleDelete = (id: string) => {
  if (window.confirm('Excluir tarefa? Esta ação não pode ser desfeita.')) {
    deleteTask.mutate(id);
  }
};
```

**Step 3: Replace the full Tasks.tsx for admin**

Replace the entire content of `apps/admin/src/pages/Tasks/Tasks.tsx`.

If ConfirmModal EXISTS in admin:
```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
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
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '' });

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
    if (taskId) updateStatus.mutate({ id: taskId, status });
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
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
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
                <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
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
```

If ConfirmModal does NOT exist in admin — use the same code above but replace `deletingId` state and the ConfirmModal block at the bottom with:
```tsx
// In the card:
<button className={styles.btnDelete} onClick={() => {
  if (window.confirm('Excluir tarefa? Esta ação não pode ser desfeita.')) {
    deleteTask.mutate(task._id);
  }
}}>
  Excluir
</button>

// Remove: deletingId state, setDeletingId calls, and the ConfirmModal block
```

**Step 4: Verify the admin app starts without errors**

```bash
npm run dev
```
Expected: no TypeScript errors, Tasks page loads data from API.

**Step 5: Commit**

```bash
git add apps/admin/src/pages/Tasks/
git commit -m "feat(admin): wire Tasks page to API with drag-and-drop and Nova Tarefa modal"
```

---

## Manual End-to-End Verification

After all tasks are complete:

1. Open franchise Tasks page → should show an empty board (no localStorage data)
2. Click "Nova Tarefa" → modal opens with form fields
3. Fill title + priority + date → click "Criar Tarefa" → card appears in "A Fazer"
4. Drag card to "Em Andamento" → card moves, refresh page → card is still in "Em Andamento" (persisted!)
5. Open admin Tasks page → board is empty (different system, data is separate)
6. Create a task in admin → it does NOT appear in franchise board
7. Click "Excluir" → confirmation prompt → task is removed
