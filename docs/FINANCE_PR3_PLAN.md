# PR #3 — Проєкти з ієрархією (Finmap migration)

**Мета:** дати користувачу Finmap-стиль редагування «Проєктів» (створення/видалення/ієрархія) у `/finance/settings`, не ламаючи жодного існуючого модуля.

## 1. Стратегія «нульового ризику»

**Рішення — НЕ перейменовуємо таблицю.** `business_units` залишається як є. У новому API і UI користувач бачить терміни «Проєкт» / «Проєкти» (саме так вони називаються у Finmap), але у БД-схемі нічого не перейменовуємо.

**Чому так:**
- 6 таблиць мають FK на `business_units` (`expenses`, `cost_allocations`, `capex_items`, `accruals`, `bank_transactions`, `income`)
- 13 SQL-запитів у 8 handler-файлах читають/JOIN-ять `business_units`
- Форми витрат/CapEx використовують `/api/finance/business-units`
- Rename або VIEW-аліас додають ризик поламати щось з цього без реальної користі

**Що натомість:** одна `ALTER TABLE ADD COLUMN parent_id` — і все. Старий код не бачить нової колонки, новий UI додає ієрархію поверх.

## 2. Зміни в схемі

Один ADD COLUMN, ідемпотентно через `PRAGMA table_info`:

```sql
ALTER TABLE business_units ADD COLUMN parent_id TEXT REFERENCES business_units(id);
CREATE INDEX IF NOT EXISTS idx_bu_parent ON business_units(parent_id);
```

Існуючі колонки вже покривають все решту:
- `is_active` (для архівації — NULL-safe defaults вже є)
- `sort_order` (для порядку)
- `created_at`, `name`, `organization_id`, `unit_type`, `is_shared` — лишаються

**Backfill не потрібен** — усі 8 seed-рядків просто лишаються з `parent_id=NULL` (коренями).

## 3. Публічне API модуля

Новий файл `src/modules/finance/api/projects.handlers.ts` — **не чіпаємо** існуючий `business-units.handlers.ts`.

```ts
listProjects(request)             // ?archived=1 — без фільтра по is_active=1
getProjectTree(request)           // {tree, roots, children mapping}
createProject(request)            // {name, parent_id?, is_shared?, color? (немає поля, опустимо)}
updateProject(request, ctx)       // часткове оновлення
archiveProject(request, ctx)      // PATCH is_active=0 + каскад на дітей
deleteProject(request, ctx)       // 409 якщо є діти АБО є зв'язані рядки у 6 FK-таблицях
moveProject(request, ctx)         // parent_id + sort_order (drag-and-drop)
```

**Валідації** — ідентичні до `categories.handlers.ts`:
- Максимум 2 рівні (корінь → дитина; 3-й рівень заборонений)
- Видалення: рахує дітей + рахує `COUNT(*)` з 6 таблиць через `UNION` або окремі SELECT'и; 409 з детальним текстом
- Переміщення: `parent` має бути кореневим, не собою, не собою через транзитивність (3-й рівень заборонено)

**Важливо — `is_shared` лишаємо.** Існуючий код (`reports.handlers.ts:66`) групує breakdown «по не-shared BU». Ми зберігаємо це поле у новому API як опціональне. Для Finmap-концепту «Проєкт» `is_shared` — це просто «спільний проєкт» (напр. HQ).

## 4. API routes

Нові файли:

```
src/app/api/finance/projects/route.ts              -- GET listProjects, POST createProject
src/app/api/finance/projects/tree/route.ts         -- GET getProjectTree
src/app/api/finance/projects/[id]/route.ts         -- PATCH updateProject, DELETE deleteProject
src/app/api/finance/projects/[id]/archive/route.ts -- PATCH archiveProject
src/app/api/finance/projects/[id]/move/route.ts    -- PATCH moveProject
```

Старий `src/app/api/finance/business-units/route.ts` лишається як є.

## 5. UI — активація вкладки «Проєкти»

