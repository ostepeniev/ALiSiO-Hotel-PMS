# PR #6 — Уніфікована `fin_operations` (Finmap migration, Hard Option C)

**Найбільший PR у ланцюжку.** Один комміт, hard migrate. Після цього PR:
- `payments`, `expenses`, `income`, `transfers` → **зникають**
- `fin_operations` — single source of truth
- `/finance/operations` — новий головний екран у стилі Finmap
- Усі бронювання, Teya, Hostex, guest-portal, reports читають/пишуть у новій таблиці

## 1. Скоуп і ризики

**Що робимо одним коммітом:**
1. Нові таблиці `fin_operations` + `fin_operation_tags`
2. Міграційний скрипт у `runMigrations()` — ідемпотентний, копіює старі дані → нову таблицю
3. Перейменування FK у `bank_transactions`: `matched_expense_id` + `matched_payment_id` → `matched_operation_id`
4. `capex_items.fin_operation_id`, `accruals.fin_operation_id`, `invoices.fin_operation_id` — нові nullable FK (поки не використовуються у PR #6, заготовка для майбутнього)
5. Переписуємо 8 finance handlers: `payments`, `expenses`, `expense`, `income`, `transfers`, `bank`, `reports`, `log`, `accounts`
6. Переписуємо 4 зовнішні callers: `hostex-sync.ts`, `webhook-teya.handlers.ts`, `widget-payment-return.handlers.ts`, `cleanup-ical.handlers.ts`
7. Переписуємо 3 зовнішніх читачів: `guest-portal.repo.ts`, `reports.handlers.ts` (модуль `@reports`)
8. Нова сторінка `/finance/operations` — список з фільтрами + модалки «Новий дохід / Витрата / Переказ» у стилі Finmap
9. Оновлюємо legacy-сторінки: `/finance`, `/finance/expenses`, `/finance/log` — читають з `fin_operations`
10. **DROP** старих таблиць після верифікації

**Що НЕ робимо у PR #6:**
- Автоправила (auto-rules) — PR #7
- Календар платежів — PR #8
- Cashflow / P&L матриця-дрілл-даун — PR #9-10 (існуючі звіти продовжують працювати мінімально)
- Регулярні операції — PR #11
- Імпорт банк-виписки (переробка) — PR #12

## 2. Schema — `fin_operations`

```sql
CREATE TABLE fin_operations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  op_type TEXT NOT NULL CHECK (op_type IN ('income', 'expense', 'transfer')),

  -- Accounts
  account_from_id TEXT REFERENCES finance_accounts(id),   -- expense/transfer джерело
  account_to_id   TEXT REFERENCES finance_accounts(id),   -- income/transfer призначення

  -- Amounts (multi-currency)
  amount         REAL NOT NULL,              -- у валюті account (для income → account_to, для expense/transfer → account_from)
  currency       TEXT NOT NULL DEFAULT 'CZK',
  amount_to      REAL,                       -- для крос-валютного transfer: сума у валюті account_to
  currency_to    TEXT,
  fx_rate        REAL,
  amount_company REAL NOT NULL,              -- у CZK, для агрегатів

  -- Dates
  paid_at      TEXT NOT NULL,                -- дата руху грошей
  accrued_at   TEXT NOT NULL,                -- дата нарахування (=paid_at якщо не інакше)
  period_from  TEXT,
  period_to    TEXT,

  -- Classification
  category_id     TEXT REFERENCES expense_categories(id),  -- NULL для transfer
  project_id      TEXT REFERENCES business_units(id),
  counterparty_id TEXT REFERENCES finance_counterparties(id),

  -- Payment-specific (для op_type='income' з source='booking'/'teia'/'hostex')
  reservation_id TEXT REFERENCES reservations(id) ON DELETE CASCADE,
  status         TEXT DEFAULT 'completed',   -- 'completed' | 'pending' | 'failed' | 'refunded'
  method         TEXT,                       -- 'cash' | 'card' | 'online' | 'bank_transfer' | 'booking_platform'
  payment_subtype TEXT,                      -- 'deposit' | 'full' | 'service' | 'refund' | NULL

  -- Meta
  comment     TEXT,
  is_planned  INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'booking_widget' | 'teia' | 'hostex' | 'bank_import' | 'recurring'
  source_ref  TEXT,                            -- external ID (session_id, hostex reservation_code, etc.)

  created_by TEXT REFERENCES app_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fop_org ON fin_operations(organization_id);
CREATE INDEX idx_fop_type ON fin_operations(op_type);
CREATE INDEX idx_fop_paid ON fin_operations(paid_at);
CREATE INDEX idx_fop_accrued ON fin_operations(accrued_at);
CREATE INDEX idx_fop_acct_from ON fin_operations(account_from_id);
CREATE INDEX idx_fop_acct_to ON fin_operations(account_to_id);
CREATE INDEX idx_fop_reservation ON fin_operations(reservation_id);
CREATE INDEX idx_fop_status ON fin_operations(status);
CREATE INDEX idx_fop_source_ref ON fin_operations(source, source_ref);
CREATE INDEX idx_fop_category ON fin_operations(category_id);
CREATE INDEX idx_fop_project ON fin_operations(project_id);
CREATE INDEX idx_fop_counterparty ON fin_operations(counterparty_id);

CREATE TABLE fin_operation_tags (
  operation_id TEXT NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES finance_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (operation_id, tag_id)
);
CREATE INDEX idx_fot_tag ON fin_operation_tags(tag_id);
```

### Ключові рішення у схемі

1. **Refund — не окремий op_type.** `payment_type='refund'` → `op_type='expense'` (гроші йдуть з нашого рахунку назад до клієнта). Це стандартний Finmap-підхід і простіше для агрегатів.
2. **Status для всіх операцій, не тільки payments.** Для expenses/income/transfers дефолт `'completed'`. `'pending'` для теїа-webhook до підтвердження.
3. **`payment_subtype`** зберігаємо окрема колонка (не плутати з `op_type`) — потрібно для звітів «скільки за service vs за booking».
4. **`reservation_id`** як окрема FK — не через `source_ref` — щоб guest-portal SQL `WHERE reservation_id = ?` працював без змін у шаблоні.
5. **`id` TEXT** (не INTEGER) — щоб зберегти існуючі IDs `pay_...`, `exp_...`, `inc_...`, `txfr_...` під час міграції. `bank_transactions.matched_*` FK продовжать працювати без перемапінгу.

## 3. Міграційний скрипт — у `runMigrations(database)`

```ts
// Ідемпотентна міграція: виконується 1 раз. Критерій — чи існує таблиця `fin_operations`.
const fopExists = database.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='fin_operations'"
).get();

if (!fopExists) {
  database.exec(`CREATE TABLE fin_operations ...`);
  database.exec(`CREATE TABLE fin_operation_tags ...`);
  database.exec(`CREATE INDEX ...`);  // всі 11 індексів

  // Міграція даних з 4 старих таблиць
  const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!orgRow) return;

  // 3.1 INCOME → fin_operations (op_type='income')
  database.exec(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_to_id, amount, currency, amount_company,
       paid_at, accrued_at, category_id, project_id,
       comment, status, source, created_at)
    SELECT
      id, organization_id, 'income', account_id, amount, currency, amount,
      income_date, income_date, category, business_unit_id,
      description, 'completed', 'manual', created_at
    FROM income
  `);

  // 3.2 EXPENSES → fin_operations (op_type='expense')
  database.exec(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_from_id, amount, currency, amount_company,
       paid_at, accrued_at, category_id, project_id, counterparty_id,
       comment, method, source, created_by, created_at, updated_at)
    SELECT
      e.id, e.organization_id, 'expense', e.account_id, e.amount, e.currency, e.amount,
      e.expense_date, e.expense_date, e.category_id, e.business_unit_id, NULL,
      COALESCE(e.notes, e.description), e.method, 'manual', e.created_by, e.created_at, e.updated_at
    FROM expenses e
  `);

  // 3.3 TRANSFERS → fin_operations (op_type='transfer')
  database.exec(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_from_id, account_to_id,
       amount, currency, amount_company, paid_at, accrued_at,
       comment, source, created_by, created_at)
    SELECT
      id, organization_id, 'transfer', from_account_id, to_account_id,
      amount, currency, amount, transfer_date, transfer_date,
      notes, 'manual', created_by, created_at
    FROM transfers
  `);

  // 3.4 PAYMENTS → fin_operations (op_type='income' або 'expense' для refund)
  database.exec(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_from_id, account_to_id,
       amount, currency, amount_company, paid_at, accrued_at,
       reservation_id, status, method, payment_subtype,
       comment, source, source_ref, created_at)
    SELECT
      id, organization_id,
      CASE WHEN type = 'refund' THEN 'expense' ELSE 'income' END,
      CASE WHEN type = 'refund' THEN account_id ELSE NULL END,
      CASE WHEN type = 'refund' THEN NULL ELSE account_id END,
      amount, COALESCE(currency, 'CZK'), amount,
      paid_at, paid_at, reservation_id, status, method, type,
      notes,
      CASE
        WHEN auto_created = 1 AND notes LIKE '%Hostex%' THEN 'hostex'
        WHEN auto_created = 1 AND notes LIKE '%Teya%'   THEN 'teia'
        WHEN auto_created = 1                            THEN 'booking_widget'
        ELSE 'manual'
      END,
      reservation_id,  -- source_ref = reservation_id для легасі-payments
      created_at
    FROM payments
  `);

  // 3.5 Оновлення bank_transactions: переіменувати matched_expense_id + matched_payment_id → matched_operation_id
  // SQLite не підтримує DROP COLUMN. Робимо додатково: додаємо нову колонку + копіюємо + лишаємо старі як legacy
  const btxCols = database.prepare("PRAGMA table_info(bank_transactions)").all();
  if (!btxCols.some(c => c.name === 'matched_operation_id')) {
    database.exec("ALTER TABLE bank_transactions ADD COLUMN matched_operation_id TEXT REFERENCES fin_operations(id)");
    database.exec("UPDATE bank_transactions SET matched_operation_id = COALESCE(matched_expense_id, matched_payment_id)");
    database.exec("CREATE INDEX idx_btx_matched_op ON bank_transactions(matched_operation_id)");
  }

  // 3.6 Додаємо link-колонки у capex_items / accruals / invoices (заготовка для майбутнього)
  for (const tbl of ['capex_items', 'accruals', 'invoices']) {
    const cols = database.prepare(`PRAGMA table_info(${tbl})`).all();
    if (!cols.some(c => c.name === 'fin_operation_id')) {
      database.exec(`ALTER TABLE ${tbl} ADD COLUMN fin_operation_id TEXT REFERENCES fin_operations(id)`);
    }
  }

  // 3.7 Верифікація
  const counts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM income) + (SELECT COUNT(*) FROM expenses) +
      (SELECT COUNT(*) FROM transfers) + (SELECT COUNT(*) FROM payments) AS old_total,
      (SELECT COUNT(*) FROM fin_operations) AS new_total
  `).get();
  console.log(`[DB] Migrated to fin_operations: ${counts.new_total} rows (old tables: ${counts.old_total})`);
  if (counts.old_total !== counts.new_total) {
    throw new Error(`Migration count mismatch: old=${counts.old_total}, new=${counts.new_total}`);
  }

  // 3.8 Sum verification (sanity)
  const sums = database.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM income)
      + (SELECT COALESCE(SUM(amount),0) FROM expenses)
      + (SELECT COALESCE(SUM(amount),0) FROM transfers)
      + (SELECT COALESCE(SUM(amount),0) FROM payments) AS old_sum,
      (SELECT COALESCE(SUM(amount),0) FROM fin_operations) AS new_sum
  `).get();
  if (Math.abs(sums.old_sum - sums.new_sum) > 0.01) {
    throw new Error(`Sum mismatch: old=${sums.old_sum}, new=${sums.new_sum}`);
  }

  console.log('[DB] fin_operations migration verified ✓');

  // 3.9 DROP старих таблиць — тільки після перевірки
  database.exec('DROP TABLE payments');
  database.exec('DROP TABLE expenses');
  database.exec('DROP TABLE income');
  database.exec('DROP TABLE transfers');
  console.log('[DB] Dropped legacy tables: payments, expenses, income, transfers');
}
```

