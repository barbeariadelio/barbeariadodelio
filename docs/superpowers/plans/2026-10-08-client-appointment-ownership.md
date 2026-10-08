# Correção de vínculo entre clientes e agendamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a resolução de posse de clientes e agendamentos sem migração automática de dados existentes.

**Architecture:** Centralizar normalização e resolução segura em serviços pequenos do módulo de clientes. Reutilizar essa resolução no login público, leitura/autorização de agendamentos e fluxos de criação; manter o vínculo persistente limitado a correções seguras durante operações explícitas do usuário.

**Tech Stack:** TypeScript strict, Express, Mongoose 8, Vitest, npm workspaces, Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-08-client-appointment-ownership-design.md`

## Global Constraints

- Não executar migração, reparo global ou alteração manual do banco nesta entrega.
- Telefones devem ser comparados somente por dígitos e equivalência nacional/prefixo `55`.
- Somente usuários ativos com papel `client` podem ser destino de auto-vínculo.
- A autorização de funcionário, caixa e dono continua limitada por papel/unidade e não usa telefone como autoridade.
- Cada tarefa deve terminar com seu teste direcionado passando.

---

### Task 1: Normalização de telefone e resolução de posse

**Files:**
- Create: `server/src/shared/utils/phone.ts`
- Create: `server/src/modules/clients/client-ownership.service.ts`
- Test: `server/src/shared/utils/phone.spec.ts`
- Test: `server/src/modules/clients/__tests__/client-ownership.service.spec.ts`

**Interfaces:**
- `normalizePhone(value: string | undefined | null): string`
- `getPhoneVariants(value: string | undefined | null): string[]`
- `ClientOwnershipService.findClientIdsForUser(userId: string): Promise<mongoose.Types.ObjectId[]>`
- `ClientOwnershipService.canUserAccessClient(userId: string, clientId: string): Promise<boolean>`
- `ClientOwnershipService.findActiveClientUserByPhone(phone: string): Promise<IUser | null>`

- [ ] **Step 1: Write failing normalization tests**

```ts
it('treats national and country-code forms as the same phone', () => {
  expect(normalizePhone('(19) 98335-0939')).toBe('19983350939');
  expect(normalizePhone('5519983350939')).toBe('19983350939');
  expect(getPhoneVariants('5519983350939')).toEqual(['19983350939', '5519983350939']);
});
```

- [ ] **Step 2: Run `npm --workspace @barber/server exec vitest run src/shared/utils/phone.spec.ts` and verify the import/function failure**
- [ ] **Step 3: Implement `normalizePhone` and `getPhoneVariants`**

Use digits-only output. If the result starts with `55` and the remainder has 10 or 11 digits, use the remainder as canonical and include both forms in the query variants. Keep non-Brazilian/invalid lengths as digits-only instead of guessing.

- [ ] **Step 4: Write failing ownership tests**

Cover: direct `userId`; missing `userId` with equivalent phone; stale link to an inactive/non-client account; stale link to another active client with incompatible phone; and rejection of an active client with the same canonical phone when the record is ambiguous.

- [ ] **Step 5: Run the ownership test and verify the expected failure**
- [ ] **Step 6: Implement `ClientOwnershipService`**

Use `ClientModel.find` and `UserModel.find` with `$in` phone variants. Build the candidate set from direct links and phone-equivalent records. For phone fallback, inspect the linked user and include only records with no usable active client owner or an owner whose canonical phone differs. Return unique client IDs. `findActiveClientUserByPhone` must query `{ phone: { $in: variants }, role: 'client', isActive: true }`.

- [ ] **Step 7: Run both focused suites and verify they pass**
- [ ] **Step 8: Commit the utility and ownership service**

```powershell
git add server/src/shared/utils/phone.ts server/src/shared/utils/phone.spec.ts server/src/modules/clients/client-ownership.service.ts server/src/modules/clients/__tests__/client-ownership.service.spec.ts
git commit -m "feat: centralizar posse de registros de cliente"
```

### Task 2: Usar a posse centralizada nos agendamentos

**Files:**
- Modify: `server/src/modules/appointments/appointment.service.ts:227-247`
- Modify: `server/src/modules/appointments/appointment.controller.ts:39-48,220-228,290-305,318-324`
- Test: `server/src/modules/appointments/__tests__/appointment.service.spec.ts`
- Test: `server/src/modules/appointments/__tests__/appointment.controller.spec.ts`

**Interfaces:**
- Consumes `ClientOwnershipService.findClientIdsForUser` and `canUserAccessClient` from Task 1.
- Produces consistent ownership behavior for `findByUserId`, `getAppointment`, `updateAppointmentStatus`, `getClientAppointments`, and `updateAppointment`.

- [ ] **Step 1: Add failing service test for a stale linked Client**

Assert that `findByUserId` includes appointments for a client whose phone matches the account but whose old `userId` points to an active client account with a different phone.

- [ ] **Step 2: Run the focused service test and verify it fails with the old query behavior**
- [ ] **Step 3: Replace the local phone fallback in `findByUserId` with `findClientIdsForUser`**

Keep the existing appointment populates and sort unchanged. Pass the resolved client IDs to the appointment query.

- [ ] **Step 4: Add failing controller authorization tests**

Assert that a client can read, cancel, and edit an appointment owned by an eligible stale record, while an unrelated client receives 403.

- [ ] **Step 5: Run the focused controller tests and verify the expected failures**
- [ ] **Step 6: Replace each direct `ClientModel.find({ userId: ... })` authorization check with `canUserAccessClient`**

Do not change owner/employee/cashier unit checks or client-allowed fields.

- [ ] **Step 7: Run appointment service/controller suites and then all server tests**
- [ ] **Step 8: Commit the appointment ownership integration**

```powershell
git add server/src/modules/appointments/appointment.service.ts server/src/modules/appointments/appointment.controller.ts server/src/modules/appointments/__tests__
git commit -m "fix: aplicar posse segura aos agendamentos"
```

### Task 3: Prevent new duplicate client records

**Files:**
- Modify: `server/src/modules/clients/client.service.ts:48-84,86-98`
- Modify: `server/src/modules/appointments/appointment.controller.ts:132-155`
- Modify: `server/src/modules/appointments/appointment.service.ts:538-625`
- Test: `server/src/modules/clients/__tests__/client.service.spec.ts`
- Test: `server/src/modules/appointments/__tests__/appointment.guest-book.spec.ts`
- Test: `server/src/modules/appointments/__tests__/appointment.controller.spec.ts`

**Interfaces:**
- `ClientService.create` and `update` consume `normalizePhone`, `getPhoneVariants`, and `findActiveClientUserByPhone`.
- Add `ClientService.findOrCreateForUserAndUnit(userId: string, unitId: string): Promise<IClient>` for authenticated self-booking.

- [ ] **Step 1: Write failing tests for formatted/prefixed duplicate phones**

Cover staff create, client update, authenticated self-booking in a second unit, and guest booking. Assert existing records are reused and an internal employee account is never assigned as `Client.userId`.

- [ ] **Step 2: Run the focused suites and verify they fail against exact-phone queries/direct create**
- [ ] **Step 3: Update `ClientService.create`**

Normalize input before duplicate lookup; query the unit with phone variants; if reusing an existing record, preserve its history and only fill a missing `userId` with an active client account from `findActiveClientUserByPhone`. Never replace an existing active owner silently.

- [ ] **Step 4: Update `ClientService.update`**

Normalize a changed phone before `findByIdAndUpdate`. If the update changes phone, keep an existing explicit user link only when its canonical phone remains compatible; otherwise clear the stale link so the ownership resolver can handle the record safely. Return the updated record.

- [ ] **Step 5: Add `findOrCreateForUserAndUnit` and use it in `createAppointment`**

Load the authenticated user, require the account to exist, find by `{ userId, unitId }`, then find by phone variants within the target unit, then create with the normalized phone and user ID. This preserves cross-unit records without bypassing duplicate protection.

- [ ] **Step 6: Protect guest booking with canonical phone lookup**

Keep the existing guest lock, but construct its key with `normalizePhone` and query `ClientModel.findOne({ unitId, phone: { $in: variants } })`. Store newly created phones canonically; do not change historical values in unrelated records.

- [ ] **Step 7: Run focused tests and all server tests**
- [ ] **Step 8: Commit duplicate-prevention changes**

```powershell
git add server/src/modules/clients/client.service.ts server/src/modules/clients/__tests__ server/src/modules/appointments/appointment.controller.ts server/src/modules/appointments/appointment.service.ts server/src/modules/appointments/__tests__
git commit -m "fix: evitar duplicidade de clientes por telefone"
```

### Task 4: Protect client merges and login relinking

**Files:**
- Modify: `server/src/modules/clients/client.service.ts:122-166`
- Modify: `server/src/modules/auth/auth.service.ts:47-77,75-126`
- Test: `server/src/modules/clients/__tests__/client.service.spec.ts`
- Test: `server/src/modules/auth/__tests__/auth.service.spec.ts`

**Interfaces:**
- `ClientService.mergeClients` consumes ownership/account state from `ClientOwnershipService`.
- `AuthService.bookingLogin` consumes canonical phone variants and only relinks eligible records.

- [ ] **Step 1: Write failing merge tests**

Assert that two records linked to different active client accounts cause a 409 before `AppointmentModel.updateMany` or deletion. Assert that a source linked to an inactive account can still merge into an unlinked target according to the existing workflow.

- [ ] **Step 2: Run the focused merge tests and verify they fail**
- [ ] **Step 3: Add the conflict guard before moving appointments**

Load both linked users, identify active client accounts, and throw `AppError(..., 409)` when both are distinct active client owners. Preserve the existing field/package merge for non-conflicting cases.

- [ ] **Step 4: Add a failing login test for `55`-prefixed legacy records**
- [ ] **Step 5: Update `bookingLogin` and `linkClientRecordsByPhone`**

Use canonical variants for matching. The relink update must be scoped to phone-equivalent records and must exclude records currently owned by an active client whose canonical phone matches that record. It must not link internal accounts or create a `Client` without a unit.

- [ ] **Step 6: Run auth and client focused suites, then all server tests**
- [ ] **Step 7: Commit login/merge safeguards**

```powershell
git add server/src/modules/auth/auth.service.ts server/src/modules/auth/__tests__/auth.service.spec.ts server/src/modules/clients/client.service.ts server/src/modules/clients/__tests__
git commit -m "fix: proteger merge e relink de contas clientes"
```

### Task 5: Final verification and handoff

**Files:**
- Verify: all modified files and both documents.

- [ ] **Step 1: Run `git diff --check` and `npx eslint` on all changed TypeScript files**
- [ ] **Step 2: Run `npm --workspace @barber/server run build`**
- [ ] **Step 3: Run `npm --workspace @barber/server test` and confirm all suites pass**
- [ ] **Step 4: Run `npm run build` and record any pre-existing bundle warnings without treating them as failures**
- [ ] **Step 5: Run the read-only audit query only if requested separately; do not execute updates**
- [ ] **Step 6: Review `git status`, summarize changed behavior and deployment risk, and wait for explicit deployment instruction**