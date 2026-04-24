# Finance Module — Finmap-style Rewrite

Тех-завдання на перебудову `src/modules/finance/` за зразком Finmap.online, з урахуванням **реального** використання (аналіз експорту `ExportUK (2).xlsx`, 428 операцій Jan–Apr 2026).

## 1. Скоуп MVP

### In scope
- Рахунки (multi-currency CZK + EUR + інші, з залишками, курси конвертації)
- Операції трьох типів: дохід, витрата, переказ (переказ між різними валютами = авто-конвертація)
- Довідники з **ієрархією** (батько/дитина, 2 рівні): категорії, підкатегорії, проєкти, підпроєкти, контрагенти, підконтрагенти
- Теги — cross-cutting мітки (many-to-many до операцій)
- Дата платежу vs дата нарахування (роздільні)
- Звіти: CashFlow, P&L, Баланс, Виписка за рахунком, План/Факт, Фінансові показники, Історія дій, Проєкти
- Календар платежів (заплановані операції)
- Автоправила (auto-rules) — з **авто-витягом контрагента** з коментаря/назви магазину
- Імпорт банк-виписки (KB XML, загальний XLSX)
- Сторінка «Налаштування» — CRUD усіх довідників з підтримкою ієрархії
- Експорт XLS у форматі як у Finmap (сумісний з їхнім імпортом для zero-lock-in)
- Валютна звірка залишків

### Out of scope (MVP — винесено у Фазу 2)
- **Жива банк-інтеграція (KB API, Revolut API)** — після того, як MVP стабілізується
- Дебіторка / Кредиторка (користувач закреслив на скріні)
- AI-агенти, крипта, рахунки-фактури (товари/склад), Telegram-бот, мобільний додаток
- Гранулярні RBAC-права per-operation (доступ per-page — у MVP, per-operation — Фаза 2)

---

## 2. Модель даних (SQLite)

Усі нові таблиці — у `src/lib/db.ts`. Існуючі `payments/income/expenses/transfers` **ПЕРЕПИСУЮТЬСЯ** в одну уніфіковану таблицю `fin_operations` з міграцією даних.

### 2.1 Рахунки