### Чому один блок, не окремі скрипти

Користувач просить один комміт. Значить, міграція виконується при запуску dev/prod після pull. `IF NOT EXISTS`-guard гарантує ідемпотентність. Якщо верифікація падає — throw → dev не запускається, адмін бачить помилку і може вручну полагодити.

## 4. Новий публічний API — `src/modules/finance/api/operations.handlers.ts`

Замінює собою 4 існуючих handler-файли.

```ts
export async function listOperations(request: NextRequest): Promise<NextResponse>
// ?op_type=income|expense|transfer
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
// ?account_id= (from OR to)
// ?category_id=
// ?project_id=
// ?counterparty_id=
// ?tag_id=
// ?status=
// ?search= (comment)
// ?reservation_id=
// ?page= &pageSize=
// Returns { items, total, page, pageSize }

export async function getOperation(request: NextRequest, ctx): Promise<NextResponse>

export async function createOperation(request: NextRequest): Promise<NextResponse>
// body: {op_type, account_from_id?, account_to_id?, amount, currency?, amount_to?, currency_to?,
//        paid_at, accrued_at?, category_id?, project_id?, counterparty_id?,
//        reservation_id?, status?, method?, payment_subtype?, comment?, source?,
//        is_planned?, tag_ids?: string[]}
// Валідація:
//   op_type='income' → account_to_id обов'язковий, account_from_id заборонений
//   op_type='expense' → account_from_id обов'язковий, account_to_id заборонений
//   op_type='transfer' → обидва обов'язкові, category_id=null, reservation_id=null
//   amount > 0
//   accrued_at дефолт = paid_at
//   amount_company — компанійний CZK-еквівалент (якщо currency != CZK → шукаємо fx_rate у finance_exchange_rates)

export async function updateOperation(request, ctx): Promise<NextResponse>
// Частковий update. Валідує op_type-інваріанти.

export async function deleteOperation(request, ctx): Promise<NextResponse>
// Після delete: якщо reservation_id не null → recalcPaymentStatus(reservation_id)
// Якщо bank_transactions.matched_operation_id = id → set NULL

export async function duplicateOperation(request, ctx): Promise<NextResponse>
// «Додати схожий» — повертає нову операцію з тими ж полями, статусом 'completed', paid_at=today
```

