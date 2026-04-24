# PR #8 — Регулярні операції + Календар платежів (Finmap migration)

Один PR, дві пов'язані фічі. Без регулярок календар порожній, без календаря регулярки невидимі.

## 1. Скоуп

### In scope
- Таблиця `fin_recurring_templates` — шаблони повторюваних операцій
- Движок `recurring-engine.ts`: schedule advancement, materialize operations, runNow
- Cron-тік: раз на добу генерує заплановані операції з шаблонів (status='pending')
- Нова сторінка `/finance/calendar` — місячна сітка з операціями + прогноз залишку
- Нова вкладка «Регулярки» у `/finance/settings`
- Навігація: кнопка «Календар» у /finance/operations header
- Операції з `is_planned=1` показуються у календарі окремо

### Out of scope
- Drag-to-reschedule у календарі (наступний PR, коли буде DnD lib)
- Сповіщення про cash-gap email/Telegram (відкладено)
- Нескінченні повторення без end_at (обмежуємось 5-річним горизонтом)

## 2. Схема

```sql
CREATE TABLE IF NOT EXISTS fin_recurring_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('income','expense','transfer')),

  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CZK',
  account_from_id TEXT REFERENCES finance_accounts(id),
  account_to_id TEXT REFERENCES finance_accounts(id),
  category_id TEXT REFERENCES expense_categories(id),
  project_id TEXT REFERENCES business_units(id),
  counterparty_id TEXT REFERENCES finance_counterparties(id),
  comment TEXT,

  schedule TEXT NOT NULL,                  -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  schedule_day INTEGER,                    -- day of month (1-31) for monthly; day of week (0-6) for weekly
  next_run_at TEXT NOT NULL,               -- ISO date
  end_at TEXT,                             -- optional end date
  last_run_at TEXT,
  runs_created INTEGER NOT NULL DEFAULT 0,

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rt_org ON fin_recurring_templates(organization_id);
CREATE INDEX idx_rt_next_run ON fin_recurring_templates(next_run_at, is_active);
```