```sql
CREATE TABLE fin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                      -- "КВ Kemp Крони", "Антон наличные"
  currency TEXT NOT NULL,                  -- 'CZK', 'EUR', 'USD'
  kind TEXT NOT NULL,                      -- 'cash' | 'bank' | 'card' | 'investment'
  opening_balance REAL NOT NULL DEFAULT 0, -- стартовий залишок
  opening_balance_date TEXT,               -- ISO date
  icon TEXT,                               -- emoji/icon код
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Залишок рахунку рахується як `opening_balance + SUM(ops)` на льоту (view або функція).

### 2.2 Категорії (з підкатегоріями)

```sql
CREATE TABLE fin_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES fin_categories(id),   -- NULL = корінь, інакше — підкатегорія
  op_type TEXT NOT NULL,      -- 'income' | 'expense' (успадковується від батька)
  classifier TEXT,            -- 'cogs' | 'variable' | 'operational' | 'capex' | 'tax'
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (parent_id IS NULL OR parent_id != id)
);
CREATE INDEX idx_cat_parent ON fin_categories(parent_id);
```

**Правила ієрархії:**
- Максимум 2 рівні (корінь → підкатегорія). У підкатегорії `parent_id` не може вказувати на іншу підкатегорію.
- `op_type` і `classifier` підкатегорії повинні збігатись з батьком (у UI недоступні для зміни — успадковуються).
- У звітах P&L операції агрегуються по підкатегорії → сумуються в батька. У Cashflow — опц. збортка/розгортка.

### 2.3 Проєкти (з підпроєктами)

```sql
CREATE TABLE fin_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                       -- "Глемпинг", "Ресторан", "Сауна"
  parent_id INTEGER REFERENCES fin_projects(id),
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (parent_id IS NULL OR parent_id != id)
);
CREATE INDEX idx_proj_parent ON fin_projects(parent_id);
```

### 2.4 Контрагенти (з підконтрагентами)

```sql
CREATE TABLE fin_counterparties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES fin_counterparties(id),
  kind TEXT,                                -- 'client' | 'supplier' | 'employee' | 'other' | NULL
  note TEXT,
  aliases_json TEXT,                        -- JSON-array синонімів для автоматчингу ["facebk", "facebook", "meta"]
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (parent_id IS NULL OR parent_id != id)
);
CREATE INDEX idx_cp_parent ON fin_counterparties(parent_id);
```

**`aliases_json`** — критичне поле для автоматизації. Коли банк пише `FACEBK *3DPP58ZJ72`, `Banking Circle Denma`, `IRENA HIKLOVÁ` — автоправила матчать цей рядок проти `name + aliases_json`. Найпростіше — case-insensitive substring match.

### 2.5 Теги

```sql
CREATE TABLE fin_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fin_operation_tags (
  operation_id INTEGER NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES fin_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (operation_id, tag_id)
);
```

Теги — cross-cutting (напр. «Терміново», «Одноразове», «Компенсується», «На перегляд»). Операція може мати 0..N тегів.

### 2.6 Операції (серце модуля)

```sql
CREATE TABLE fin_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op_type TEXT NOT NULL,                   -- 'income' | 'expense' | 'transfer'

  -- Рахунки
  account_from_id INTEGER REFERENCES fin_accounts(id),   -- для expense і transfer
  account_to_id INTEGER REFERENCES fin_accounts(id),     -- для income і transfer

  -- Суми (multi-currency)
  amount REAL NOT NULL,                    -- у валюті account_from (для expense/transfer) або account_to (для income)
  currency TEXT NOT NULL,                  -- валюта поля amount
  amount_to REAL,                          -- для переказу між різними валютами: сума в валюті account_to
  currency_to TEXT,                        -- валюта amount_to (NULL якщо переказ в одній валюті)
  fx_rate REAL,                            -- курс на момент операції (amount_to / amount) — для аудиту
  amount_company REAL NOT NULL,            -- у валюті компанії (CZK) — для агрегації у звітах

  -- Дати
  paid_at TEXT NOT NULL,                   -- дата платежу (коли гроші рухнули)
  accrued_at TEXT NOT NULL,                -- дата нарахування (=paid_at якщо не змінено)
  period_from TEXT,                        -- період нарахування для P&L (напр. оренда за місяць)
  period_to TEXT,

  -- Аналітичні розрізи
  category_id INTEGER REFERENCES fin_categories(id),     -- null для transfer
  project_id INTEGER REFERENCES fin_projects(id),
  counterparty_id INTEGER REFERENCES fin_counterparties(id),

  -- Метадані
  comment TEXT,
  is_planned INTEGER NOT NULL DEFAULT 0,   -- 1 якщо дата в майбутньому або явно план
  source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'bank_import' | 'recurring' | 'booking_widget'
  source_ref TEXT,                         -- ID банк-транзакції / booking ID
  recurring_template_id INTEGER REFERENCES fin_recurring_templates(id),

  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ops_paid_at ON fin_operations(paid_at);
CREATE INDEX idx_ops_accrued_at ON fin_operations(accrued_at);
CREATE INDEX idx_ops_account_from ON fin_operations(account_from_id);
CREATE INDEX idx_ops_account_to ON fin_operations(account_to_id);
CREATE INDEX idx_ops_category ON fin_operations(category_id);
CREATE INDEX idx_ops_project ON fin_operations(project_id);
```

### 2.6 Прикріплення

```sql
CREATE TABLE fin_operation_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2.7 Регулярні операції (шаблони)

