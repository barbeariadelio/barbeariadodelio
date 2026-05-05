# Design: Tasks Drag-and-Drop + Backend Persistence

**Date:** 2026-05-04  
**Status:** Approved

## Overview

Add drag-and-drop between Kanban columns with full backend persistence for both the admin and franchise apps. Bring the "Nova Tarefa" button to life with a creation modal. Replace localStorage with MongoDB.

## Approach

Native HTML5 Drag and Drop API (already used in franchise app) + single MongoDB `tasks` collection with a `system` field to separate admin and franchise data. No new dependencies.

## Backend

**Location:** `server/src/modules/tasks/`

**Files to create:**
- `task.model.ts` — Mongoose schema
- `task.service.ts` — business logic
- `task.controller.ts` — request handlers
- `task.routes.ts` — Express routes

**MongoDB Schema:**
```typescript
{
  title: string (required)
  description: string
  status: 'todo' | 'doing' | 'done'
  priority: 'high' | 'medium' | 'low'
  dueDate: Date
  system: 'admin' | 'franchise' (required)
  createdAt: Date
  updatedAt: Date
}
```

**REST Endpoints:**
```
GET    /api/tasks?system=admin|franchise   → list tasks for a system
POST   /api/tasks                          → create task
PATCH  /api/tasks/:id/status               → update status (drag-and-drop)
PATCH  /api/tasks/:id                      → update task fields
DELETE /api/tasks/:id                      → delete task
```

Register routes in `server/src/app.ts` or main router file.

## Frontend — Both Apps (admin + franchise)

**Drag-and-drop:**
- Standardize both apps with native HTML5 API (franchise already has it)
- `draggable` on task cards
- `onDragStart` stores `taskId` in `dataTransfer`
- `onDragOver` on columns prevents default and sets `dropEffect: 'move'`
- `onDrop` calls `PATCH /api/tasks/:id/status` then invalidates React Query cache

**"Nova Tarefa" Modal:**
- Form fields: title (required), description, priority (select), dueDate (date input)
- Submit calls `POST /api/tasks` with `system` set to the correct app
- On success: close modal, invalidate tasks query

**React Query integration:**
- `useQuery(['tasks', system])` → `GET /api/tasks?system=<system>`
- `useMutation` for create, status update (drag), and delete
- Remove all localStorage logic

**No visual changes** — existing Kanban layout and styles remain unchanged.

## Separation Between Apps

Tasks are separated by the `system` field:
- Admin app always sends/filters `system: 'admin'`
- Franchise app always sends/filters `system: 'franchise'`

## Files to Modify

**Backend (new files):**
- `server/src/modules/tasks/task.model.ts`
- `server/src/modules/tasks/task.service.ts`
- `server/src/modules/tasks/task.controller.ts`
- `server/src/modules/tasks/task.routes.ts`
- `server/src/app.ts` (register task routes)

**Frontend (modify existing):**
- `apps/admin/src/pages/Tasks/Tasks.tsx`
- `apps/franchise/src/pages/Tasks/Tasks.tsx`
