# Services Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `isOnline` flag to services, duration dropdown, `serviceIds` per employee, and reorder booking flow to barber-first with service filtering.

**Architecture:** Server-side: add two schema fields (`isOnline` on Service, `serviceIds` on User). Client-side: update forms (ServiceForm, EmployeeForm), list cards (Services.tsx), internal booking form (AppointmentForm), and client booking flow (Book.tsx step reorder).

**Tech Stack:** Mongoose (MongoDB), React + TypeScript, TanStack Query, Vite monorepo (apps/franchise, apps/admin, apps/booking, server).

---

## Task 1: Add `isOnline` to Service model

**Files:**
- Modify: `server/src/modules/services/service.model.ts`

**Step 1: Add field to schema**

In `serviceSchema`, after `isActive`:
```ts
isOnline: { type: Boolean, default: false },
```

Also add to the `IService` interface:
```ts
isOnline: boolean;
```

**Step 2: Verify server compiles**

```bash
cd barber-system/server && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**
```bash
git add server/src/modules/services/service.model.ts
git commit -m "feat(services): add isOnline field (default false)"
```

---

## Task 2: Add `serviceIds` to User model

**Files:**
- Modify: `server/src/modules/auth/auth.model.ts`

**Step 1: Add to IUser interface** (after `allowedApps`):
```ts
serviceIds?: mongoose.Types.ObjectId[];
```

**Step 2: Add to userSchema** (after `allowedApps`):
```ts
serviceIds: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
```

**Step 3: Verify**
```bash
cd barber-system/server && npx tsc --noEmit
```

**Step 4: Commit**
```bash
git add server/src/modules/auth/auth.model.ts
git commit -m "feat(employees): add serviceIds field for per-barber service linking"
```

---

## Task 3: Service API — support `?online=true` filter for booking

**Files:**
- Modify: `server/src/modules/services/service.service.ts`
- Modify: `server/src/modules/services/service.controller.ts`

**Step 1: Add `onlineOnly` param to `findByUnit`**

In `service.service.ts`, change `findByUnit` signature and filter:
```ts
async findByUnit(unitId: string, onlineOnly = false): Promise<IService[]> {
  const cacheKey = `services:${unitId}:${onlineOnly}`;
  const cached = sharedCache.get<IService[]>(cacheKey);
  if (cached) return cached;

  const filter: Record<string, unknown> = { unitId, isActive: true };
  if (onlineOnly) filter.isOnline = true;

  const services = await ServiceModel.find(filter).sort({ name: 1 });
  sharedCache.set(cacheKey, services, 60);
  return services;
}
```

**Step 2: Read `?online=true` in controller**

In `service.controller.ts`, `listServices`:
```ts
const onlineOnly = req.query.online === 'true';
const services = await service.findByUnit(unitId, onlineOnly);
```

**Step 3: Verify**
```bash
cd barber-system/server && npx tsc --noEmit
```

**Step 4: Commit**
```bash
git add server/src/modules/services/service.service.ts server/src/modules/services/service.controller.ts
git commit -m "feat(services): support ?online=true filter for client booking"
```

---

## Task 4: ServiceForm — duration dropdown (franchise + admin)

Both files are nearly identical. Make the same change in both:
- `apps/franchise/src/pages/Services/ServiceForm.tsx`
- `apps/admin/src/pages/Services/ServiceForm.tsx`

**Step 1: Replace state initialization**

Find:
```ts
const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? '30'));
```
Replace with:
```ts
const [durationMinutes, setDurationMinutes] = useState(String(service?.durationMinutes ?? 30));
```

**Step 2: Add the options constant** (at top of file, after imports):
```ts
const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1h',     value: 60 },
  { label: '1h 15',  value: 75 },
  { label: '1h 30',  value: 90 },
  { label: '1h 45',  value: 105 },
  { label: '2h',     value: 120 },
  { label: '2h 30',  value: 150 },
  { label: '3h',     value: 180 },
];
```

**Step 3: Replace the duration input in JSX**

Find:
```tsx
<div className={styles.field}>
  <label className={styles.label}>Duração (min) *</label>
  <input type="number" min="5" step="5" className={styles.input} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required />