У [`settings/page.tsx`](src/app/(dashboard)/finance/settings/page.tsx) прапор `enabled: false` → `true` для `projects`.

### 5.1 `ProjectsTab.tsx`

Структура та сама як `CategoriesTab.tsx`, але **простіша**:
- Немає таб-перемикачів (Дохід/Витрата/Переказ) — бо проєкти не мають `op_type`
- Лише пошук + кнопка `+ Додати проєкт`
- Деревовидний список з 2-рівневою ієрархією
- Можливість вказати `is_shared` (checkbox «Спільний — розподіляється на усі»)

### 5.2 `ProjectModal.tsx`

Поля:
- Назва (обов'язк.)
- Іконка (та сама палітра що й в категорій)
- Колір (та сама палітра)
- Чекбокс «Це спільний/HQ проєкт» (для кореня, disabled для підпроєкта)
- Порядок сортування

### 5.3 `ProjectTreeRow.tsx`

Копія `CategoryTreeRow.tsx` з мінімальними змінами:
- Без бейджів `op_type`/`classifier`
- Можливий бейдж «Спільний» для `is_shared=1`

### 5.4 Drag-and-drop

Та сама логіка, що в `CategoriesTab`. Навіть простіше, бо немає `op_type`-барєрів — можна drag будь-де в межах проєктів.

## 6. Файли до створення / зміни

### Створюються

- `src/modules/finance/api/projects.handlers.ts` (~280 LoC)
- `src/app/api/finance/projects/route.ts`
- `src/app/api/finance/projects/tree/route.ts`
- `src/app/api/finance/projects/[id]/route.ts`
- `src/app/api/finance/projects/[id]/archive/route.ts`
- `src/app/api/finance/projects/[id]/move/route.ts`
- `src/app/(dashboard)/finance/settings/_components/ProjectsTab.tsx` (~200 LoC)
- `src/app/(dashboard)/finance/settings/_components/ProjectModal.tsx` (~130 LoC)
- `src/app/(dashboard)/finance/settings/_components/ProjectTreeRow.tsx` (~120 LoC)

### Змінюються

- `src/lib/db.ts` — один ADD COLUMN + індекс, ідемпотентно (~15 LoC)
- `src/modules/finance/api/index.ts` — нові експорти (~5 рядків)
- `src/app/(dashboard)/finance/settings/page.tsx` — `enabled: true` для `projects` + імпорт компонента
- `src/modules/finance/README.md` — оновити секцію API

**Разом:** ~800 LoC. M/L-розмір.

## 7. Що НЕ робимо

- **НЕ перейменовуємо таблицю.** Жодної зміни імені `business_units` → `fin_projects` ні у БД, ні в існуючих queries.
- Не чіпаємо `business-units.handlers.ts` (старий API) — він продовжує працювати для форм витрат, capex, дашборду, тощо.
- Не чіпаємо жодну з 6 FK-таблиць.
- Не перетворюємо `is_shared` на `classifier` — лишаємо як є.
- Не мігруємо seed — усі 8 seed-рядків лишаються з `parent_id=NULL` автоматично.

## 8. Тест-план

**Перевірки сумісності (найважливіші):**

1. Запускаємо dev → міграція `ALTER TABLE ADD COLUMN parent_id` виконується 1 раз, лог «Added parent_id to business_units»
2. Повторний запуск — міграція ігнорується
3. `/api/finance/business-units` (старий API) → повертає 8 проєктів як раніше, без поля `parent_id` поки клієнт не просить
4. `/finance/expenses` — форма створення витрати: dropdown `business_unit_id` заповнюється, create/save працює
5. `/finance/capex` — те саме
6. `/finance` (дашборд, breakdown по BU у `reports.handlers.ts:66`) — показує те саме що й до міграції
7. `/api/finance/overview?month=...` — структура не змінилась

**Перевірки нового API:**

8. `GET /api/finance/projects/tree` → 8 коренів, 0 дітей
9. `POST /api/finance/projects` → створити «Тестовий проєкт», з'являється
10. `POST /api/finance/projects` з `parent_id=bu_glamping` → створити підпроєкт
11. `POST` з `parent_id=‹sub›` (3-й рівень) → 400 з українським текстом
12. `PATCH .../move` → OK, `sort_order` змінюється
13. `DELETE ‹корінь з дітьми›` → 409 «Маєте N підпроєктів»
14. `DELETE ‹проєкт з expenses›` → 409 «Використовується у N операціях»
15. `DELETE ‹порожній підпроєкт›` → 200
16. `archiveProject` — каскад на дітей

**Перевірки UI:**

17. `/finance/settings` → вкладка «Проєкти» активна → 8 пунктів у дереві
18. Створення через UI: модалка відкривається, зберігається
19. Drag підпроєкта на іншого кореня → працює
20. `tsc --noEmit` на нових файлах — нуль помилок

## 9. Ризики

| Ризик | Мітигація |
|---|---|
| Якась query-ка у старому коді select'ить `SELECT *` і раптово отримає колонку `parent_id` — може зламати мапінг у TS | Всі виявлені queries роблять `SELECT *` але мапять через `any`-casting. Нова колонка буде ігнорована. Безпечно. |
| `cost_allocations` має FK на `business_units(id)` з `ON DELETE` не вказано — cascade?| Немає CASCADE (перевірено в схемі) — `DELETE business_unit` з існуючими allocations впаде на FK-constraint. Наш delete-protection перевіряє всі 6 таблиць першим, тож ми просто повернемо 409 раніше. OK. |
| Архівація проєкту (`is_active=0`) з каскадом на дітей — чи не заламає `/api/finance/business-units` який фільтрує `is_active = 1`? | Ні, навпаки — заархівований проєкт просто зникне з dropdown'ів, як і очікується |
| Якщо користувач створить підпроєкт у seed `bu_glamping`, потім видалить `bu_glamping` через старий SQL — FK на дитину впаде | Старий код не має delete-операцій над `business_units` взагалі (тільки soft-delete через `is_active`). Безпечно. |
| Drag-and-drop вимагає refresh tree після move — якщо failed, стан розходиться | `handleMove` у UI робить `fetchTree()` після успіху, `alert()` при помилці |

## 10. Коміт-повідомлення

```
feat(finance): add project hierarchy (PR #3 of Finmap migration)

- Add parent_id column to business_units (idempotent ALTER TABLE)
- New handlers: listProjects, getProjectTree, createProject,
  updateProject, archiveProject, deleteProject, moveProject
- Activate "Проєкти" tab in /finance/settings with tree UI
- Delete protection: refuses if children exist OR linked to any of
  6 tables (expenses, cost_allocations, capex_items, accruals,
  bank_transactions, income)
- Archive cascades to children
- Old /api/finance/business-units handler untouched — full backward compat
- No table renames, no FK changes, no data migrations
```

## 11. Після цього PR

PR #4 — **Контрагенти** — нова таблиця `finance_counterparties` (НЕ існує), 2-рівнева ієрархія, `aliases_json` для автоматчингу. Найсмачніший PR — після нього маємо всі 4 довідники для операцій (рахунки, категорії, проєкти, контрагенти). Тоді PR #5 — теги, і PR #6 — найбільший: переписуємо `expenses`/`income`/`transfers` у уніфіковану `fin_operations`.

---

## Відкриті питання

1. **`is_shared` — залишаємо як є чи перейменовуємо?** Я за «лишити як є» (нульовий ризик). У UI підписуємо як «Спільний (розподіляється)». Ок?

2. **Чекбокс «спільний» для підпроєкта?** Пропоную: disabled, успадковується від кореня. Ок?

3. **В майбутньому (PR #6)** ми замінюємо `business_unit_id` у `fin_operations` на `project_id` (той самий рядок). Але зараз — ніяких замін. Погоджуєтесь з відкладанням перейменування до того часу коли буде реальна потреба?