Додатково — аgregateні хендлери для existing calls:

```ts
export async function getReservationPaymentTotals(reservationId: string): number
// Замінює стару SELECT SUM(amount) FROM payments WHERE reservation_id = ? AND status = 'completed'

export async function recalcReservationPaymentStatus(reservationId: string): void
// Читає суми з fin_operations, оновлює reservations.payment_status
```

## 5. Reservation-to-operation bridge API

**Нова публічна функція у `@finance`** для використання зовнішніх модулів:

```ts
// src/modules/finance/api/payment-bridge.ts
export function createPaymentOperation(input: {
  reservationId: string;
  amount: number;
  currency?: string;
  method: 'cash' | 'card' | 'online' | 'bank_transfer' | 'booking_platform';
  paymentSubtype: 'deposit' | 'full' | 'service' | 'refund';
  source: 'teia' | 'hostex' | 'booking_widget' | 'manual';
  sourceRef?: string;
  paidAt?: string;
  status?: 'completed' | 'pending';
  comment?: string;
  autoCreated?: boolean;
}): { operationId: string }
```

Усі 4 зовнішні callers (hostex-sync, webhook-teya, widget-payment-return, cleanup-ical) переписуються, щоб викликати це одне API замість прямих INSERT. Це **централізує** payment-логіку і ховає схему fin_operations від інших модулів.

