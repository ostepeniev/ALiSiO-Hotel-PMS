# PR #1 — Рахунки + Курси валют у Налаштуваннях

Перший ревертабельний крок міграції на Finmap-стиль. **Малий, ізольований, не ламає нічого.**

## Scope adjustment

При дослідженні коду виявив: таблиця **`finance_accounts` вже існує** у `src/lib/db.ts:1540` з повним CRUD у `src/modules/finance/api/accounts.handlers.ts`. Її `listAccounts` вже обчислює поточний залишок з усіх income/payments/expenses/transfers.

Тому PR #1 **не створює** нових «accounts»-таблиць. Замість того:

1. Додаємо нову таблицю `finance_exchange_rates`
2. Додаємо відсутні хендлери на existing accounts (`archiveAccount`, `deleteAccount`, `reconcileAccount`)
3. Створюємо сторінку `/finance/settings` з двома вкладками: **Рахунки** + **Курси валют**

Жоден існуючий екран не змінюється.

---

## 1a. Rebuild `finance_accounts` — додаємо `card` і `credit_limit`

Існуючий `CHECK (type IN ('cash','bank','investment','other'))` не має `card`, і немає `credit_limit`. Робимо **повний rebuild таблиці** (SQLite не вміє ALTER CHECK), ідемпотентно — перевіряємо чи вже є `credit_limit` через `PRAGMA table_info`.

```sql
-- Виконується тільки якщо колонки credit_limit ще немає
CREATE TABLE finance_accounts_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cash' CHECK (type IN ('cash','bank','card','investment','other')),
  currency TEXT NOT NULL DEFAULT 'CZK',
  initial_balance REAL NOT NULL DEFAULT 0,
  credit_limit REAL,                 -- NULL для cash/bank/investment, число для card
  color TEXT DEFAULT '#6366f1',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO finance_accounts_new
  (id, organization_id, name, type, currency, initial_balance, color, is_active, sort_order, created_at)
SELECT
  id, organization_id, name, type, currency, initial_balance, color, is_active, sort_order, created_at
FROM finance_accounts;
DROP TABLE finance_accounts;
ALTER TABLE finance_accounts_new RENAME TO finance_accounts;
CREATE INDEX IF NOT EXISTS idx_fin_acct_org ON finance_accounts(organization_id);
```