```sql
CREATE TABLE fin_recurring_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  op_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  account_from_id INTEGER,
  account_to_id INTEGER,
  category_id INTEGER,
  project_id INTEGER,
  counterparty_id INTEGER,
  comment TEXT,

  schedule TEXT NOT NULL,                  -- 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron:...'
  next_run_at TEXT NOT NULL,
  end_at TEXT,                             -- опц. — коли перестати
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Крон-тік (раз на добу) матеріалізує всі `next_run_at <= today` в `fin_operations` і зсуває `next_run_at`.

### 2.8 Автоправила

```sql
CREATE TABLE fin_auto_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  op_type TEXT NOT NULL,                   -- 'income' | 'expense' | 'any'

  conditions_json TEXT NOT NULL,           -- JSON: [{field, op, value}, ...]  (логіка AND)
  actions_json TEXT NOT NULL,              -- JSON: {category_id, subcategory_id, project_id, counterparty_id, tag_ids[], ...}

  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,    -- порядок — перше правило, що спрацювало, виграє
  stop_on_match INTEGER NOT NULL DEFAULT 0, -- якщо 1 — далі правила не перевіряються
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Поля-умови:** `comment`, `amount`, `amount_company`, `account_from_id`, `account_to_id`, `currency`, `counterparty_id`.
**Оператори:** `contains` (case-insensitive), `not_contains`, `equals`, `starts_with`, `ends_with`, `regex`, `>`, `<`, `between`, `in`.
**Дії:** встановити `category_id`, `subcategory_id`, `project_id`, `counterparty_id`, додати `tag_ids[]`, перезаписати `comment` (опц.).

**Auto-counterparty extraction (ключова фіча):**

Окремий «псевдо-action» = `auto_match_counterparty: true`. Коли спрацьовує, движок робить:
1. Бере `comment` операції, нормалізує (upper-case, видаляє цифри/спецсимволи).
2. Для кожного `fin_counterparties` будує пошуковий набір: `name + aliases_json`.
3. Знаходить перший контрагент, чий якийсь alias є підрядком коментаря (longest-match — якщо «Irena» і «Irena Hiklova», виграє довший).
4. Якщо знайдено — встановлює `counterparty_id`. Якщо ні — лишає null і додає тег «⚠️ Без контрагента» (опц.).

Можна викликати без правила — окремою кнопкою «Автоматчинг контрагентів» на сторінці операцій (прогоняє весь existing set).

**Застосування:**
- Автоматично **під час імпорту** банк-виписки (до запису в БД).
- Автоматично при створенні операції з `source='bank_import'`.
- Вручну: кнопка «Застосувати правила» (по фільтру або до вибраних рядків).

**Лог спрацьовувань** (для дебагу):

```sql
CREATE TABLE fin_auto_rule_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES fin_auto_rules(id) ON DELETE CASCADE,
  operation_id INTEGER NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
  matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Дозволяє на UI показати «це правило спрацювало 47 разів за останній місяць».

### 2.9 Бюджети (План/Факт)

```sql
CREATE TABLE fin_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,                  -- 1..12
  category_id INTEGER REFERENCES fin_categories(id),
  project_id INTEGER REFERENCES fin_projects(id),
  planned_amount REAL NOT NULL,            -- у валюті компанії
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year, month, category_id, project_id)
);
```

### 2.10 Фіксовані курси валют

```sql
CREATE TABLE fin_exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  effective_from TEXT NOT NULL,            -- ISO date
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_currency, to_currency, effective_from)
);
```

### 2.11 Аудит

Використовуємо існуючий `log.handlers.ts` + додаємо таблицю:

```sql
CREATE TABLE fin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,              -- 'operation' | 'account' | 'category' | ...
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,                    -- 'create' | 'update' | 'delete'
  diff_json TEXT,                          -- before/after
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Публічний API модуля

`src/modules/finance/api/index.ts` експортує:

