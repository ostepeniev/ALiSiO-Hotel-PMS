# PR #4 — Контрагенти з ієрархією + aliases (Finmap migration)

**Мета:** повноцінний довідник контрагентів (Клієнти/Постачальники/Співробітники/Інше) з 2-рівневою ієрархією та списком синонімів (`aliases_json`) для майбутнього авто-матчингу з банк-коментарів.

## 1. Початковий стан

У поточній схемі **немає** таблиці контрагентів. Існуючі `expenses` і `income` мають колонку `counterparty TEXT` — вільний текст. У `bank_transactions` є `matched_counterparty TEXT` — теж вільний текст.

**Це означає:** нічого не поламається від створення нової таблиці — жоден існуючий модуль на неї не посилається.

**Стратегія:** створюємо нову таблицю `finance_counterparties` з нуля, ні з чим не зв'язуємо у PR #4. Лінк з операціями (`counterparty_id`) додаємо у PR #6, де переписуємо expenses/income → fin_operations. Авто-матчинг з aliases — у PR #11.

## 2. Схема

```sql
CREATE TABLE IF NOT EXISTS finance_counterparties (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES finance_counterparties(id),
  kind TEXT,                               -- 'client' | 'supplier' | 'employee' | 'other' | NULL
  note TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]', -- JSON array of substrings, case-insensitive
  icon TEXT,
  color TEXT DEFAULT '#6b7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cp_org ON finance_counterparties(organization_id);
CREATE INDEX IF NOT EXISTS idx_cp_parent ON finance_counterparties(parent_id);
```

**Поле `aliases_json`** — TEXT з JSON-масивом рядків `["FACEBK", "META", "FACEBOOK"]`. Валідація на handler-рівні: парсимо JSON, перевіряємо що це масив рядків, нормалізуємо (upper-case, trim, dedupe).

**Чому JSON у SQLite, а не окрема таблиця?** Синоніми — «атрибут» контрагента, не «сутність». Окрема таблиця `counterparty_aliases` дала би normal form, але вимагала би JOIN-ів при кожному пошуку і ускладнила б UI. JSON у TEXT — стандартний патерн для «масив властивостей» у SQLite.

**`kind`** — опційний, бо у вашому реальному експорті більшість контрагентів не розкласифіковані. Нехай буде NULL-safe.

**`icon`, `color`** — як у Категорій, для візуального розрізнення.

## 3. Публічне API

Новий файл `src/modules/finance/api/counterparties.handlers.ts`:

```ts
listCounterparties(request)            // ?kind=, ?archived=1, ?search=
getCounterpartyTree(request)           // {tree, byKind}
createCounterparty(request)            // {name, parent_id?, kind?, aliases?, icon?, color?}
updateCounterparty(request, ctx)
archiveCounterparty(request, ctx)      // каскадом на дітей
deleteCounterparty(request, ctx)       // 409 якщо є діти (не перевіряємо operations — ще немає FK)
moveCounterparty(request, ctx)
matchCounterpartyByText(request)       // POST {text} → {counterparty_id?, matched_alias?}
```

**`matchCounterpartyByText`** — корисний для PR #11 (автоправила), але додаю зараз. Бере рядок (напр. банк-коментар), нормалізує (upper-case), шукає чи якийсь контрагент має alias, що є підрядком цього рядка. Longest-match перемагає.

