# PR #9 — Cashflow + P&L матриці з drill-down (Finmap migration)

Finmap-стиль звіти: таблиця категорія×місяць з розкриттям (root → sub → operations).

## 1. Скоуп

### In scope
- **Reports landing page** `/finance/reports` — grid з 8 карток звітів (як у Finmap)
- **Cashflow matrix** `/finance/reports/cashflow`:
  - Таблиця рядки × колонки: категорії згруповані по op_type (Надходження/Видатки), колонки = місяці + Total + Avg
  - Basis toggle: По факту (paid_at) / По нарахуванню (accrued_at)
  - Фільтри: період (N місяців), рахунок, проєкт
  - Drill-down: клік на число → модалка з операціями; клік на категорію → розкриття підкатегорій
  - Рядки «Чистий потік», «Залишок на початок/кінець» внизу
- **P&L matrix** `/finance/reports/pnl`:
  - Групування по classifier: Revenue → COGS → Gross Profit → Variable → Marginal Income → Operational → EBITDA → Tax → CapEx → Net
  - Margin % у підсумкових рядках
  - Drill-down аналогічно
- **Financial indicators** (mini-card на reports landing): EBITDA, Gross Profit, Marginal Income, Margin % за поточний місяць
- **Drill-down модалка**: список операцій з посиланням на редагування

### Out of scope
- Balance sheet (assets vs liabilities) — PR #10 (детальніша логіка)
- Account statement — PR #10
- Audit log — існує через `/api/finance/log`, не переробляємо
- Project profitability — можна додати як окремий звіт у PR #10
- Export XLS/PDF — PR #11

## 2. Нові handlers у `reports.handlers.ts`

Додаю два нові ендпоінти (існуючі `getCashflow`/`getPnl` залишаються для дашборду):

```ts
getCashflowMatrix(request)
// ?from=YYYY-MM&to=YYYY-MM&basis=paid|accrued&account_id=&project_id=
// Returns: { months: string[], groups: [{type, label, rows, total}], netFlow, openingBalance, endingBalance }

getPnlMatrix(request)
// ?from=YYYY-MM&to=YYYY-MM&basis=paid|accrued
// Returns: { months: string[], sections: [{name, key, classifier?, rows, subtotal, margin_pct?}], finalResult }

getFinancialIndicators(request)
// ?month=YYYY-MM
// Returns: { revenue, cogs, variable, operational, gross_profit, marginal_income, ebitda, margin_pct }

getOperationsForDrillDown(request)
// ?month=YYYY-MM&category_id=&op_type=
// Returns: list of operations matching filters
```

### SQL для matrix

Одна комплексна query для cashflow (без CTE, просто SELECT з GROUP BY category, month):

```sql
SELECT
  ec.id AS category_id,
  ec.name AS category_name,
  ec.icon AS category_icon,
  ec.classifier,
  ec.op_type,
  ec.parent_id,
  strftime('%Y-%m', o.paid_at) AS month,
  SUM(o.amount) AS total
FROM fin_operations o
LEFT JOIN expense_categories ec ON ec.id = o.category_id
WHERE o.status = 'completed'
  AND o.paid_at BETWEEN ? AND ?
  AND o.op_type != 'transfer'
GROUP BY ec.id, month
```

Потім JS-агрегація у matrix-структуру.

## 3. Reports landing page `/finance/reports/page.tsx`

Grid-сітка 4×2 з картками (як у вашому скріні Finmap):
- 💰 Гроші / Cash Flow → `/finance/reports/cashflow`
- 📊 P&L → `/finance/reports/pnl`
- 📋 Виписка за рахунком → `/finance/reports/statement` (stub "coming soon")
- 📁 Проєкти → `/finance/reports/projects` (stub)
- ⚖️ Баланс → `/finance/reports/balance` (stub)
- 🎯 План/Факт → `/finance/reports/plan-fact` (stub)
- 📈 Фінансові показники → mini-modal з current month indicators
- 🕐 Історія дій → `/finance/log` (link to existing log page)

## 4. Cashflow matrix UI

### Компоненти
- `CashflowMatrixPage` — орchestrator
- `MatrixTable` — реюзабельна матриця (використовується і в P&L)
- `MatrixRow` — один рядок з колапс/експанд (якщо є sub-rows)
- `DrillDownModal` — показує список операцій при кліку на комірку

### Візуал
- Sticky header з місяцями + total column
- Sticky first column (category names)
- Expandable rows (▸/▾ icon)
- Клік на число в комірці → open DrillDownModal
- Колір: доходи зелений (positive), витрати червоний, net flow — gradient
- Format: compact K notation at >1000 CZK

## 5. Файли

### Створюються
- `src/app/(dashboard)/finance/reports/page.tsx` (~150 LoC)
- `src/app/(dashboard)/finance/reports/cashflow/page.tsx` (~400 LoC)
- `src/app/(dashboard)/finance/reports/pnl/page.tsx` (~350 LoC)
- `src/app/(dashboard)/finance/reports/_components/MatrixTable.tsx` (~200 LoC)
- `src/app/(dashboard)/finance/reports/_components/DrillDownModal.tsx` (~130 LoC)
- `src/app/api/finance/cashflow-matrix/route.ts`
- `src/app/api/finance/pnl-matrix/route.ts`
- `src/app/api/finance/indicators/route.ts`
- `src/app/api/finance/operations-drill-down/route.ts`

### Змінюються
- `src/modules/finance/api/reports.handlers.ts` — додати 4 нові функції
- `src/modules/finance/api/index.ts` — export
- `src/app/(dashboard)/finance/page.tsx` — додати кнопку «Звіти»
- `src/app/(dashboard)/finance/operations/page.tsx` — додати кнопку «Звіти»

**Разом:** ~1350 LoC. L-розмір.

## 6. Питання

1. **Basis toggle** — у одному звіті завжди 1 basis або показати обидва колонки паралельно? Я за **toggle** (простіше). Ок?
2. **Group by project** як альтернатива group by category — у PR #10 чи зараз?
3. **Sparkline у P&L рядках** (мінітренди за 12 міс) — nice-to-have, у цьому PR чи наступному? Моя думка: **наступний**, щоб не роздувати.
4. **Financial indicators** — модалка на landing чи окрема сторінка? Модалка простіша. Ок?

Ваші відповіді → стартую.