```ts
// Рахунки
listAccounts(), createAccount(), updateAccount(), archiveAccount(), getAccountBalance()

// Операції
listOperations(filters), getOperation(id), createOperation(input),
  updateOperation(id, input), deleteOperation(id), duplicateOperation(id)

// Довідники (усі повертають ієрархію: root items + children)
listCategories(op_type?), getCategoryTree(), createCategory(input:{parent_id?, ...}),
  updateCategory(), archiveCategory(), moveCategory(id, newParentId)
listProjects(), getProjectTree(), createProject(input:{parent_id?, ...}),
  updateProject(), archiveProject(), moveProject(id, newParentId)
listCounterparties(), getCounterpartyTree(), createCounterparty(input:{parent_id?, aliases?, ...}),
  updateCounterparty(), archiveCounterparty(), matchCounterpartyByText(text)
listTags(), createTag(), updateTag(), archiveTag()
addTagsToOperation(opId, tagIds[]), removeTagsFromOperation(opId, tagIds[])

// Регулярки
listRecurringTemplates(), createRecurringTemplate(), updateRecurringTemplate(),
  deactivateRecurringTemplate(), runRecurringTick() // для крона

// Автоправила
listAutoRules(), createAutoRule(), updateAutoRule(), deleteAutoRule(),
  applyRulesToImportedOps(opIds[]), applyRulesRetroactively(filter),
  autoMatchCounterparties(filter)   // прогнати alias-матчинг без створення правила

// Бюджети
getBudgets(year, month), upsertBudget(), deleteBudget()

// Курси
listExchangeRates(), upsertExchangeRate()

// Звіти
getCashflowReport(filters)            // {period, account, project, category}
getPnlReport(filters)                 // basis=paid|accrued
getBalanceReport(date)
getAccountStatement(accountId, range)
getPlanVsFactReport(year, month, by:'category'|'project')
getFinancialIndicators(range)         // Gross, Marginal, Margin%, EBITDA
getProjectProfitability(range)
getPaymentCalendar(month)             // заплановані + попередження про cash gap
getAuditLog(filters)

// Імпорт / експорт
importBankStatement(file, accountId, format: 'kb-xml'|'generic-xlsx')
exportOperationsXlsx(filters)
```

---

## 4. UI — сторінки й компоненти

Структура URL (Next.js App Router):

```
/finance                       → /finance/operations (редирект)
/finance/operations            → список платежів (головна)
/finance/analytics             → сітка звітів (10 карток)
/finance/analytics/cashflow
/finance/analytics/pnl
/finance/analytics/balance
/finance/analytics/statement/[accountId]
/finance/analytics/plan-fact
/finance/analytics/indicators
/finance/analytics/projects
/finance/analytics/audit
/finance/calendar              → календар платежів
/finance/auto-rules            → список + CRUD автоправил
/finance/settings              → CRUD усіх довідників
/finance/settings/accounts
/finance/settings/categories
/finance/settings/projects
/finance/settings/counterparties
/finance/settings/exchange-rates
/finance/settings/users        → RBAC (пізніше)
```

### 4.1 Хедер модуля (sticky)

- Зліва: «Всього на рахунках» (сума у валюті компанії) + згорнутий список рахунків з залишками
- По центру: три кнопки `+ Дохід` / `− Витрата` / `⇄ Переказ` → відкривають модалки
- Справа: індикатор «Ефективність» (4/5), пошук, фільтри

### 4.2 Модалки додавання операції

Поля точно як у Фінмап (див. ваші скріни):

**Дохід:** На рахунок, Сума + валюта, Категорія, Контрагент, Дата надходження, тогл «Дата угоди відрізняється», тогл «Зробити повторюваним», Проєкт, Коментар, файл.

**Витрата:** З рахунку + решта аналогічно.

**Переказ:** Дата, З рахунку, На рахунок, Сума, Проєкт, Коментар, файл. Категорія не потрібна.

Кнопка «Додати і створити схожий» — зберегти і відкрити копію з тими ж полями (прискорює масовий ввід).

### 4.3 Список операцій

Таблиця з колонками: **☐ | Дата | Сума | Рахунок/залишок | Контрагент | Категорія | Проєкт | Коментар**.

Фічі:
- Сортування по будь-якій колонці
- Фільтр (бокова шторка): період, рахунок, валюта, категорія, проєкт, контрагент, тип, сума від/до, статус (запланована/фактична)
- Швидкий пошук по коментарю/контрагенту
- Групова операція: вибір ☐☐☐ → змінити категорію/проєкт у всіх, видалити
- Інлайн-редагування категорії/проєкту прямо з таблиці (як у Фінмап — клік на «Вказати»)
- Кнопки угорі: AI import (пізніше), Звірка залишків, Експорт XLS, Імпорт XLS

### 4.4 Сторінка звітів