**Важливо:** `recurring_template_id` у `fin_operations` **не додаємо**. Використовуємо `source='recurring'` + `source_ref=<template_id>` (цей pattern вже є з PR #6).

## 3. Движок — `src/modules/finance/data/recurring-engine.ts`

```ts
export function advanceSchedule(current: string, schedule: string, day?: number): string
// current ISO date, schedule='daily'|'weekly'|'monthly'|'yearly'
// returns next ISO date

export function materializeTemplate(db, template, asOfDate: string): string | null
// creates fin_operation with is_planned=1 if next_run_at > today
//   or is_planned=0, status='completed' if next_run_at <= today
// returns operation_id, advances template.next_run_at

export function runRecurringTick(db): { created: number; errors: string[] }
// processes all active templates with next_run_at <= today + 30 days
// (lookahead 30 days so calendar shows upcoming)

export function forecastUpcoming(db, orgId, fromDate, toDate): ForecastOp[]
// returns list of synthetic operations that WOULD be materialized in date range
// (without actually writing to DB — used by calendar view)
```

### Schedule advancement

- `daily` → add 1 day
- `weekly` → add 7 days (schedule_day ignored; always same weekday as original)
- `monthly` → next month, same day; if day > last day of month, use last day
- `yearly` → next year, same date; Feb 29 → Feb 28 у non-leap years

## 4. Handlers — `src/modules/finance/api/recurring.handlers.ts`

```ts
listRecurringTemplates()
createRecurringTemplate()
updateRecurringTemplate()
deleteRecurringTemplate()
toggleRecurringTemplate()
runRecurringNow(templateId)      // manual trigger — materialize next occurrence immediately
runAllDue()                       // Used by cron tick; can also be hit via POST /run
```

## 5. API routes

```
src/app/api/finance/recurring/route.ts              -- GET list, POST create
src/app/api/finance/recurring/[id]/route.ts         -- PATCH, DELETE
src/app/api/finance/recurring/[id]/toggle/route.ts  -- PATCH
src/app/api/finance/recurring/[id]/run-now/route.ts -- POST (manual fire)
src/app/api/finance/recurring/run/route.ts          -- POST (process all due)
src/app/api/finance/calendar/route.ts               -- GET month data
```

## 6. Cron integration

Підключаю до існуючого Hostex cron (раз на добу): додаю виклик `runRecurringTick(db)` у існуючий daemon. Альтернатива — окремий cron, але для single-tenant SQLite один cron достатній.

Або більш чистий варіант: додаю до `runMigrations` перевірку "остання дата запуску recurring у `fin_settings` table", і при кожному getDb() перевіряю чи пройшов день. Мінімально інтрузивно.

**Рішення:** додаю простий механізм — при кожному старті dev/prod `getDb()` викликає `runRecurringTickIfDue(db)` який перевіряє чи пройшло ≥23 години з останнього запуску (зберігається в `fin_system_state` key-value table).

Новий `fin_system_state` (key-value):
```sql
CREATE TABLE IF NOT EXISTS fin_system_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Ключ `last_recurring_tick` — ISO timestamp. Функція повертає раніше 24h = skip.

## 7. Календар — `/finance/calendar/page.tsx`

### Layout
- Header: navigation [←] Місяць Рік [→], кнопка «До операцій», selector рахунку
- Month grid 7×5-6, кожна клітинка:
  - Дата
  - Суми 🟢 +X (income completed)
  - Суми 🔴 −Y (expenses completed)
  - 🔵 planned (pending/is_planned)
  - ⚠️ якщо predicted balance < 0
- Клік на день → модалка `DayOperationsModal` зі списком операцій + кнопка «+ Запланувати»
- Right sidebar: line chart «Прогноз залишку» за днями місяця (чи не йде на мінус)

### Daily data fetch
GET `/api/finance/calendar?month=2026-05&account_id=...` returns:
```json
{
  "days": [
    { "date": "2026-05-01", "operations": [...], "forecast_balance": 12345.0, "cash_gap": false },
    ...
  ],
  "total_income": 45000,
  "total_expense": 32000,
  "starting_balance": 50000,
  "ending_balance": 63000,
  "recurring_previews": [...]
}
```

### Components
- `CalendarPage` (main)
- `CalendarMonthGrid` (7×6 grid)
- `CalendarDayCell` (single day)
- `DayOperationsModal`
- `BalanceForecastChart` (simple SVG)

## 8. Regular templates UI — вкладка «Регулярки» у Settings

Активую новий tab. Компоненти:
- `RecurringTemplatesTab` — список шаблонів з last_run, next_run, runs_created
- `RecurringTemplateModal` — form з усіма полями + schedule selector

Додаю в TABS list у settings/page.tsx.

## 9. Файли

### Створюються
- `src/modules/finance/data/recurring-engine.ts` (~250 LoC)
- `src/modules/finance/api/recurring.handlers.ts` (~250 LoC)
- `src/modules/finance/api/calendar.handlers.ts` (~150 LoC)
- 6 API routes (~25 LoC)
- `src/app/(dashboard)/finance/calendar/page.tsx` (~300 LoC)
- `src/app/(dashboard)/finance/calendar/_components/CalendarMonthGrid.tsx` (~150 LoC)
- `src/app/(dashboard)/finance/calendar/_components/CalendarDayCell.tsx` (~100 LoC)
- `src/app/(dashboard)/finance/calendar/_components/DayOperationsModal.tsx` (~150 LoC)
- `src/app/(dashboard)/finance/calendar/_components/BalanceForecastChart.tsx` (~100 LoC)
- `src/app/(dashboard)/finance/settings/_components/RecurringTemplatesTab.tsx` (~200 LoC)
- `src/app/(dashboard)/finance/settings/_components/RecurringTemplateModal.tsx` (~250 LoC)

### Змінюються
- `src/lib/db.ts` — 2 CREATE TABLE (templates + system_state) + 3 indexes (~25 LoC)
- `src/core/db/index.ts` — виклик `runRecurringTickIfDue()` у getDb (~15 LoC)
- `src/modules/finance/api/index.ts` — експорти (~6 рядків)
- `src/app/(dashboard)/finance/settings/page.tsx` — новий tab "Регулярки" + додати в TABS list
- `src/app/(dashboard)/finance/operations/page.tsx` — кнопка «Календар» в header
- `src/modules/finance/README.md`

**Разом:** ~1700 LoC. L/XL-розмір.

## 10. Тест-план

1. **Create template**: оренда 25000 CZK monthly day=15, next_run_at=2026-05-15
2. GET templates → 1 запис
3. **runNow** → створюється fin_operation з is_planned=1 (якщо дата в майбутньому) + next_run_at → 2026-06-15
4. Toggle off → не виконується
5. GET /api/finance/calendar?month=2026-05 → у 15-му дні бачимо operation
6. Balance forecast: якщо баланс у якийсь день < 0 → cash_gap: true
7. Click day → модалка показує список
8. UI: /finance/calendar HTTP 200, всі інші сторінки OK
9. TS check
10. Delete template → pending operations залишаються (не cascade)

## 11. Питання

1. **`recurring_template_id` FK** у fin_operations — НЕ додаємо. Використовуємо `source='recurring'` + `source_ref=<template_id>`. Ок?
2. **Cron via getDb** (check once per day at each startup) — прийнятно для MVP? Альтернатива — окремий daemon, але для single-tenant це overkill.
3. **Cash-gap threshold** — попереджаємо якщо predicted balance < 0, чи треба user-configurable threshold? MVP: просто <0.
4. **Starting balance у forecast** — беремо поточний computed balance на початок місяця чи на сьогодні? **Рішення:** на сьогоднішній день (current balance), потім рухаємось вперед планованими операціями.

## 12. Коміт-повідомлення

```
feat(finance): recurring templates + payment calendar (PR #8)

- New tables: fin_recurring_templates + fin_system_state
- Recurring engine: schedule advancement (daily/weekly/monthly/yearly),
  materialize operations, forecast upcoming
- Daily tick: runRecurringTickIfDue() runs once per 24h at getDb()
- Calendar page /finance/calendar with month grid, day detail modal,
  balance forecast chart, cash-gap warnings
- Settings tab "Регулярки" with CRUD + run-now button
- recurring operations use source='recurring' + source_ref=<template_id>
  (no new FK in fin_operations)
```
