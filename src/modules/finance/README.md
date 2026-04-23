# Finance Module

Управляє фінансами: платежі до резервацій, витрати, CapEx, нарахування (accruals), банківські виписки, бізнес-одиниці. Надає P&L, cashflow та очікувані платежі.

## Публічне API

```ts
import { listPayments, createPayment, getFinanceOverview } from '@finance'
```

| Функція / Тип | Опис |
|---|---|
| `getFinanceOverview(req)` | Загальний огляд фінансів |
| `getPnl(req)` | P&L звіт |
| `getCashflow(req)` | Cashflow звіт |
| `getExpectedPayments(req)` | Очікувані надходження |
| `listPayments(req)` | Список платежів |
| `createPayment(req)` | Додати платіж до резервації |
| `deletePayment(req, ctx)` | Видалити платіж |
| `listExpenses()` | Список витрат |
| `createExpense(req)` | Додати витрату |
| `getExpense(req, ctx)` | Отримати витрату |
| `updateExpense(req, ctx)` | Оновити витрату |
| `deleteExpense(req, ctx)` | Видалити витрату |
| `listExpenseCategories()` | Категорії витрат |
| `createExpenseCategory(req)` | Додати категорію |
| `listBusinessUnits()` | Бізнес-одиниці |
| `listCapex()` | Список CapEx |
| `createCapex(req)` | Додати CapEx |
| `getCapexItem(req, ctx)` | Отримати CapEx-запис |
| `updateCapexItem(req, ctx)` | Оновити CapEx-запис |
| `deleteCapexItem(req, ctx)` | Видалити CapEx-запис |
| `listAccruals()` | Список нарахувань |
| `createAccrual(req)` | Додати нарахування |
| `getAccrual(req, ctx)` | Отримати нарахування |
| `updateAccrual(req, ctx)` | Оновити нарахування |
| `deleteAccrual(req, ctx)` | Видалити нарахування |
| `listBankStatements()` | Список банківських виписок |
| `listBankTransactions(req)` | Транзакції виписки |
| `updateBankTransaction(req, ctx)` | Оновити/зматчити транзакцію |
| `importBankStatement(req)` | Імпортувати XML виписку |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД
- `@core/auth` — перевірка сесії

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `finance.payment_created` | `{ paymentId, reservationId, amount }` | Новий платіж |
| `finance.payment_deleted` | `{ paymentId }` | Видалення платежу |
| `finance.expense_created` | `{ expenseId, amount, category }` | Нова витрата |

## Схема даних

**Таблиці:** `payments`, `expenses`, `expense_categories`, `business_units`, `capex`, `accruals`, `bank_statements`, `bank_transactions`

## Структура файлів

```
finance/
  api/
    index.ts                      ← єдина точка експорту
    reports.handlers.ts
    payments.handlers.ts
    expenses.handlers.ts
    expense.handlers.ts
    expense-categories.handlers.ts
    business-units.handlers.ts
    capex.handlers.ts
    capex-item.handlers.ts
    accruals.handlers.ts
    accrual.handlers.ts
    bank.handlers.ts
  events/
    published.ts
```

## Точки розширення

- Новий тип звіту → `reports.handlers.ts`
- Новий фінансовий документ → окремий `<name>.handlers.ts` + `index.ts`
- Нова подія → `events/published.ts` + `src/core/event-bus/registry.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