10 карток (без Дебіторки/Кредиторки — ви закреслили):
1. Гроші / Cash Flow
2. P&L
3. Виписка за рахунком
4. Проєкти
5. Історія дій
6. Баланс
7. План/Факт
8. Фінансові показники (EBITDA, Gross, Margin)
9. Календар платежів
10. Автоправила (перевикористання — або прибираємо)

### 4.5 Cashflow і P&L — глибокий drill-down

Ваш коментар: «зручний P&L дизайн і глибокий drill-down».

**Cashflow (матриця категорія × місяць):**

Структура рядків:
1. `+ Надходження` (expandable)
   - Категорія 1 (expandable → підкатегорії)
     - Підкатегорія A
     - Підкатегорія B
   - Категорія 2
   - ...
   - `Σ Надходження`
2. `− Видатки` (expandable аналогічно)
   - `Σ Видатки`
3. `= Чистий потік` (зелений/червоний)
4. `⇄ Перекази` (нейтральні, не впливають на потік)
5. `Залишок на початок` / `Залишок на кінець`

Колонки: кожен місяць періоду + `Разом` + `Середнє/міс`.

**Drill-down на 4 рівні** (клік розкриває вниз):
1. Клік на будь-яке число в матриці → модалка зі списком операцій, що сформували число
2. Клік на рядок категорії → фіксує фільтр `category_id` і переходить у `/finance/operations?category=X&period=Y`
3. Клік на місяць у хедері → фіксує період
4. Клік на операцію в модалці → відкриває повну картку операції (з можливістю редагування)

Переключники:
- «По факту (`paid_at`) / По нарахуванню (`accrued_at`)»
- Валюта перегляду: CZK / EUR / обидві колонкою
- Мультиселект: рахунки, проєкти, теги
- Група по: категорії / проєкти / контрагенти

**P&L:**

Рядки жорстко структуровані по класифікатору категорій (формули наводжу tooltip-ом біля кожного підсумку):

```text
  Виручка (усі доходи)                  850 000
  − COGS                               (120 000)
  ─────────────────────────────────────
  = Валовий прибуток (Gross)            730 000   86% margin
  − Змінні витрати                     (220 000)
  ─────────────────────────────────────
  = Маржинальний дохід                  510 000   60%
  − Операційні витрати                 (380 000)
  ─────────────────────────────────────
  = EBITDA                              130 000   15%
  − CapEx (амортизація/списання)        (40 000)
  − Податки                              (8 000)
  ─────────────────────────────────────
  = Чистий прибуток                      82 000   10%
```

Кожен рядок групи (COGS, Змінні, Операційні) expandable вниз на категорії → підкатегорії → операції (той самий 4-рівневий drill-down як у Cashflow).

Справа від кожного рядка — мініграфік sparkline за 12 місяців (щоб бачити тренд «без переходу на інший екран»).

Зверху обох звітів — великий графік: стовпчики доходи/витрати + лінія чистого потоку + лінія залишку на рахунках. Клік на стовпчик = drill-down у список операцій за цей місяць.

Усі звіти: експорт XLS/PDF, збереження view як «Мій звіт» (персональні налаштування).

### 4.6 Календар платежів

Місячна сітка. На кожній даті — кружечки-індикатори:
- 🟢 планований дохід
- 🔴 планована витрата
- ⚠️ cash gap (якщо прогноз залишку < 0)

Клік на день → список операцій + кнопка «+ Запланувати».

Справа — прогноз залишку по кожному рахунку на кожен день місяця (лінійний графік).

### 4.7 Автоправила

Список правил (як на вашому скріні). Модалка «Нове правило»:
- Ім'я
- Для якого типу (дохід/витрата)
- Блок «Умова» (можна додавати кілька, AND): поле → оператор → значення
- Блок «Обрати» (дії): встановити категорію / проєкт / контрагента
- Кнопка «Застосувати до існуючих» (опц.) — прогнати правило по вже імпортованих операціях

### 4.8 Налаштування

Одна сторінка з лівим меню-вкладками (як на скріні Фінмап): **Автоправила • Контрагенти • Рахунки • Категорії • Проєкти • Теги • Користувачі • Фіксовані курси валют**.