**`credit_limit`** використовується для типу `card`:
- Доступний баланс на картці = `credit_limit + computed_balance` (computed_balance від'ємний для боргу)
- У UI «Всього на рахунках» картка показується окремою секцією «Картки: доступно X / використано Y»
- Для типів cash/bank/investment — `credit_limit IS NULL`, лишається ігнорованим

## 1b. Нова таблиця `finance_exchange_rates`

Додається в `runMigrations()` у `src/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS finance_exchange_rates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  effective_from TEXT NOT NULL,         -- ISO date, YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, from_currency, to_currency, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_fx_org ON finance_exchange_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_fx_pair ON finance_exchange_rates(from_currency, to_currency, effective_from);
```

Пара `(from, to)` — направлена. Для EUR→CZK і CZK→EUR зберігається два записи (або рахується як `1/rate` — але краще явно для аудиту).

## 2. Оновлення `finance_accounts`

**Схему не чіпаємо.** Існуюча `finance_accounts` підходить для Finmap-функцій. Додаємо лише нові хендлери:

### Нові хендлери в `src/modules/finance/api/accounts.handlers.ts`

- `archiveAccount(request)` — `PATCH` ставить `is_active = 0`. Це «тихе» видалення (зберігає зв'язки з operations).
- `deleteAccount(request)` — `DELETE`, тільки якщо немає жодної прив'язаної операції; інакше повертає 409 з текстом «Маєте N операцій — архівуйте замість видалення».
- `reconcileAccount(request)` — `POST /reconcile`, тіло `{ id, actual_balance, note? }`. Рахує поточний `computed_balance` через SQL (те саме що `listAccounts` робить), порівнює, створює окрему операцію-коригування типу `adjustment` (поки — через існуючу `expenses` або `income` з категорією «Звірка»; повноцінна `fin_operations` прийде у PR #6). Повертає `{ computed, actual, delta, adjustment_operation_id }`.

### Новий файл `src/modules/finance/api/exchange-rates.handlers.ts`

```ts
export async function listExchangeRates(_request: NextRequest): Promise<NextResponse>
export async function upsertExchangeRate(request: NextRequest): Promise<NextResponse>
export async function deleteExchangeRate(request: NextRequest): Promise<NextResponse>
```

- `list`: усі курси org-у, сортування за `effective_from DESC`
- `upsert`: якщо є `id` — update, інакше insert. Перевіряє `from_currency != to_currency`, `rate > 0`.
- `delete`: за `id`. Hard delete (історичні курси потрібні для звітів; попередження в UI, якщо є операції, що цитують цю дату).

### Експорт у `src/modules/finance/api/index.ts`

```ts
export {
  listAccounts, createAccount, updateAccount,
  archiveAccount, deleteAccount, reconcileAccount,
} from './accounts.handlers';
export {
  listExchangeRates, upsertExchangeRate, deleteExchangeRate,
} from './exchange-rates.handlers';
```

## 3. API routes

Нові або оновлені файли під `src/app/api/finance/`:

```
accounts/
  route.ts                    -- GET listAccounts, POST createAccount, PATCH updateAccount (існує)
  archive/route.ts            -- PATCH archiveAccount
  [id]/route.ts               -- DELETE deleteAccount
  [id]/reconcile/route.ts     -- POST reconcileAccount
exchange-rates/
  route.ts                    -- GET listExchangeRates, POST upsertExchangeRate
  [id]/route.ts               -- DELETE deleteExchangeRate
```

Патерн — як існуючі: імпорт з `@finance`, прямий реекспорт `export const GET = listAccounts`.

## 4. UI — `/finance/settings/page.tsx`

**Нова сторінка**, не змінює існуючу `/finance`. Патерн — як `/crm/settings` (одна сторінка з табами).

### Структура

```tsx
'use client';
<div className="settings">
  <Sidebar tabs={['accounts', 'exchange-rates']} />
  <Content>
    {tab === 'accounts' && <AccountsTab />}
    {tab === 'exchange-rates' && <ExchangeRatesTab />}
  </Content>
</div>
```

Таби-плейсхолдери для майбутніх (Категорії, Проєкти, Контрагенти, Теги, Автоправила, Користувачі) — вимкнені з підказкою «Незабаром», щоб меню одразу показувало кінцевий вигляд.

### Таб «Рахунки»

- Заголовок + кнопка `+ Додати рахунок`
- Таблиця: `[іконка кольору] Назва | Тип | Валюта | Стартовий залишок | Поточний залишок | [олівець] [архів] [видалити]`
- Клік `+ Додати` або олівця — модалка з полями: Назва, Тип (cash/bank/investment/other), Валюта (CZK/EUR/USD — вільний ввід), Стартовий залишок, Колір, Порядок
- Клік «архів» — конфірм, потім PATCH `/archive`
- Клік «видалити» — конфірм; якщо є операції — показує помилку з кількістю
- Кнопка «Звірка» біля поточного залишку — модалка «Звірка рахунку»: показує обчислене vs. фактичне, дельта, поле «Коментар», кнопка «Створити коригування»

### Таб «Курси валют»

- Заголовок + кнопка `+ Додати курс`
- Таблиця: `З | → | На | Курс | Діє з | [олівець] [видалити]`
- Зверху картка «Поточні курси»: EUR→CZK = 25.20 (на сьогодні), CZK→EUR = 0.0397
- Модалка додавання: `from_currency` select, `to_currency` select, `rate` number, `effective_from` date-picker

### Де лінк на сторінку

- На існуючій `/finance/page.tsx` додається кнопка «⚙ Налаштування» у хедер, веде на `/finance/settings`
- У бічному меню дашборда (якщо є) — підпункт «Фінанси → Налаштування»

## 5. Файли, що створюються / змінюються

### Створюються

- `src/lib/db.ts` — додається CREATE TABLE `finance_exchange_rates` (≈ 15 рядків у існуючому файлі)
- `src/modules/finance/api/exchange-rates.handlers.ts` — новий файл (≈ 80 LoC)
- `src/app/api/finance/exchange-rates/route.ts` — новий (≈ 5 LoC)
- `src/app/api/finance/exchange-rates/[id]/route.ts` — новий (≈ 5 LoC)
- `src/app/api/finance/accounts/archive/route.ts` — новий (≈ 5 LoC)
- `src/app/api/finance/accounts/[id]/route.ts` — новий (≈ 5 LoC)
- `src/app/api/finance/accounts/[id]/reconcile/route.ts` — новий (≈ 5 LoC)
- `src/app/(dashboard)/finance/settings/page.tsx` — нова сторінка (≈ 250 LoC)
- `src/app/(dashboard)/finance/settings/_components/AccountsTab.tsx` — компонент (≈ 150 LoC)
- `src/app/(dashboard)/finance/settings/_components/ExchangeRatesTab.tsx` — компонент (≈ 100 LoC)
- `src/app/(dashboard)/finance/settings/_components/AccountModal.tsx` — модалка (≈ 80 LoC)
- `src/app/(dashboard)/finance/settings/_components/ExchangeRateModal.tsx` — модалка (≈ 60 LoC)
- `src/app/(dashboard)/finance/settings/_components/ReconcileModal.tsx` — модалка (≈ 70 LoC)

### Змінюються

- `src/modules/finance/api/accounts.handlers.ts` — додаються `archiveAccount`, `deleteAccount`, `reconcileAccount` (≈ 60 нових LoC)
- `src/modules/finance/api/index.ts` — додаються нові експорти (3-4 рядки)
- `src/modules/finance/README.md` — оновлюється секція «Публічне API»
- `src/app/(dashboard)/finance/page.tsx` — додається кнопка «⚙ Налаштування» (1 рядок)

**Разом:** ~850 LoC чистого коду (з UI). Це верхня межа «L», але без UI було би «M». Якщо хочеться ще менше — можна винести Курси валют у PR #1b.

## 6. Що НЕ робимо у PR #1

- Не створюємо `fin_accounts` / `fin_categories` / `fin_operations` / `fin_counterparties` / `fin_projects` / `fin_tags`
- Не чіпаємо `business_units`, `payments`, `expenses`, `income`, `transfers`
- Не робимо міграцію даних
- Не інтегруємо бронювання / Teia
- Не додаємо RBAC
- Не ламаємо існуючий `/finance` дашборд

## 7. Тест-план (ручне QA)

1. `npm run dev` → перейти на `/finance/settings`
2. Таб «Рахунки»: створити «Тест-рахунок CZK» → переконатися що з'явився у списку із залишком 0
3. Відредагувати назву → зберегти → перевірити
4. Архівувати → зникає зі списку активних, чекбокс «Показати архівовані» повертає
5. Спробувати видалити архівний → якщо нема операцій — видаляється; інакше 409
6. Звірка: ввести «фактичний залишок 1000», подивитись, що створилась коригуюча операція
7. Таб «Курси валют»: додати EUR→CZK = 25.20 з датою сьогодні → у списку є
8. Додати той самий ключ ще раз → upsert (не дублює)
9. Відкрити `/finance` (старий дашборд) → переконатись, що нічого не зламалось
10. `npm run build` → нуль TS-помилок, нуль lint-warnings у нових файлах

## 8. Коміт-план

Один PR, усі зміни одним коммітом:

```
feat(finance): add settings page with accounts + exchange rates (PR #1 of Finmap migration)

- Add finance_exchange_rates table and CRUD handlers
- Add archiveAccount, deleteAccount, reconcileAccount handlers
- Add /finance/settings page with Accounts and Exchange Rates tabs
- Placeholder tabs for future modules (Categories, Projects, etc.)
- No changes to existing finance screens or data
```

## 9. Ризики

| Ризик | Мітигація |
|---|---|
| Existing `finance_accounts.type` CHECK constraint = `('cash','bank','investment','other')` — не має `card` | Або додати `card` у CHECK (потребує rebuild таблиці), або мапити `card` на `bank`. **Рішення:** лишити як є, перейменувати у UI `bank` → «Банк/Картка». |
| Reconcile створює «operations» поки немає `fin_operations` — використовуємо старі `income`/`expenses` | Ок для MVP. У PR #6 міграція перенесе коригуючі записи. |
| Organization_id: існуючий код бере першу організацію. Якщо буде multi-org у майбутньому — PR#1 сумісний. | Без дій |
| `card` vs `bank` у `type` | Див. вище |

---

## Очікую «ок» або правки

Після підтвердження:
1. Ставлю todos для кожного з 13 файлів
2. Проходжу файл за файлом
3. Роблю ручний QA
4. Пропоную коміт-повідомлення