## 6. Перелік файлів для переписування

### Створюємо

| # | Файл | Приблизно LoC |
|---|---|---|
| 1 | `src/modules/finance/api/operations.handlers.ts` | ~550 |
| 2 | `src/modules/finance/api/payment-bridge.ts` | ~80 |
| 3 | `src/app/api/finance/operations/route.ts` | 5 |
| 4 | `src/app/api/finance/operations/[id]/route.ts` | 5 |
| 5 | `src/app/api/finance/operations/[id]/duplicate/route.ts` | 5 |
| 6 | `src/app/(dashboard)/finance/operations/page.tsx` | ~350 |
| 7 | `src/app/(dashboard)/finance/operations/_components/OperationsTable.tsx` | ~250 |
| 8 | `src/app/(dashboard)/finance/operations/_components/OperationFilters.tsx` | ~180 |
| 9 | `src/app/(dashboard)/finance/operations/_components/IncomeModal.tsx` | ~200 |
| 10 | `src/app/(dashboard)/finance/operations/_components/ExpenseModal.tsx` | ~200 |
| 11 | `src/app/(dashboard)/finance/operations/_components/TransferModal.tsx` | ~170 |

### Переписуємо / оновлюємо

| Файл | Зміна |
|---|---|
| `src/lib/db.ts` | Додати міграційний блок з §3 (~100 LoC) |
| `src/modules/finance/api/index.ts` | Замінити експорти: прибрати 4 старі handler-файли, додати `operations.handlers`, `payment-bridge` |
| `src/modules/finance/api/accounts.handlers.ts` | Балансова формула — single table з op_type-CASE замість 4 subqueries |
| `src/modules/finance/api/bank.handlers.ts` | `matched_expense_id` / `matched_payment_id` → `matched_operation_id` |
| `src/modules/finance/api/reports.handlers.ts` | ВСІ 8+ функцій overview/pnl/cashflow/expected переписати на fin_operations |
| `src/modules/finance/api/log.handlers.ts` | UNION-4 → single SELECT з op_type |
| `src/modules/finance/README.md` | Нова секція, legacy handlers видалені |
| `src/modules/finance/api/expense-categories.handlers.ts` | Без змін (table не видаляємо) |
| `src/modules/finance/api/business-units.handlers.ts` | Без змін |
| `src/app/(dashboard)/finance/page.tsx` | Overview dashboard читає з `/api/finance/overview` — endpoint сам переписаний |
| `src/app/(dashboard)/finance/expenses/page.tsx` | Читає з `/api/finance/operations?op_type=expense` |
| `src/app/(dashboard)/finance/log/page.tsx` | Читає з `/api/finance/operations` (всі типи) |
| `src/lib/hostex-sync.ts` | Рядок 445-453: виклик `createPaymentOperation(...)` замість `INSERT INTO payments` |
| `src/modules/payments/api/webhook-teya.handlers.ts` | Рядок 202: аналогічно |
| `src/modules/bookings/api/widget-payment-return.handlers.ts` | Рядки 60, 110: аналогічно |
| `src/modules/admin/api/cleanup-ical.handlers.ts` | Рядок 84: `DELETE FROM fin_operations WHERE reservation_id IN (...)` |
| `src/modules/guests/data/guest-portal.repo.ts` | Рядок 47: `SELECT SUM(amount) FROM fin_operations WHERE reservation_id=? AND op_type='income' AND status='completed'` |
| `src/modules/reports/api/reports.handlers.ts` | Рядки 48-56: revenue breakdown переписується на fin_operations |

