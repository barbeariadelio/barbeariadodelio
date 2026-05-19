# Services Redesign — Design Document
**Date:** 2026-05-19

## Overview

Four improvements to the Services area of the barber system, affecting the service model, service forms (admin + franchise), the employee form, and the client booking flow.

---

## 1. Duration Field — Dropdown with Fixed Options

**Change:** Replace the free-text minutes input in `ServiceForm.tsx` (admin and franchise) with a dropdown of fixed options.

**Options:**
`15min, 30min, 45min, 1h, 1h15, 1h30, 1h45, 2h, 2h30, 3h`

Displayed as human-readable labels (e.g., "1h30") but mapped to integer `durationMinutes` values (e.g., 90).

**Model impact:** None — `durationMinutes: Number` remains unchanged.

---

## 2. Active vs Online — Two Separate Fields

**New field on service model:** `isOnline: Boolean` — default `false`.

| Field | Meaning | Default |
|---|---|---|
| `isActive` | Service exists in the system | `true` |
| `isOnline` | Service is visible to clients for booking | `false` |

**ServiceForm** (admin + franchise): new "Disponibilidade" section with two independent toggles — "Ativo" and "Online". New services start with Online = off.

**Services list page** (admin + franchise): each service/package card shows both toggles, switchable inline.

**Client booking app** (Book.tsx): filters services by `isOnline: true`. Services with `isOnline: false` never appear to clients.

**Internal scheduling** (franchise/admin AppointmentForm): shows all `isActive` services regardless of `isOnline`.

Applies equally to `type: 'single'` and `type: 'package'`.

---

## 3. Services Linked to Barbers

### Data model

Add `serviceIds: [ObjectId]` to the `User` schema (employees only). Empty array = performs all services (backward compatible).

### EmployeeForm (admin + franchise)

New section: **"Serviços que realiza"** — checklist of all active services for the unit. Selecting none means the employee performs all services.

### Booking flow — new step order

**Before:** service → barber → datetime → confirm  
**After:** barber → service → datetime → confirm

**Client booking (Book.tsx):**
- Step 1: Select barber
- Step 2: Select service (filtered by `barber.serviceIds`; if empty, show all `isOnline: true` services)
- Step 3: Date/time
- Step 4: Confirm

**Internal scheduling (franchise/admin AppointmentForm):**
- When a barber is selected, the service dropdown filters to `barber.serviceIds`
- If no services are linked, show all active services
- Does NOT filter by `isOnline` (internal can schedule any active service)

---

## Files to Change

| File | Change |
|---|---|
| `server/src/modules/services/service.model.ts` | Add `isOnline: Boolean, default: false` |
| `server/src/modules/employees/auth.model.ts` | Add `serviceIds: [ObjectId]` to User schema |
| `apps/franchise/src/pages/Services/ServiceForm.tsx` | Duration dropdown + isOnline toggle |
| `apps/admin/src/pages/Services/ServiceForm.tsx` | Duration dropdown + isOnline toggle |
| `apps/franchise/src/pages/Services/Services.tsx` | Inline Ativo/Online toggles on cards |
| `apps/admin/src/pages/Services/Services.tsx` | Inline Ativo/Online toggles on cards |
| `apps/franchise/src/pages/Employees/EmployeeForm.tsx` | serviceIds checklist section |
| `apps/admin/src/pages/Employees/EmployeeForm.tsx` | serviceIds checklist section |
| `apps/booking/src/pages/Book/Book.tsx` | Step reorder + filter by barber serviceIds + isOnline |
| `apps/franchise/src/components/AppointmentForm/AppointmentForm.tsx` | Filter services by selected barber |
| `server/src/modules/services/service.routes.ts` | Expose `isOnline` in query/response |
| `server/src/modules/employees/employee.service.ts` | Persist `serviceIds` on create/update |