**Вкладка «Категорії»:**
- Два великі таби всередині: «Доходи» / «Витрати»
- Деревовидний список з двома рівнями (корінь → підкатегорії)
- Кнопка `+ Додати категорію` (корінь) біля заголовка
- На рядку батька — `+ Підкатегорія`, олівець (редагувати), кошик (архівувати)
- Поле «Класифікатор» видно тільки в корені; підкатегорії успадковують
- Drag-and-drop для зміни `parent_id` і `sort_order`

**Вкладка «Проєкти»:** аналогічно — двохрівневе дерево, drag-and-drop.

**Вкладка «Контрагенти»:** дерево + панель деталей справа з полями:
- Ім'я, тип (клієнт/постачальник/співробітник/інше)
- **Синоніми (aliases)** — chip-input, додаєш теги типу `FACEBK`, `META`, `FACEBOOK` — саме вони використовуються автоправилом для пошуку в коментарях
- Нотатка
- Лічильник «Операцій: 47» + кнопка «Показати»

**Вкладка «Теги»:** плоский список з кольором, `+ Додати`, inline edit.

**Вкладка «Рахунки»:** як у Фінмап — список з іконкою, валютою, назвою, поточним залишком; `+ Додати`. На деталях — стартовий залишок, тип (готівка/банк/картка/інвест), архівація.

**Вкладка «Фіксовані курси валют»:** таблиця `from → to | курс | діє з`. `+ Додати курс`. Показує поточний активний курс великим зверху.

**Вкладка «Автоправила»:** список правил як на скріні Фінмап, з лічильниками «спрацювало X разів».

**Вкладка «Користувачі»:** запрошення по email, роль (admin/accountant/viewer) — мінімальний RBAC у MVP.

На кожній вкладці: пошук, `+ Додати`, inline edit, archive (замість delete для сутностей з історією).

---

## 5. Інтеграція з рештою PMS (рішення по спірних моментах)

### 5.1 `business_units` → `fin_projects`

`business_units` у вашому PMS семантично = «Проєкти» у Фінмап (Глемпинг/Ресторан/Сауна). Рішення:
- **Не створюємо `fin_projects` окремо.** Додаємо колонки `parent_id`, `sort_order`, `is_archived` у існуючу `business_units`, перейменовуємо в `fin_projects` **через VIEW-аліас** на час переходу, фізично rename у міграції #6.
- Це уникає дублювання і зберігає посилання зі старих модулів (`bookings`, `reports`) у незмінному вигляді.

### 5.2 `capex_items`, `accruals`, `invoices` — зберігаємо окремо, але лінкуємо

Ваш коментар: «важливо щоб не поламали нічого попереденього». Рішення:
- **Таблиці залишаються як є** — їх логіка специфічна для PMS (основні засоби, нарахування, рахунки-фактури клієнтам) і не мапиться 1:1 у Фінмап-операцію.
- Додаємо **двосторонній лінк**: кожен `capex_item` / `accrual` / `invoice` при створенні генерує відповідний `fin_operations` запис:

```sql
ALTER TABLE capex_items ADD COLUMN fin_operation_id INTEGER REFERENCES fin_operations(id);
ALTER TABLE accruals ADD COLUMN fin_operation_id INTEGER REFERENCES fin_operations(id);
ALTER TABLE invoices ADD COLUMN fin_operation_id INTEGER REFERENCES fin_operations(id);

ALTER TABLE fin_operations ADD COLUMN source_entity_type TEXT;  -- 'capex' | 'accrual' | 'invoice' | NULL
ALTER TABLE fin_operations ADD COLUMN source_entity_id INTEGER;
```

- У `fin_operations` такі записи мають `source='capex'|'accrual'|'invoice'` і спец-класифікатор категорії. Вони видимі в CashFlow/P&L, але редагуються з оригінального екрану (CapEx/Нарахування) — у формі операції кнопка «Редагування недоступне → Відкрити у CapEx».
- Це дозволяє звітам працювати як треба, але **не ламає жодної існуючої функції**.

### 5.3 `@bookings` та `@payments`