### Видаляємо

| Файл | Причина |
|---|---|
| `src/modules/finance/api/payments.handlers.ts` | Заміна: operations.handlers |
| `src/modules/finance/api/expenses.handlers.ts` | Те саме |
| `src/modules/finance/api/expense.handlers.ts` | Те саме |
| `src/modules/finance/api/income.handlers.ts` | Те саме |
| `src/modules/finance/api/transfers.handlers.ts` | Те саме |
| `src/app/api/finance/payments/` (directory) | Заміна: /api/finance/operations |
| `src/app/api/finance/expenses/` | Те саме |
| `src/app/api/finance/income/` | Те саме |
| `src/app/api/finance/transfers/` | Те саме |

### Залишаємо без змін, але після перевірки

- `src/app/(dashboard)/finance/expenses/page.tsx` — продовжує існувати як legacy-view (показує тільки expenses через `?op_type=expense` фільтр) або прибираємо взагалі, перенаправляючи на `/finance/operations?op_type=expense`

## 7. Новий головний екран `/finance/operations`

За зразком скріншотів Finmap:

- **Хедер:** 3 кнопки `+ Дохід` / `− Витрата` / `⇄ Переказ` + фільтри (період, рахунок, категорія, проєкт, контрагент, тег, пошук)
- **Бокова панель:** «Всього на рахунках» (вже маємо в accounts.handlers) + список рахунків з залишками
- **Таблиця:** Дата | Сума | Рахунок/залишок | Контрагент | Категорія | Проєкт | Коментар | [теги]
- **Модалки:** IncomeModal, ExpenseModal, TransferModal — точно як у Finmap (field-set з ваших скрінів). Кнопка «Додати і створити схожий» викликає `duplicateOperation`.
- **Пагінація:** 50 рядків за сторінку (достатньо для 428 операцій у вашому експорті)