**Валідації (як у PR #2/#3):**
- 2 рівні максимум
- Підконтрагент успадковує `kind` від батька (у handler при create)
- Move: новий батько має бути коренем, match `kind`
- `aliases_json`: масив з ≤50 елементів, кожен ≤100 chars
- Delete protection: тільки on children (no operations link yet)

## 4. API routes

```
src/app/api/finance/counterparties/route.ts              -- GET list, POST create
src/app/api/finance/counterparties/tree/route.ts         -- GET tree
src/app/api/finance/counterparties/match/route.ts        -- POST matchByText
src/app/api/finance/counterparties/[id]/route.ts         -- PATCH update, DELETE
src/app/api/finance/counterparties/[id]/archive/route.ts -- PATCH archive
src/app/api/finance/counterparties/[id]/move/route.ts    -- PATCH move
```

## 5. UI — вкладка «Контрагенти»

У [`settings/page.tsx`](src/app/(dashboard)/finance/settings/page.tsx) знімаю `enabled: false` з `counterparties`.

### 5.1 `CounterpartiesTab.tsx`

Структура:
- Пошук + фільтр за типом (Клієнти/Постачальники/Співробітники/Інше/Усі)
- `+ Додати контрагента`
- Деревоподібний список з `CounterpartyTreeRow`

### 5.2 `CounterpartyModal.tsx` — найцікавіший компонент

Поля:
- Назва
- Тип (`kind`) — select: Клієнт / Постачальник / Співробітник / Інше / Не вказано — disabled для підконтрагенту
- **Синоніми (aliases)** — chip-input:
  - Показує chips з поточними синонімами
  - Поле вводу для нового, додається по Enter або кнопці «+»
  - Клік по X на chip видаляє
  - Помічник: якщо користувач редагує контрагента з пустими aliases, показуємо 3-5 «підказок» з найбільш частих `counterparty` полів у існуючих `expenses`/`income` (кнопка «+ додати як синонім»)
- Іконка, Колір (як у інших)
- Нотатка (textarea)

### 5.3 `CounterpartyTreeRow.tsx`

Копія патерну з `ProjectTreeRow.tsx`, з бейджами:
- `kind` (Клієнт/Постачальник/...)
- Кількість синонімів (напр. «3 синоніми»)

## 6. Файли

### Створюються

- `src/modules/finance/api/counterparties.handlers.ts` (~320 LoC — найбільший handler бо додається matchByText)
- `src/app/api/finance/counterparties/route.ts`
- `src/app/api/finance/counterparties/tree/route.ts`
- `src/app/api/finance/counterparties/match/route.ts`
- `src/app/api/finance/counterparties/[id]/route.ts`
- `src/app/api/finance/counterparties/[id]/archive/route.ts`
- `src/app/api/finance/counterparties/[id]/move/route.ts`
- `src/app/(dashboard)/finance/settings/_components/CounterpartiesTab.tsx` (~230 LoC)
- `src/app/(dashboard)/finance/settings/_components/CounterpartyModal.tsx` (~200 LoC — з chip-input)
- `src/app/(dashboard)/finance/settings/_components/CounterpartyTreeRow.tsx` (~120 LoC)

### Змінюються

- `src/lib/db.ts` — нова таблиця + 2 індекси (~20 LoC)
- `src/modules/finance/api/index.ts` — експорти
- `src/app/(dashboard)/finance/settings/page.tsx` — активація + імпорт
- `src/modules/finance/README.md`

**Разом:** ~950 LoC. L-розмір.

## 7. Сценарії тестування

**Backward compat:** нульовий — нічого існуюче не чіпаємо.

**CRUD:**

1. Створити контрагента «Booking» з `kind='client'`, `aliases=["BOOKING.COM", "BOOKING"]`
2. Створити підконтрагента «Booking → Direct» → успадковує `kind='client'`
3. Створити з `aliases=[]` — OK
4. POST з `aliases` де 51 елемент — 400
5. 3-й рівень — 400
6. DELETE з дитиною — 409
7. DELETE без дітей — 200

**matchByText:**

8. `POST /match {text: "HAVEL ALES; Karavan a 2 lidi"}` — якщо немає контрагента з alias що підрядок → `{counterparty_id: null}`
9. Створити контрагента «Havel Ales» з alias `"HAVEL ALES"` → same request → `{counterparty_id: <id>, matched_alias: "HAVEL ALES"}`
10. Longest-match: створити ще «Havel» з alias `"HAVEL"`. Той самий запит → виграє «Havel Ales» (alias довший)
11. Case-insensitive: alias `"HAVEL"` матчиться на «havel ales ...»

**UI:**

12. Вкладка «Контрагенти» активна, показує пустий стан
13. Створити першого → з'являється
14. Chip-input: додавання alias через Enter, видалення через клік X
15. Drag sub між різними root'ами
16. `tsc --noEmit` на нових файлах — нуль помилок

## 8. Ризики

| Ризик | Мітигація |
|---|---|
| Новий `matchByText` може бути повільним на великих обсягах (Full table scan + substring match) | Для MVP прийнятно — max кілька сотень контрагентів. SQLite `LIKE` + JS-фільтр в handler. Якщо стане повільно — додамо FTS індекс у майбутньому. |
| `aliases_json` може містити не-JSON сміття через ручний import | Парсимо з try/catch у handler — повертаємо пустий масив при parse error + логи попередження |
| UI chip-input без бібліотеки — може бути кривим на mobile | Нативний input + split by Enter + візуальний список — достатньо для desktop MVP. Mobile — у PR #15+. |
| Якщо користувач створить контрагента з aliases, що вже використовуються в іншого контрагента — буде конфлікт | Не забороняємо на рівні DB. У `matchByText` буде longest-match + sort_order — детермінований результат. Якщо конфлікт — user побачить у UI і вирішить сам. |

## 9. Питання перед стартом

1. **`kind` опції** — я вибрав 4: `client | supplier | employee | other`. Ок?
2. **«Підказки» синонімів з існуючих expenses/income** — у PR#4 реалізуємо чи відкладаємо на PR #11 (автоматчинг)? Якщо відкладаємо — модалка простіша (~150 LoC).
3. **`matchCounterpartyByText` ендпоінт** — додаємо зараз чи у PR #11? Я за «зараз», бо код маленький (~30 LoC) і дозволяє перевірити aliases одразу після створення. Ок?

## 10. Коміт-повідомлення

```
feat(finance): add counterparties with aliases (PR #4 of Finmap migration)

- New table finance_counterparties with 2-level hierarchy (parent_id)
- aliases_json TEXT column (JSON array) for counterparty auto-matching
- Subcounterparty inherits kind from parent
- New handlers: listCounterparties, getCounterpartyTree, createCounterparty,
  updateCounterparty, archiveCounterparty, deleteCounterparty,
  moveCounterparty, matchCounterpartyByText
- "Контрагенти" tab in /finance/settings with tree UI + chip-input for aliases
- No existing tables touched — pure additive PR
```

## 11. Після цього PR

PR #5 — **Теги** — найменший PR. Плоска таблиця `finance_tags` + many-to-many через `fin_operation_tags`. Але сам zv'язок до операцій — у PR #6 (fin_operations). У PR #5 просто таблиця + CRUD + UI.