- `@bookings` створює бронювання → при надходженні оплати emit `finance.payment_created` → хендлер робить `createOperation({op_type:'income', source:'booking_widget', source_ref:bookingId, counterparty_id: (Booking|airBnb|Direct), ...})`
- `@payments` (Teia) webhook → аналогічно, з `source='teia'`, `source_ref=transactionId`
- Автоматчинг контрагента працює і для них через alias-метод (якщо коментар від Booking містить «Booking.com» — знайдеться)

### 5.4 Валюта компанії = CZK, multi-currency обов'язковий

- Усі агрегації в звітах — у CZK (`amount_company`)
- Операції в EUR зберігають і оригінальну суму (`amount` + `currency='EUR'`), і CZK-еквівалент (за курсом на дату з `fin_exchange_rates`)
- Переказ між різними валютами використовує `amount`+`currency` (з рахунку) і `amount_to`+`currency_to` (на рахунок) — курс фіксується автоматично, користувач може вручну перевизначити
- Звірка залишків — кнопка на списку рахунків, показує поточний обчислений залишок vs. реальний (введений вручну) і пропонує скоригувальну операцію «Звірка»

---

## 6. Міграція даних

Три окремих скрипти в `scripts/finance-migration/`, кожен з `--dry-run` прапором і SQL-снапшотом перед виконанням.

### 6.1 `01-seed-from-finmap-export.ts`

Імпорт з `docs/ExportUK (2).xlsx` як bootstrap — щоб одразу мати повну історію за 4 місяці:
- Парсить 16-колонкову структуру експорту
- Створює `fin_accounts` з унікальних значень колонок «З рахунку» / «На рахунок»
- Створює `fin_categories` (корінь) з унікальних «Категорія», підкатегорії з «Підкатегорія»
- Створює `fin_projects` з унікальних «Проєкт», підпроєкти з «Підпроєкт»
- Створює `fin_counterparties` з унікальних «Контрагент», підконтрагентів з «Підконтрагент»
- Створює `fin_tags` з унікальних значень «Теги» (split по комі)
- Створює `fin_operations` для кожного рядка з правильним `op_type` (за наявністю from/to)
- Конвертує дати, курси (коли `amount != amount_company` — це EUR)

### 6.2 `02-merge-business-units.ts`

- `business_units` → `fin_projects` (rename таблиці + додавання `parent_id`, `sort_order`, `is_archived`)
- Створює VIEW `business_units AS SELECT * FROM fin_projects` на перехідний період
- Оновлює всі посилання на `business_units` у коді (автоматичний grep + sed → перевірка типів)

### 6.3 `03-link-legacy-entities.ts`

- Додає `fin_operation_id` у `capex_items`, `accruals`, `invoices`
- Для кожного існуючого запису CapEx/Accrual/Invoice генерує `fin_operations` з відповідним `source`
- Додає `source_entity_type`/`source_entity_id` у `fin_operations`

Усі три скрипти: `--dry-run` за замовчуванням, `--apply` для реального виконання. Перед `--apply` робить `sqlite3 .backup backup-YYYYMMDD.db`.

---

## 7. Розбивка на PR (маленькі ревертабельні комміти)

### Фаза 1 — MVP (PR #1–#16)