## 8. Тест-план

Виконую перед коммітом:

**Sanity (БД):**
1. `npm run dev` → міграція виконується, логи: `[DB] fin_operations migration verified ✓`
2. `SELECT COUNT(*) FROM fin_operations` === загальна кількість у 4 старих (428 операцій з live data)
3. `SELECT SUM(amount)` === сума 4 старих (з точністю до 0.01)
4. `SELECT COUNT(*) FROM fin_operations WHERE op_type='income'` має співпадати з колишньою `income` + 'income' payments
5. `bank_transactions.matched_operation_id` заповнений для всіх рядків, що мали `matched_expense_id` або `matched_payment_id`

**API:**
6. `GET /api/finance/operations?op_type=income` — повертає income-операції
7. `POST /api/finance/operations` з op_type=expense — працює, балансовий SELECT у accounts оновлює `balance`
8. `DELETE /api/finance/operations/:id` — recalc reservation payment status викликається якщо `reservation_id` не null
9. `GET /api/finance/accounts` — поточний балансовий SQL переписаний, суми збігаються з до-міграції

**Legacy external callers:**
10. Симуляція Teya-webhook → створюється payment-operation з source='teia', reservation.payment_status оновлено
11. Hostex-sync → auto-створює income-operation з source='hostex'
12. Guest-portal `SELECT SUM` на test-reservation — повертає правильну суму
13. `/api/reports/...` (модуль @reports) — revenue дорівнює до-міграційному

**UI:**
14. `/finance/operations` рендериться, показує 428 операцій
15. Модалка IncomeModal створює, зберігає, таблиця оновлюється
16. ExpenseModal + TransferModal — аналогічно
17. `/finance` дашборд (overview) показує ті самі KPI що до міграції
18. `/finance/expenses` показує тільки expense-операції
19. Створення експенсу з існуючої форми — пише в `fin_operations`
20. `/finance/log` показує всі типи змішаних
21. Bank statements page — матчинг працює, `matched_operation_id` виставляється

**TS:**
22. `npx tsc --noEmit` — нуль помилок

## 9. Rollback-план (якщо щось критичне знайдеться після коміту)

Оскільки комміт одне — ревертати через `git revert <hash>`:
1. Дзеркально відновити старі таблиці — міграція ідемпотентна, але вона DROP-ає old. Треба **backup** перед стартом: `cp data/alisio.db data/alisio.db.pre-pr6.backup` у dev.
2. У prod — якщо вже задеплоєно і впаде, `git revert` + відновлення з SQL-бекапу.

**Обов'язкова умова перед коммітом:** я створюю backup `data/alisio.db.pre-pr6.backup` і фіксую його як артефакт.

## 10. Обсяг

- **~3500 LoC** коду (+)
- **~1800 LoC** видалення (-)
- **~40 файлів** torkaются
- **~3-4 години** імплементації при уважному читанні кожного callsite'а

## 11. Питання перед стартом

1. **Backup dev-DB перед міграцією** — роблю? (сильно рекомендую, коштує нічого)
2. **Payment-type 'refund'** → op_type='expense' — погоджуєтесь з моїм рішенням?
3. **`id` TEXT зберігаємо** (не INTEGER auto-increment) — це значить старі IDs `pay_...`, `exp_...` залишаються у fin_operations. Це добре для FK сумісності, погано для майбутньої гігієни. Готові жити з неоднорідними ID-префіксами (нові буде напр. `fop_...`, старі `pay_...`, `exp_...`)?
4. **Якщо верифікація кількості/сум не зійдеться** — міграція кидає помилку, dev не запускається. Ок? (Це зупинить роботу до ручного розбору — правильно для prod-безпеки.)
5. **`/finance/expenses` — залишаю як є, чи редірект на `/finance/operations?op_type=expense`?** Легший шлях — залишити сторінку, щоб нічого не ламалось. Рекомендую «залишити».