</div>
```
Replace with:
```tsx
<div className={styles.field}>
  <label className={styles.label}>Duração *</label>
  <select className={styles.select} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required>
    {DURATION_OPTIONS.map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
</div>
```

**Step 4: Verify payload is still number**

In `handleSubmit`, confirm line stays:
```ts
durationMinutes: parseInt(durationMinutes, 10) || 30,
```
No change needed — `parseInt` already converts string value from select.

**Step 5: Repeat for admin file**

Apply identical changes to `apps/admin/src/pages/Services/ServiceForm.tsx`.

**Step 6: Commit**
```bash
git add apps/franchise/src/pages/Services/ServiceForm.tsx apps/admin/src/pages/Services/ServiceForm.tsx
git commit -m "feat(services): replace duration minutes input with dropdown"
```

---

## Task 5: ServiceForm — add `isOnline` toggle (franchise + admin)

Both `ServiceForm.tsx` files (franchise + admin).

**Step 1: Add state** (after `showPricePrefix` state line):
```ts
const [isOnline, setIsOnline] = useState(service?.isOnline === true);
```

**Step 2: Add to Service interface** (in both files):
```ts
isOnline?: boolean;
```

**Step 3: Add toggle in JSX** — after the `showPrice/showPricePrefix` section, add:
```tsx
<div className={styles.field}>
  <label className={styles.label}>Disponibilidade Online</label>
  <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', marginTop: '0.25rem' }}>
    <input
      type="checkbox"
      checked={isOnline}
      onChange={e => setIsOnline(e.target.checked)}
      style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
    />
    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
      Disponível para agendamento online pelo cliente
    </span>
  </label>
  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
    Novos serviços começam desabilitados. Ative quando quiser que clientes possam agendar.
  </p>
</div>
```

**Step 4: Include in payload** in `handleSubmit`:
```ts
isOnline,
```
Add this inside the `payload` object.

**Step 5: Repeat for admin file**

**Step 6: Commit**
```bash
git add apps/franchise/src/pages/Services/ServiceForm.tsx apps/admin/src/pages/Services/ServiceForm.tsx
git commit -m "feat(services): add isOnline toggle to ServiceForm (defaults off)"
```

---

## Task 6: Services.tsx — inline `isOnline` toggle on cards (franchise + admin)

Both `Services.tsx` files.

**Step 1: Add `isOnline` to Service interface**
```ts
isOnline?: boolean;
```

**Step 2: Add `isOnline` toggle button** in the single-service card inline-buttons section.

Find the block that has the `showPrice` and `showPricePrefix` toggle buttons (the `div` with `onClick={e => e.stopPropagation()}` and inline flex styles). Add a third button after them:

```tsx
<button
  title="Disponível para agendamento online"
  onClick={() => updateDisplay.mutate({ id: svc._id, isOnline: !svc.isOnline })}
  style={{
    fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 20, border: 'none', cursor: 'pointer',
    background: svc.isOnline ? 'rgba(234,179,8,0.15)' : 'rgba(120,120,120,0.12)',
    color: svc.isOnline ? '#eab308' : 'var(--text-muted)',
    transition: 'all 0.15s',
  }}
>
  {svc.isOnline ? '✓' : '✕'} Online
</button>
```

**Step 3: Add `isOnline` toggle button to PackageDashboard** — in `PackageDashboard`, find `dashActions` and add the same toggle button after the Editar button, before Excluir:
```tsx
<button
  title="Disponível para agendamento online"
  onClick={e => { e.stopPropagation(); updateDisplay.mutate({ id: svc._id, isOnline: !svc.isOnline }); }}
  style={{
    fontSize: '0.75rem', fontWeight: 600, padding: '0.35rem 0.65rem', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: svc.isOnline ? 'rgba(234,179,8,0.15)' : 'rgba(120,120,120,0.12)',
    color: svc.isOnline ? '#eab308' : 'var(--text-muted)',
  }}
>
  {svc.isOnline ? 'Online ✓' : 'Offline'}
</button>
```

Note: `PackageDashboard` needs access to `updateDisplay` mutation. Pass it as a prop or move it inside the component — the simplest approach is to move the `updateDisplay` mutation inside `PackageDashboard` since it already has `svc._id`.

**Step 4: Repeat for admin `Services.tsx`**

**Step 5: Commit**
```bash
git add apps/franchise/src/pages/Services/Services.tsx apps/admin/src/pages/Services/Services.tsx
git commit -m "feat(services): add inline isOnline toggle on service and package cards"
```

---

## Task 7: Book.tsx — filter by `isOnline` and add barber-first step order

**File:** `apps/booking/src/pages/Book/Book.tsx`

**Step 1: Change STEPS constant**

Find:
```ts
type Step = 'service' | 'barber' | 'datetime' | 'confirm';
const STEPS: Step[] = ['service', 'barber', 'datetime', 'confirm'];
const STEP_LABELS = ['Serviço', 'Barbeiro', 'Data & Hora', 'Confirmação'];
```
Replace with:
```ts
type Step = 'barber' | 'service' | 'datetime' | 'confirm';
const STEPS: Step[] = ['barber', 'service', 'datetime', 'confirm'];
const STEP_LABELS = ['Barbeiro', 'Serviço', 'Data & Hora', 'Confirmação'];
```

**Step 2: Update initial step state**

Find:
```ts
const [step, setStep] = useState<Step>('service');
```
Replace with:
```ts
const [step, setStep] = useState<Step>('barber');
```

**Step 3: Update Employee interface** to include `serviceIds`:
```ts
interface Employee { _id: string; name: string; avatar?: string; serviceIds?: string[]; daySchedules?: ...; workSchedule?: ...; }
```

**Step 4: Update services query** to filter online:
```ts
queryFn: async () => {
  const { data } = await unitApi.get(`/services?unitId=${unitId}&online=true`);
  return Array.isArray(data) ? data : data.services ?? [];
},
```

**Step 5: Add filtered services computed value** (after state declarations):
```ts
const visibleServices = selectedEmployee?.serviceIds?.length
  ? services.filter(s => selectedEmployee.serviceIds!.includes(s._id))
  : services;
```

**Step 6: Swap the step JSX blocks** — the current code renders `step === 'service'` and `step === 'barber'` sections. Change them:

- The section previously for `step === 'service'` (service list): change condition to `step === 'service'` but replace `services` with `visibleServices` in the map.
- The section previously for `step === 'barber'` (employee grid): change condition to `step === 'barber'`.
- Navigation: when employee is selected → go to `'service'`; when service is selected → go to `'datetime'`.

Find the employee card `onClick`:
```tsx
onClick={() => { setSelectedEmployee(emp); setStep(editId ? 'confirm' : 'service'); }}
```
(Previously it was `setStep('datetime')` — now barber leads to service.)

Find the service card `onClick`:
```tsx
onClick={() => { setSelectedService(svc); setStep(editId ? 'confirm' : 'datetime'); }}
```
(Previously it was `setStep('barber')` — now service leads to datetime.)

**Step 7: Update Summary component** — no change needed, it already uses `selectedService` and `selectedEmployee` by variable, not by step.

**Step 8: Update edit pre-fill** — when `editId` is present, pre-fill sets step to `targetStep || 'confirm'`. Ensure both service and employee are still found correctly (no change needed — logic is position-independent).

**Step 9: Verify TypeScript**
```bash
cd barber-system/apps/booking && npx tsc --noEmit
```

**Step 10: Commit**
```bash
git add apps/booking/src/pages/Book/Book.tsx
git commit -m "feat(booking): barber-first step order, filter services by isOnline + barber.serviceIds"
```

---

## Task 8: AppointmentForm.tsx — filter services by selected employee

**File:** `apps/franchise/src/components/AppointmentForm/AppointmentForm.tsx`

**Step 1: Update Employee interface** to include `serviceIds`:
```ts
interface Employee { _id: string; name: string; serviceIds?: string[]; }
```

**Step 2: Add filtered services computed value** (after `services` query, before `filteredClients`):
```ts
const selectedEmployee = employees.find(e => e._id === employeeId);
const visibleServices = selectedEmployee?.serviceIds?.length
  ? services.filter(s => selectedEmployee.serviceIds!.includes(s._id))
  : services;
```

**Step 3: Replace `services` with `visibleServices` in service select**

Find in JSX:
```tsx
{services.map(s => (
  <option key={s._id} value={s._id}>
```
Replace with:
```tsx
{visibleServices.map(s => (
  <option key={s._id} value={s._id}>
```

**Step 4: Reset serviceId when employee changes** — in the employee `onChange`:
```tsx
onChange={e => { setEmployeeId(e.target.value); setServiceId(''); }}
```

**Step 5: Verify TypeScript**
```bash
cd barber-system/apps/franchise && npx tsc --noEmit
```

**Step 6: Commit**
```bash
git add apps/franchise/src/components/AppointmentForm/AppointmentForm.tsx
git commit -m "feat(appointments): filter services by selected barber's serviceIds"
```

---

## Task 9: EmployeeForm — serviceIds checklist (franchise + admin)

Both `EmployeeForm.tsx` files.

**Step 1: Add Service interface** (top of file):
```ts
interface ServiceOption { _id: string; name: string; type?: string; }
```

**Step 2: Add serviceIds state** (after other useState calls):
```ts
const [serviceIds, setServiceIds] = useState<string[]>(
  (employee as any)?.serviceIds?.map((id: any) => typeof id === 'object' ? id._id : id) ?? []
);
```

**Step 3: Fetch services for the unit** (after other useQuery calls).

For **franchise** EmployeeForm:
```ts
const franchiseUnitId = getSelectedUnitId() || '69fa463aa078044937f70250';
const { data: availableServices = [] } = useQuery<ServiceOption[]>({
  queryKey: ['services-for-form', franchiseUnitId],
  queryFn: async () => {
    const { data } = await api.get(`/services?unitId=${franchiseUnitId}`);
    return (Array.isArray(data) ? data : data.services ?? []).filter((s: ServiceOption) => s.type !== 'package');
  },
});
```

For **admin** EmployeeForm (replace unitId source):
```ts
const adminUnitId = '69fa463aa078044937f7024e';
const { data: availableServices = [] } = useQuery<ServiceOption[]>({
  queryKey: ['services-for-form', adminUnitId],
  queryFn: async () => {
    const { data } = await api.get(`/services?unitId=${adminUnitId}`);
    return (Array.isArray(data) ? data : data.services ?? []).filter((s: ServiceOption) => s.type !== 'package');
  },
});
```

**Step 4: Add serviceIds to payload** in `handleSubmit` payload object:
```ts
serviceIds,
```

**Step 5: Add checklist JSX** — add a new section before the password field:
```tsx
{availableServices.length > 0 && (
  <div className={styles.field}>
    <label className={styles.label}>Serviços que realiza</label>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: '0.5rem' }}>
      Deixe em branco para habilitar todos os serviços.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {availableServices.map(svc => (
        <label key={svc._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={serviceIds.includes(svc._id)}
            onChange={e => {
              setServiceIds(prev =>
                e.target.checked ? [...prev, svc._id] : prev.filter(id => id !== svc._id)
              );
            }}
            style={{ width: 15, height: 15, accentColor: 'var(--gold)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{svc.name}</span>
        </label>
      ))}
    </div>
  </div>
)}
```

**Step 6: Ensure employee.service.ts persists serviceIds**

In `server/src/modules/employees/employee.service.ts`, `create` method already spreads `data` into `UserModel.create`, so `serviceIds` will be included if sent. The `update` method uses `$set: updateData` — also fine.

No server change needed.

**Step 7: Repeat for admin EmployeeForm.tsx** (same JSX, different unitId source).

**Step 8: Verify TypeScript for both apps**
```bash
cd barber-system/apps/franchise && npx tsc --noEmit
cd barber-system/apps/admin && npx tsc --noEmit
```

**Step 9: Commit**
```bash
git add apps/franchise/src/pages/Employees/EmployeeForm.tsx apps/admin/src/pages/Employees/EmployeeForm.tsx
git commit -m "feat(employees): add serviceIds checklist to EmployeeForm"
```

---

## Task 10: Final check — Book.tsx employee public endpoint includes serviceIds

The booking app calls `GET /employees/public?unitId=...` which maps to `listPublicEmployees` in the employee controller. This calls `service.findByUnit(unitId)` which runs `.select('-passwordHash -passwordPlain')`. Since `serviceIds` is not in the excluded list, it will be returned automatically.

**Step 1: Verify by grep**
```bash
grep -n "select\|serviceIds" server/src/modules/employees/employee.service.ts
```
Confirm `serviceIds` is not excluded.

**Step 2: No change needed** if the field is not excluded. The field returns as an array of ObjectId strings — Book.tsx compares them against `s._id` (also strings), so `.includes()` works correctly.

**Step 3: Final TypeScript check across all apps**
```bash
cd barber-system/server && npx tsc --noEmit
cd barber-system/apps/franchise && npx tsc --noEmit
cd barber-system/apps/admin && npx tsc --noEmit
cd barber-system/apps/booking && npx tsc --noEmit
```

**Step 4: Final commit if any cleanup needed**
```bash
git commit -m "chore: final type-check pass for services redesign"
```
