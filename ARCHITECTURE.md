# ALiSiO PMS — Architecture

## Overview

ALiSiO PMS is a **modular monolith** built on Next.js 16 App Router + React 19 + TypeScript with SQLite (better-sqlite3).

Each business domain is a self-contained module in `src/modules/`. Modules communicate only through their public API (`api/index.ts`) or via the event bus (`src/core/event-bus/`).

---

## Module Map

```
src/
  modules/
    bookings/     — reservations, group bookings, availability, check-in/out
    guests/       — guest profiles + guest portal (/guest/[token])
    properties/   — properties, units, unit-types, buildings, categories
    pricing/      — rate plans, price calendar, promotions, restrictions
    finance/      — P&L, cashflow, expenses, accruals, capex, bank, payments
    crm/          — leads, conversations, inbox, pipeline, AI knowledge
    channels/     — Booking.com, Hostex, iCal, email, Telegram integrations
    reports/      — city tax, analytics

  core/
    db/           — SQLite connection (better-sqlite3), migrations
    auth/         — session management, RBAC (7 roles)
    event-bus/    — typed in-memory event emitter + event registry

  shared/
    ui/           — layout components, design system (Header, Sidebar, mobile)
    utils/        — rate-limit, translate, useCurrentUser, useDevice
    types/        — shared base types (DateRange, Money, Pagination, etc.)
```

---

## Module Dependencies

```
bookings ──depends on──► guests (via @guests)
bookings ──depends on──► pricing (via @pricing)
bookings ──depends on──► properties (via @properties)
finance  ──depends on──► bookings (via @bookings)
channels ──depends on──► bookings (via @bookings)
channels ──depends on──► properties (via @properties)
crm      ──depends on──► guests (via @guests)
reports  ──depends on──► bookings (via @bookings)
reports  ──depends on──► finance (via @finance)

all modules ──depend on──► @core/db, @core/auth, @core/event-bus
all modules ──depend on──► @shared/types, @shared/utils
```

---

## Events

Key events flowing through the system:

| Event | Emitted by | Consumed by |
|---|---|---|
| `booking.created` | bookings | finance, crm, channels |
| `booking.cancelled` | bookings | finance, channels |
| `booking.checked_in` | bookings | guests |
| `payment.received` | finance | bookings |
| `channel.reservation_synced` | channels | bookings |
| `crm.message_received` | crm | — |
| `guest.created` | guests | crm |

Full event type definitions: [`src/core/event-bus/registry.ts`](src/core/event-bus/registry.ts)

---

## Import Rules (enforced by ESLint + TypeScript)

```
✅ ALLOWED
  import { createBooking } from '@bookings'         // module public API
  import { getDb } from '@core/db'                  // core infrastructure
  import { DateRange } from '@shared/types'          // shared types
  import { eventBus } from '@core/event-bus'        // event bus

❌ FORBIDDEN
  import { BookingRepo } from '@/modules/bookings/data/booking.repo'  // internal
  import { Booking } from '@/modules/bookings/domain/booking'          // internal
  import anything from '@/modules/bookings/events/published'           // internal
```

ESLint rule: `no-restricted-imports` (currently `warn`, will become `error` after full migration)

TypeScript paths: only `@bookings` → `src/modules/bookings/api` is registered in `tsconfig.json`.

---

## Directory Structure Convention

Every module follows this structure:

```
modules/<name>/
  api/
    index.ts        ← ONLY public exports (functions + types)
    handlers.ts     ← Next.js route handler wrappers
  domain/
    types.ts        ← TypeScript interfaces & domain types
    [entity].ts     ← business logic, validations
  data/
    [entity].repo.ts ← SQL queries (synchronous better-sqlite3)
  events/
    published.ts    ← event types this module emits
    subscribed.ts   ← subscriptions to other modules' events
  ui/
    [Page].tsx      ← React components for this module
    [Form].tsx
  __tests__/
  README.md         ← module documentation (required)
```

---

## app/ Layer (Next.js routing)

`app/` contains only routing — no business logic:

```ts
// app/bookings/page.tsx — CORRECT
import { BookingsPage } from '@bookings'
export default BookingsPage

// app/api/bookings/route.ts — CORRECT  
import { bookingsHandlers } from '@bookings'
export const GET = bookingsHandlers.list
export const POST = bookingsHandlers.create
```

---

## Migration Status

> Last updated: 2026-04-21

| Module | Status | Notes |
|---|---|---|
| `core/db` | 🟡 Shim | Re-exports from `src/lib/db.ts` |
| `core/auth` | 🟡 Shim | Re-exports from `src/lib/auth.ts` + `src/lib/permissions.ts` |
| `core/event-bus` | ✅ Done | New infrastructure |
| `properties` | ⬜ Pending | Next to migrate |
| `pricing` | ⬜ Pending | |
| `guests` | ⬜ Pending | |
| `channels` | ⬜ Pending | |
| `finance` | ⬜ Pending | |
| `bookings` | ⬜ Pending | Most complex, migrate last |
| `crm` | ⬜ Pending | |
| `reports` | ⬜ Pending | |

Legend: ✅ Fully migrated · 🟡 Shim (re-export) · ⬜ Pending

---

## How to Add a New Module

1. Copy `docs/_templates/MODULE_README.md` → `src/modules/<name>/README.md`
2. Create directory structure: `api/`, `domain/`, `data/`, `events/`, `ui/`, `__tests__/`
3. Add TypeScript path in `tsconfig.json`: `"@name": ["./src/modules/name/api"]`
4. Add new events to `src/core/event-bus/registry.ts`
5. Export public API from `api/index.ts`
6. Fill in `README.md`
