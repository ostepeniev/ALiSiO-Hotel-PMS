# PR #10 — Звіти: Баланс, Проєкти, Виписка за рахунком, План/Факт

Закриваємо 4 плейсхолдер-картки з reports landing + бюджети.

## Скоуп

### 1. Баланс (`/finance/reports/balance`)
Snapshot активів/пасивів на вибрану дату.
- **Активи:** поточні залишки на рахунках з op_type `cash/bank/investment/other` (positive balance)
- **Пасиви:** cards з `credit_limit` (borg = negative balance * -1, доступно = credit_limit + balance)
- Group by currency (CZK, EUR); конвертуємо у CZK за activeExchangeRates
- Date picker → балансы розраховуються на той date (не today)

### 2. Проєкти (`/finance/reports/projects`)
Дохід/витрати по проєктах — матриця Проєкт × Місяць.
- Колонки: місяці + Total + Margin %
- Рядки: кожен `business_units`, subgroup по children
- Click number → drill-down (той самий DrillDownModal з PR #9, + filter project_id)

### 3. Виписка за рахунком (`/finance/reports/statement/[accountId]`)
Список операцій по одному рахунку з running balance.
- Заголовок: account info + opening/closing balance
- Таблиця: дата, опис, приход, розхід, running balance
- Експорт XLS — placeholder на майбутнє
- Фільтр за датами

### 4. План/Факт (`/finance/reports/plan-fact`)
Потрібна нова таблиця `fin_budgets`:
```sql
CREATE TABLE IF NOT EXISTS fin_budgets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  year INTEGER NOT NULL, month INTEGER NOT NULL,
  category_id TEXT, project_id TEXT,
  planned_amount REAL NOT NULL,
  created_at TEXT, updated_at TEXT,
  UNIQUE(organization_id, year, month, category_id, project_id)
);
```
- Таблиця: Категорія/Проєкт | Plan | Fact | Variance (абсолютна + %)
- Клік «редагувати план» → inline edit у клітинці plan
- Колір: фактичний доходи ≥ plan = зелений, витрати ≤ plan = зелений; навпаки — червоний
- Toggle: по категоріях / по проєктах
- Period selector (місяць або діапазон)

## Handlers (reports.handlers.ts)
```ts
getBalanceSheet(request)        // ?as_of=YYYY-MM-DD
getProjectProfitability(request) // ?from=YYYY-MM&to=YYYY-MM&basis=paid|accrued
getAccountStatement(request)     // ?account_id=...&from=&to=
getPlanFactReport(request)       // ?year=2026&month=04&by=category|project
```

## Budgets CRUD (`budgets.handlers.ts` new)
```ts
listBudgets(req)       // ?year=&month=&by=
upsertBudget(req)      // {year, month, category_id?, project_id?, planned_amount}
deleteBudget(req, ctx)
```

## API routes

```
/api/finance/balance/route.ts
/api/finance/project-profitability/route.ts
/api/finance/account-statement/route.ts
/api/finance/plan-fact/route.ts
/api/finance/budgets/route.ts           -- GET, POST
/api/finance/budgets/[id]/route.ts      -- DELETE
```

## UI

- `src/app/(dashboard)/finance/reports/balance/page.tsx`
- `src/app/(dashboard)/finance/reports/projects/page.tsx`
- `src/app/(dashboard)/finance/reports/statement/[accountId]/page.tsx`
- `src/app/(dashboard)/finance/reports/statement/page.tsx` — список рахунків для вибору
- `src/app/(dashboard)/finance/reports/plan-fact/page.tsx`

Reports landing update: знімаємо `disabled` з 4 карток.

## Обсяг
~1800 LoC. XL-розмір. Найбільший після PR #6.

## Рішення по дефолтам (не питаю)
- Balance sheet валюта = **CZK** (конвертуємо інші валюти)
- Project profitability basis = **paid_at** (для Cashflow-style звіту)
- Plan/Fact при відсутності бюджету: показуємо plan=0 (не приховуємо)
- Budget UNIQUE — або category_id, або project_id (не обидва), або жодне (загальний)
