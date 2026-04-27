# PR #7 — Автоправила (Finmap migration)

Автоматична категоризація операцій при імпорті банк-виписки + retroactive apply + авто-матчинг контрагентів.

## 1. Скоуп

### In scope
- Таблиця `fin_auto_rules` — правила з умовами та діями
- Таблиця `fin_auto_rule_matches` — лог спрацювань (для статистики «правило спрацювало N разів»)
- Handler `applyAutoRules(operationId[])` — застосовує активні правила до списку операцій
- Handler `previewAutoRules(filter)` — показує, що будуть змінити без збереження
- Інтеграція з bank-import: під час `importBankStatement` автоматично прогоняємо правила + `matchCounterpartyByText` (з PR #4)
- Retroactive кнопка: «Застосувати правила до існуючих операцій» (за фільтром)
- UI tab «Автоправила» у Settings: список правил + модалка create/edit + лічильник спрацювань
- Мікро-фіча: toggle «Дата угоди відрізняється» в `OperationModal` (accrued_at ≠ paid_at)

### Out of scope
- ML/AI auto-categorization (PR #15+)
- Regex-умови з capture groups (PR пізніше)
- Шаблони правил (preset rules)

## 2. Схема

```sql
CREATE TABLE IF NOT EXISTS fin_auto_rules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('income','expense','any')),
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  stop_on_match INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ar_org ON fin_auto_rules(organization_id);
CREATE INDEX idx_ar_active ON fin_auto_rules(is_active, sort_order);

CREATE TABLE IF NOT EXISTS fin_auto_rule_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES fin_auto_rules(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
  matched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_arm_rule ON fin_auto_rule_matches(rule_id);
CREATE INDEX idx_arm_op ON fin_auto_rule_matches(operation_id);
```

### Структура JSON

**`conditions_json`** — масив умов (логіка AND):
```json
[
  {"field": "comment", "op": "contains", "value": "FACEBK"},
  {"field": "amount", "op": ">", "value": 100}
]
```

Поля: `comment | amount | amount_company | account_from_id | account_to_id | currency | counterparty_id`
Оператори:
- Text: `contains` (case-insensitive) | `not_contains` | `starts_with` | `ends_with` | `equals`
- Number: `=` | `!=` | `>` | `>=` | `<` | `<=` | `between` (value=[min,max])
- ID fields: `equals` | `in` (value=[...])

**`actions_json`** — об'єкт дій:
```json
{
  "set_category_id": "ec_marketing",
  "set_project_id": "bu_glamping",
  "set_counterparty_id": "cp_facebook",
  "add_tag_ids": ["tag_urgent"],
  "auto_match_counterparty": true
}
```

`auto_match_counterparty: true` — спеціальна дія: викликає `matchCounterpartyByText(operation.comment)` і встановлює `counterparty_id`, якщо знайдено.

## 3. API

Новий файл `src/modules/finance/api/auto-rules.handlers.ts`:

```ts
listAutoRules(request)                     // ?archived=1
createAutoRule(request)
updateAutoRule(request, ctx)
deleteAutoRule(request, ctx)
moveAutoRule(request, ctx)                 // change sort_order
toggleAutoRule(request, ctx)               // is_active
applyAutoRulesToOperations(request)        // POST body: {operation_ids?, filter?}
applyAutoRulesPreview(request)             // POST — dry run
autoMatchCounterpartiesAllOps(request)     // POST — run matchByText across all unmatched
getRuleMatchStats(request, ctx)            // count of matches per rule
```

**Рушій застосування:** окремий модуль `src/modules/finance/data/auto-rules-engine.ts`:

```ts
export function evaluateCondition(op: Operation, cond: Condition): boolean
export function matchesAllConditions(op: Operation, conditions: Condition[]): boolean
export function applyActions(op: Operation, actions: Actions, db: any): Partial<Operation>
export function applyRulesToOperation(op: Operation, rules: Rule[], db: any): AppliedResult
```

Єдина точка застосування використовується і в API-handler'і, і в bank-import.

## 4. API routes

```
src/app/api/finance/auto-rules/route.ts                -- GET list, POST create
src/app/api/finance/auto-rules/[id]/route.ts           -- PATCH, DELETE
src/app/api/finance/auto-rules/[id]/toggle/route.ts    -- PATCH is_active
src/app/api/finance/auto-rules/[id]/move/route.ts      -- PATCH sort_order
src/app/api/finance/auto-rules/apply/route.ts          -- POST applyToOperations
src/app/api/finance/auto-rules/preview/route.ts        -- POST preview (dry-run)
src/app/api/finance/auto-rules/auto-match/route.ts     -- POST autoMatchCounterparties
```

## 5. Інтеграція з банк-імпортом

У [`bank.handlers.ts`](src/modules/finance/api/bank.handlers.ts), функція `importBankStatement`:

Після створення `fin_operations` для кожного bank-transaction (коли user натисне «Категоризувати»):
1. Прогнати `applyRulesToOperation(op, activeRules)` → встановити category/project/counterparty
2. Якщо `counterparty_id` ще null — виклик `matchCounterpartyByText(comment)` як fallback
3. Залогувати в `fin_auto_rule_matches`

## 6. UI — вкладка «Автоправила»

Активую `enabled: true` для `auto-rules` у `/finance/settings/page.tsx`.

### `AutoRulesTab.tsx`
- Список правил (таблиця: drag-handle | ім'я | тип | умов | дій | спрацьовувань | toggle is_active | дії)
- Drag-to-reorder через `sort_order` (порядок важливий для `stop_on_match`)
- Кнопка `+ Додати правило`
- Кнопка «Застосувати до існуючих» (з фільтром по період/op_type)
- Кнопка «Автоматчинг контрагентів» (запускає `autoMatchCounterpartiesAllOps`)

### `AutoRuleModal.tsx` — форма

Секції:
1. **Назва** + тип операції (дохід/витрата/будь-яка)
2. **Умови** — динамічний список:
   - [Поле select] [Оператор select] [Значення input/select]
   - Кнопка `+ Додати умову`
3. **Дії** — чекбокси зі значеннями:
   - ☑ Категорія → select
   - ☑ Проєкт → select
   - ☑ Контрагент → select АБО ☑ Автоматчинг за aliases
   - ☑ Додати теги → chip-input з finance_tags
4. **Опції** — `is_active` toggle, `stop_on_match` checkbox, sort_order

### Мікро-фіча «Дата угоди відрізняється»

У `OperationModal.tsx` (з PR #6) додаю toggle:
- Checkbox «Дата угоди відрізняється»
- Якщо увімкнено — показує ще один date-picker «Дата нарахування» (accrued_at)
- Якщо вимкнено — `accrued_at = paid_at` (як зараз)

## 7. Файли

### Створюються
- `src/modules/finance/data/auto-rules-engine.ts` (~200 LoC)
- `src/modules/finance/api/auto-rules.handlers.ts` (~280 LoC)
- 7 API routes (~25 LoC total)
- `src/app/(dashboard)/finance/settings/_components/AutoRulesTab.tsx` (~250 LoC)
- `src/app/(dashboard)/finance/settings/_components/AutoRuleModal.tsx` (~300 LoC — найбільший, бо динамічні conditions/actions)

### Змінюються
- `src/lib/db.ts` — 2 CREATE TABLE + 4 indexes (~30 LoC)
- `src/modules/finance/api/index.ts` — експорти
- `src/modules/finance/api/bank.handlers.ts` — інтеграція з auto-rules у `importBankStatement`
- `src/app/(dashboard)/finance/settings/page.tsx` — активація вкладки + імпорт
- `src/app/(dashboard)/finance/operations/_components/OperationModal.tsx` — toggle «Дата угоди»
- `src/modules/finance/README.md`

**Разом:** ~1200 LoC. L-розмір.

## 8. Тест-план

1. Створити правило: "comment contains 'FACEBK' + op_type='expense' → set category=Маркетинг, set project=Глемпинг"
2. Створити операцію з коментарем «FACEBK *3DPP META» → natural flow не торкає (bank_import не fired)
3. POST `/auto-rules/apply` з фільтром → правило спрацювало, категорія встановлена
4. Повторний POST → правило знову спрацьовує (idempotent OK — перезаписує)
5. `stop_on_match=true` — правило з меншим sort_order блокує пізніші
6. Toggle правила off → не застосовується
7. «Автоматчинг контрагентів» — пошук по aliases всіх операцій без counterparty
8. Bank-import з активним правилом → під час імпорту автоматично категоризує
9. OperationModal: toggle «Дата угоди» → показує accrued_at date input, сабмітиться окремо від paid_at
10. Delete правила → `fin_auto_rule_matches` CASCADE-видаляється
11. TS check, UI pages HTTP 200, smoke тести

## 9. Питання перед стартом

1. **Chip-input для тегів у Actions** — як у CounterpartyModal (з PR #4)? Ок?
2. **«Автоматчинг контрагента» vs `set_counterparty_id`** — mutually exclusive в UI (один або інший)? Ок?
3. **Drag-and-drop reorder** — як у Categories/Projects/Counterparties? Ок?
4. **Preview dry-run** — показує перелік операцій що будуть змінені + які поля → до/після. Додаю зараз чи відкладаємо на PR #8? Моя думка: **відкладаємо**, бо це окрема модалка з логікою показу diff. У PR #7 — тільки apply без preview.

## 10. Коміт-повідомлення

```
feat(finance): add auto-rules engine with counterparty auto-matching (PR #7)

- New tables: fin_auto_rules + fin_auto_rule_matches (audit log)
- Rule engine (src/modules/finance/data/auto-rules-engine.ts):
  conditions AND-logic, actions set category/project/counterparty/tags,
  auto_match_counterparty via existing matchCounterpartyByText (PR #4)
- API handlers: list/create/update/delete/toggle/move + apply + auto-match
- UI "Автоправила" tab in /finance/settings with drag-reorder + apply button
- Bank import integration: auto-categorize new transactions via rules
- Micro-feature: "Дата угоди відрізняється" toggle in OperationModal
  to decouple accrued_at from paid_at

Rules apply in sort_order; stop_on_match blocks subsequent rules.
All existing operations can be retroactively matched via "Apply to existing" button.
```

## 11. Після цього PR

**PR #8** — Календар платежів з прогнозом cash-gap. Середній розмір (L).