| # | PR | Розмір | Залежить від |
|---|---|---|---|
| 1 | `fin_accounts` + `fin_exchange_rates` — таблиці, CRUD, UI список рахунків, звірка | S | — |
| 2 | `fin_categories` з ієрархією (parent_id, classifier) + UI дерево в Налаштуваннях | M | 1 |
| 3 | `fin_projects` (rename з `business_units`, + ієрархія) + VIEW-аліас | M | 1 |
| 4 | `fin_counterparties` з ієрархією + `aliases_json` + UI з chip-input для синонімів | M | 1 |
| 5 | `fin_tags` + `fin_operation_tags` + UI вкладка «Теги» | S | 1 |
| 6 | `fin_operations` таблиця + `createOperation/updateOperation/deleteOperation` (усі 3 типи, multi-currency) | M | 2, 3, 4, 5 |
| 7 | Міграція #6.1 — seed з `ExportUK (2).xlsx` (dry-run + apply) | M | 6 |
| 8 | UI: список операцій з фільтрами, inline edit, масові дії, пошук | L | 6 |
| 9 | UI: модалки «Новий дохід / Витрата / Переказ / Додати схожий» | L | 6 |
| 10 | Міграція #6.2 + #6.3 — `business_units` rename + linkaging `capex/accruals/invoices` | M | 6, 7 |
| 11 | Автоправила CRUD + движок + **авто-матчинг контрагента по aliases** + лог спрацьовувань | L | 6 |
| 12 | Регулярні операції (шаблони) + крон-тік | M | 6 |
| 13 | Звіт Cashflow — матриця з 4-рівневим drill-down, 2 бази (paid/accrued) | L | 6 |
| 14 | Звіт P&L з формулами, sparkline, drill-down | L | 6 |
| 15 | Звіти Баланс + Виписка за рахунком + Історія дій (аудит) | M | 6 |
| 16 | План/Факт (`fin_budgets`) + Фінансові показники (EBITDA/Gross/Margin) | M | 14 |

### Фаза 2 — Розширення (PR #17+)

| # | PR | Розмір | Коли |
|---|---|---|---|
| 17 | Календар платежів із прогнозом cash gap | L | після MVP |
| 18 | Покращення імпорту банк-виписки (KB XML, generic XLSX, автоматчинг) | M | після MVP |
| 19 | Експорт у Finmap-сумісному форматі XLSX (zero-lock-in) | S | після MVP |
| 20 | **Жива інтеграція з банками (KB API, Revolut API)** — користувач просив «після того як все налаштуємо» | XL | після stabilization |
| 21 | RBAC per-operation + ролі (admin/accountant/viewer) | M | після MVP |
| 22 | AI-помічник: авто-пропозиції категорії/проєкту за коментарем (LLM) | L | останнім |

Кожен PR сам по собі деплоїться, не ламає попередні фічі, містить unit-тести для доменної логіки.

### Правила процесу (з `feedback_small_steps`)

- Перед кожним PR — план у чаті, узгодження, тільки потім код
- PR ≤ 400 LoC чистого коду (без міграцій/фікстур)
- Жоден PR не ламає жодної існуючої сторінки (`/bookings`, `/finance` старий, `/payments`) — фіче-флагом або паралельним живленням
- Старий код `finance/api/*` видаляється тільки після PR #10, і тільки якщо всі посилання переключені

---

## 8. Узгоджені рішення

| Питання | Рішення |
|---|---|
| Валюта компанії | **CZK.** Усі агрегати у звітах — CZK. EUR-операції зберігаються з курсом. |
| Теги, підкатегорії, підпроєкти, підконтрагенти | **Включені в MVP.** 2-рівнева ієрархія через `parent_id`, CRUD у Налаштуваннях. |
| `business_units` vs `fin_projects` | **Зливаємо** — `business_units` перейменовується в `fin_projects` + додаються `parent_id`/`is_archived`, VIEW-аліас на перехідний період. |
| `capex_items` / `accruals` / `invoices` | **Зберігаємо окремо**, додаємо двосторонній лінк до `fin_operations`. Звіти бачать їх, редагування — через оригінальні екрани. Нічого не ламається. |
| Автоматчинг контрагентів | **Критична фіча.** Через `aliases_json` у контрагентах + окрема кнопка «Автоматчинг» + авто при імпорті. |
| Жива банк-інтеграція | **Фаза 2** — після стабілізації MVP. Пріоритет після всіх MVP-PR. |
| RBAC | **Per-page у MVP** (admin/accountant/viewer), per-operation — Фаза 2. |
| Валютні курси | **Руками** через `fin_exchange_rates` + можливо ЧНБ API у Фазі 2. |

---

## Наступні кроки

1. Ви читаєте цей документ, я читаю ваші зауваження і коригую.
2. Коли узгоджене — я пишу **план PR #1** (`fin_accounts` + `fin_exchange_rates`) як окремий документ з переліком файлів, що створюються/змінюються, і тест-кейсами.
3. Стартуємо імплементацію. Один PR = один чат-тур, як ви любите.
