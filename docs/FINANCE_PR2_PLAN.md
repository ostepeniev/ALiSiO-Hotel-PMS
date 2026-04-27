# PR #2 — Категорії з ієрархією (Finmap migration)

**Мета:** довідник категорій доходів/витрат з двохрівневою ієрархією (корінь → підкатегорія), повноцінною сторінкою редагування у Налаштуваннях, і працездатними зв'язками зі старими таблицями `expenses`/`income`.

## 1. Початковий стан (що вже є)

Існуюча таблиця [`expense_categories`](src/lib/db.ts#L1308) — 19 seed-категорій:

| id | name | std_group | pnl_line |
|---|---|---|---|
| `ec_accommodation`/`ec_sauna`/`ec_restaurant`/`ec_breakfast`/`ec_other_rev` | доходи | Revenue | … |
| `ec_food`/`ec_products`/`ec_variable` | COGS | COGS | … |
| `ec_rent`/`ec_utilities`/`ec_payroll`/`ec_marketing`/`ec_professional`/`ec_other_exp`/`ec_consumables` | OPEX | OPEX | … |
| `ec_taxes` | Taxes | |
| `ec_capex` | CAPEX (Стройка) | |
| `ec_investors` | Financing | |
| `ec_transfer` | Transfer | |

**Проблеми з поточною моделлю** (для роботи в Finmap-стилі):
- Ім'я `expense_categories` вводить в оману — тут і доходи, і витрати, і трансфери. Не перейменовуємо (багато посилань), лишаємо як є, але додаємо логічний `op_type`.
- `std_group` змішує доходи/витрати і класифікатор. Для P&L у Finmap-стилі потрібен окремий класифікатор: `cogs | variable | operational | capex | tax | financing | other`.
- Нема `parent_id` для ієрархії.

## 2. Зміни в схемі

### 2.1 ALTER TABLE `expense_categories`

SQLite нормально тягне `ALTER TABLE ADD COLUMN`, **не потребує rebuild** (це не CHECK-зміна). Ідемпотентно через `PRAGMA table_info`:

```sql
ALTER TABLE expense_categories ADD COLUMN parent_id TEXT REFERENCES expense_categories(id);
ALTER TABLE expense_categories ADD COLUMN op_type TEXT;   -- 'income' | 'expense' | 'transfer'
ALTER TABLE expense_categories ADD COLUMN classifier TEXT; -- 'cogs'|'variable'|'operational'|'capex'|'tax'|'financing'|'other'
CREATE INDEX IF NOT EXISTS idx_ec_parent ON expense_categories(parent_id);
```

### 2.2 Backfill існуючих категорій

Після додавання колонок — одноразовий UPDATE на seed-категоріях:

```sql
-- Доходи
UPDATE expense_categories SET op_type='income',   classifier='other'       WHERE std_group='Revenue';
-- COGS
UPDATE expense_categories SET op_type='expense',  classifier='cogs'        WHERE std_group='COGS';
-- OPEX — за замовчуванням operational, змінні окремо
UPDATE expense_categories SET op_type='expense',  classifier='operational' WHERE std_group='OPEX';
UPDATE expense_categories SET classifier='variable' WHERE id='ec_variable';
-- Taxes
UPDATE expense_categories SET op_type='expense',  classifier='tax'         WHERE std_group='Taxes';
-- CAPEX
UPDATE expense_categories SET op_type='expense',  classifier='capex'       WHERE std_group='CAPEX';
-- Financing / Transfer
UPDATE expense_categories SET op_type='income',   classifier='financing'   WHERE id='ec_investors';
UPDATE expense_categories SET op_type='transfer', classifier='other'       WHERE id='ec_transfer';
```

Все це виконується у `runMigrations()` в блоці, захищеному `PRAGMA table_info` перевіркою — виконається рівно один раз.

### 2.3 CHECK-constraints ми НЕ додаємо

SQLite не дає ALTER CHECK, а rebuild всієї таблиці через таке ламає занадто багато FK-посилань (з `expenses`, `cost_allocations`). Валідуємо `op_type`/`classifier` у handler-рівні.

## 3. Публічне API модуля (handler-рівень)

Оновлюємо [`expense-categories.handlers.ts`](src/modules/finance/api/expense-categories.handlers.ts):

```ts
listCategories(request)                  // ?op_type=income|expense|transfer, ?tree=1
getCategoryTree(request)                 // повертає nested structure {roots, children}
createCategory(request)                  // {name, op_type, classifier, parent_id?, color?, icon?, sort_order?}
updateCategory(request)                  // часткове оновлення
archiveCategory(request)                 // PATCH is_active=0
deleteCategory(request, ctx)             // тільки якщо немає прив'язаних операцій і немає дітей
moveCategory(request)                    // змінити parent_id або sort_order (drag-and-drop)
```

**Валідаційні правила:**
- Підкатегорія успадковує `op_type` і `classifier` від батька (handler сам копіює при створенні).
- `parent_id` може вказувати лише на корінь (не можна створити 3-й рівень — перевіряємо `parent.parent_id IS NULL`).
- При зміні `parent_id` перевіряємо:
  - новий батько має той самий `op_type`
  - новий батько сам є коренем
- При `delete`: відмова якщо є діти, відмова якщо є зв'язані `expenses`/`income`/`payments` (рахуємо через кількість). Покажемо кількість у помилці (формат як у `deleteAccount`).

### Старий `listExpenseCategories` і `createExpenseCategory` — не ламаємо

У [`api/index.ts`](src/modules/finance/api/index.ts) вони експортовані. Інші частини коду (видимо, UI витрат) їх використовують. Рішення:
- `listExpenseCategories` → робить `SELECT ... WHERE op_type='expense' OR op_type IS NULL` (для backcompat). Тобто повертає і доходи-категорії також (поки). Залишаємо на час міграції; PR, який переписує експенси, почистить.
- Нові `listCategories`, `getCategoryTree`, ... — додаються поруч, export'яться окремо.

## 4. API routes

Оновлені/нові:

```
src/app/api/finance/categories/route.ts              -- GET listCategories, POST createCategory
src/app/api/finance/categories/tree/route.ts         -- GET getCategoryTree
src/app/api/finance/categories/[id]/route.ts         -- GET, PATCH updateCategory, DELETE
src/app/api/finance/categories/[id]/archive/route.ts -- PATCH archiveCategory
src/app/api/finance/categories/[id]/move/route.ts    -- PATCH moveCategory
```

Старий `src/app/api/finance/expense-categories/route.ts` — лишаємо як є (бо старий UI ще вживає).

## 5. UI — таб «Категорії» у `/finance/settings`

В [`page.tsx`](src/app/(dashboard)/finance/settings/page.tsx) робимо цей таб активним (знімаємо `enabled: false`) і додаємо імпорт нового компонента.

### 5.1 `CategoriesTab.tsx` — головний компонент

Структура:
- Два великі таб-перемикачі зверху: «Доходи» / «Витрати» (вибір `op_type`)
- Пошук
- Кнопка «+ Додати категорію» (створює корінь)
- Нижче — дерево:

```
🏠 Проживання                     [Revenue] [other]            + підкатегорія  ✏️  🗄️
   └─ airBnb                                                              ✏️  🗄️  🗑
   └─ Booking.com                                                         ✏️  🗄️  🗑
🧖 Сауна                          [Revenue] [other]            + підкатегорія  ✏️  🗄️
...
```

Колонки по рядку:
- Іконка + назва (drag-handle ліворуч для drag-and-drop reorder)
- Бейджи: `op_type` (Revenue/Expense/Transfer) + `classifier`
- Dropdown `+ підкатегорія` видимий тільки у корінь-рядка
- Дії: `Редагувати`, `Архівувати`/`Відновити`, `Видалити` (тільки для підкатегорії або для кореня без дітей)

Підкатегорії згортаються/розгортаються акордеоном. За замовчуванням — розгорнуті.

### 5.2 `CategoryModal.tsx` — форма create/edit

Поля:
- Назва (обов'язк.)
- Іконка (emoji-picker або вільний ввід)
- Колір (палітра з 12 кольорів)
- Тип операції (radio: Дохід/Витрата/Переказ) — **тільки для кореня**, для підкатегорії disabled (успадковано)
- Класифікатор (select: Собівартість (COGS) / Змінні / Операційні / Капекс / Податки / Фінансові / Інше) — **тільки для кореня**, disabled для підкатегорії
- Порядок сортування (number)

Якщо редагується підкатегорія — поля `op_type` і `classifier` disabled з підказкою «Успадковується від ‹ім'я батька›».

### 5.3 Drag-and-drop

Для drag-to-reorder — без зовнішніх бібліотек (не хочемо додавати dnd-kit заради одного екрану). Використовуємо нативний HTML5 drag API:
- `draggable={true}` на рядку
- `onDragOver`/`onDrop` обробники обчислюють нову позицію і викликають `moveCategory({id, parent_id, sort_order})`
- Візуальний фідбек — dashed border на target

Drop тільки всередині тієї самої секції (Доходи → Доходи; Витрати → Витрати). Заборона drop кореня під іншим коренем (ми не хочемо 3-й рівень).

## 6. Файли до створення / зміни

### Створюються

- `src/modules/finance/api/categories.handlers.ts` — новий файл (~250 LoC) з `listCategories`, `getCategoryTree`, `createCategory`, `updateCategory`, `archiveCategory`, `deleteCategory`, `moveCategory`, валідацією, підрахунком зв'язків
- `src/app/api/finance/categories/route.ts` — нові (~5 LoC кожен)
- `src/app/api/finance/categories/tree/route.ts`
- `src/app/api/finance/categories/[id]/route.ts`
- `src/app/api/finance/categories/[id]/archive/route.ts`
- `src/app/api/finance/categories/[id]/move/route.ts`
- `src/app/(dashboard)/finance/settings/_components/CategoriesTab.tsx` (~250 LoC)
- `src/app/(dashboard)/finance/settings/_components/CategoryModal.tsx` (~150 LoC)
- `src/app/(dashboard)/finance/settings/_components/CategoryTreeRow.tsx` (~100 LoC — один рядок дерева з drag-support; винесено для читабельності)

### Змінюються

- `src/lib/db.ts` — блок міграції `ALTER TABLE expense_categories ADD COLUMN parent_id, op_type, classifier` + backfill (~40 LoC)
- `src/modules/finance/api/index.ts` — додати експорти нових хендлерів (~5 рядків)
- `src/app/(dashboard)/finance/settings/page.tsx` — зняти `enabled: false` з таб «Категорії», додати імпорт
- `src/modules/finance/README.md` — оновити секцію API

**Разом:** ~950 LoC. L-розмір, як і PR #1.

## 7. Що НЕ робимо

- Не чіпаємо інші модулі (`expenses.handlers.ts`, `income.handlers.ts` — вони продовжують працювати на тих самих категоріях)
- Не видаляємо `expense-categories.handlers.ts` — він ще використовується старим UI
- Не вводимо нові CHECK-constraints (відкладено до PR #6 коли переписуємо expenses → fin_operations)
- Не робимо міграцію даних — backfill так, міграцію моделей ні

## 8. Тест-план

1. Dev server → міграція `ALTER TABLE` + backfill виконується 1 раз, логи «Backfilled expense_categories op_type/classifier»
2. Повторний запуск dev — міграція ігнорується (`op_type` вже є → не виконується)
3. `GET /api/finance/categories` → 19 seed-категорій усі з `op_type` і `classifier`
4. `GET /api/finance/categories/tree` → структура з 3 групами (income/expense/transfer), кожен корінь має `children:[]`
5. `POST /api/finance/categories` — створити корінь «Проживання», успіх
6. `POST /api/finance/categories` з `parent_id=‹корінь›` — створити підкатегорію «airBnb», успіх, `op_type`/`classifier` скопійовано
7. `POST` з `parent_id=‹sub›` (3-й рівень) → 400 «Підкатегорію не можна створити всередині іншої підкатегорії»
8. `PATCH .../move` — змінити parent_id → OK
9. `DELETE ‹корінь з дітьми›` → 409 «Маєте 2 підкатегорії…»
10. `DELETE ‹підкатегорія з 0 операцій›` → 200
11. `DELETE ‹корінь використовується в X expenses›` → 409 з лічильником
12. `archiveCategory` — ставить `is_active=0`, в списку не показується (без `?archived=1`)
13. UI: `/finance/settings` → вкладка «Категорії» активна → три таби Дохід/Витрата/Переказ → дерево render'иться
14. Створення підкатегорії через UI: відкрити батька, клік «+ підкатегорія», ввести назву, зберегти → з'являється вкладеним
15. Drag підкатегорії на іншого батька → перестрибує
16. Drag підкатегорії на рівень кореня → drop відхиляється (visual feedback)
17. `/finance` старий дашборд — все як було, не зламалось
18. `/finance/expenses` — створення витрати: dropdown категорій працює як і раніше
19. `npx tsc --noEmit` — нуль помилок

## 9. Ризики

| Ризик | Мітигація |
|---|---|
| Старий UI вітрат (`/finance/expenses`) очікує старий формат `expense_categories` | Старі хендлери (`listExpenseCategories`) не чіпаємо — вертають повні категорії як і раніше + тепер ще й з новими полями. Не ламає. |
| `alloc_method`/`include_in_pnl`/`std_group` лишаються у таблиці — дублюють концепти | Поки лишаємо (використовуються старим UI + звітами). У PR #6 (fin_operations) — прибираємо. |
| Якщо користувач створить категорію з `parent_id` до категорії іншого `op_type` — некоректні звіти | Валідація у handler: `parent.op_type === child.op_type` обов'язкова перевірка |
| Нові колонки NULL у старих категоріях якщо backfill не виконався | Backfill обгорнутий в try-catch з логом, ідемпотентний |

## 10. Коміт

Один PR, один комміт:

```
feat(finance): add category hierarchy + classifier (PR #2 of Finmap migration)

- Extend expense_categories with parent_id, op_type, classifier columns
- Backfill existing 19 seed categories with proper op_type/classifier
- New handlers: listCategories, getCategoryTree, createCategory,
  updateCategory, archiveCategory, deleteCategory, moveCategory
- Activate "Категорії" tab in /finance/settings with tree UI
- HTML5 native drag-and-drop (no new dependencies)
- Old expense-categories.handlers untouched — backward compatible
```

## 11. Після цього PR

Переходимо до **PR #3** — переназва `business_units` → `fin_projects` з доданою ієрархією. Це торкнеться багатьох модулів (`expenses`, `capex`, `cost_allocations`, `reports`) — потребує обережного VIEW-аліасу. Окремий план.
