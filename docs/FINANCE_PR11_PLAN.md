# PR #11 — Bank Inbox: IMAP-приймач виписок KB

Автоматичне приймання щоденних виписок KB → парсинг XML/CSV → імпорт у `bank_transactions` → застосування auto-rules (з PR #7).

## Архітектура

```
KB Mojebanka → email → o.stepeniev@gmail.com (Gmail Workspace)
                              ↓
                      IMAP poller (раз на 15 хв)
                              ↓
                      Filter sender == kb.cz
                              ↓
                      Extract XML/CSV attachment
                              ↓
                      Parse → bank_transactions rows
                              ↓
                      Apply auto-rules → fin_operations (auto-categorized)
                              ↓
                      Mark email as seen (UID tracking)
```

## Схема

```sql
CREATE TABLE IF NOT EXISTS fin_bank_inboxes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- IMAP connection (password encrypted with app secret key)
  imap_host TEXT NOT NULL,            -- e.g., 'imap.gmail.com'
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_user TEXT NOT NULL,            -- 'o.stepeniev@gmail.com'
  imap_password_encrypted TEXT NOT NULL,
  imap_folder TEXT NOT NULL DEFAULT 'INBOX',
  use_tls INTEGER NOT NULL DEFAULT 1,

  -- Mapping & filtering
  account_id TEXT REFERENCES finance_accounts(id),  -- which finance account these statements belong to
  sender_filter TEXT,                 -- e.g., 'noreply@kb.cz' or '@kb.cz' for substring
  subject_filter TEXT,                -- optional, e.g., 'Výpis z účtu'
  attachment_format TEXT NOT NULL DEFAULT 'auto',  -- 'xml' | 'csv' | 'auto'

  -- State
  last_uid INTEGER,                   -- highest IMAP UID processed
  last_synced_at TEXT,
  last_error TEXT,
  last_email_at TEXT,                 -- timestamp of last received email
  emails_processed INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inbox_org ON fin_bank_inboxes(organization_id);
CREATE INDEX IF NOT EXISTS idx_inbox_active ON fin_bank_inboxes(is_active, last_synced_at);
```

**Шифрування паролів:** використаємо AES-256-GCM з ключем у `BANK_INBOX_SECRET` env-змінній. Якщо змінної немає — fallback на base64 + warning у лог (для dev).

## Залежності (npm)

- `imapflow` — сучасний IMAP-клієнт для Node
- `mailparser` — розбір MIME (для extract attachments)
- `xml2js` — парсинг CAMT.053 XML

```bash
npm install imapflow mailparser xml2js
npm install --save-dev @types/xml2js
```

## Engine — `src/modules/finance/data/bank-inbox-engine.ts`

```ts
encryptPassword(plain: string): string
decryptPassword(encrypted: string): string

async checkInbox(inbox: BankInbox): Promise<{ newEmails: number; imported: number; errors: string[] }>
// 1. Connect to IMAP via imapflow
// 2. Search UIDs > last_uid AND From contains sender_filter
// 3. For each email:
//    a. parseEmail(raw) → extract attachments
//    b. find KB statement attachment (xml/csv)
//    c. parseKbStatement(attachment) → array of bank_transactions
//    d. INSERT INTO bank_transactions (with statement_id grouping)
//    e. apply active auto-rules → create fin_operations
// 4. Update inbox.last_uid, last_synced_at, emails_processed

parseKbXmlStatement(xmlContent: string, accountId: string, statementId: string): TransactionInput[]
// Parse CAMT.053 XML, extract:
//   - Stmt > Acct (account number)
//   - Stmt > Bal (opening, closing balances)
//   - Stmt > Ntry > NtryDtls > TxDtls (each transaction)
//   - For each: amount, currency, date, counterparty, description, reference

parseKbCsvStatement(csvContent: string, accountId: string, statementId: string): TransactionInput[]
// KB CSV: ;-separated, header row "Datum;Popis;Částka;Měna;..."

async runBankInboxTickIfDue(db): boolean
// Same pattern as recurring-tick: rate-limit 15min via fin_system_state key 'last_bank_inbox_tick'
// Iterate active inboxes, call checkInbox for each
```

## Handlers — `src/modules/finance/api/bank-inbox.handlers.ts`

```ts
listBankInboxes(req)            // returns inboxes (without password)
createBankInbox(req)            // accepts plain password, encrypts before save
updateBankInbox(req, ctx)       // optional password rotation
deleteBankInbox(req, ctx)
toggleBankInbox(req, ctx)
testBankInbox(req)              // try IMAP login, report success/error
runBankInboxNow(req, ctx)       // trigger checkInbox immediately (bypass rate limit)
```

## API routes (6)

```
/api/finance/bank-inboxes/route.ts                 -- GET list, POST create
/api/finance/bank-inboxes/[id]/route.ts            -- PATCH, DELETE
/api/finance/bank-inboxes/[id]/toggle/route.ts     -- PATCH
/api/finance/bank-inboxes/[id]/test/route.ts       -- POST (test IMAP connection)
/api/finance/bank-inboxes/[id]/run-now/route.ts    -- POST (trigger immediate check)
/api/finance/bank-inboxes/run/route.ts             -- POST (run all due)
```

## Cron integration

Хук в `getDb()` поряд з `runRecurringTickIfDue` (PR #8): додаю `runBankInboxTickIfDue(db)` з 15-хв rate limit.

## UI

Нова вкладка «Банк-приймач» у `/finance/settings`:
- Список налаштованих ящиків
- Кнопка «+ Додати ящик»
- Модалка create/edit:
  - **IMAP credentials:** host, port, user, password (write-only field), folder, TLS
  - **Прив'язка:** account (dropdown finance accounts)
  - **Фільтри:** sender (default `noreply@kb.cz`), subject (optional), attachment format
  - **Кнопка «Тест підключення»** — викликає testBankInbox
  - Toggle is_active
- Status display: last_synced_at, last_email_at, emails_processed, last_error (red if error)
- Кнопка «Запустити зараз» (run-now) на кожному рядку
- Кнопка «Прогнати всі активні» вгорі

## Setup інструкція (для вас, перед першим тестом)

### A) Згенерувати Gmail App Password

1. Зайдіть в https://myaccount.google.com/security
2. Якщо 2-Step Verification ще НЕ увімкнена — **увімкніть її** (KB не має значення, це потрібно для App Password)
3. Зайдіть в https://myaccount.google.com/apppasswords
4. Створіть password з назвою «ALiSiO PMS Bank Sync»
5. Скопіюйте 16-значний код (без пробілів)

### B) Перевірити IMAP-доступ Gmail
- За замовчуванням **увімкнений** для всіх Gmail-аккаунтів
- Якщо ваша пошта на Google Workspace — адмін домену може бути вимкнув IMAP. Перевірте у Google Admin → Apps → Gmail → End User Access → IMAP

### C) Параметри для додавання ящика в нашій UI

| Поле | Значення |
|---|---|
| IMAP host | `imap.gmail.com` |
| IMAP port | `993` |
| TLS | вкл |
| User | `o.stepeniev@gmail.com` |
| Password | згенерований App Password (16 символів) |
| Folder | `INBOX` |
| Sender filter | `noreply@kb.cz` (підкоригую після першого email) |
| Account | оберіть рахунок KB Krony / KB Euro |
| Format | XML (якщо ви обрали XML у KB) |

### D) Що зробити прямо зараз
- Згенеруйте App Password (крок А) — і прийшліть мені для тесту, або введете самі коли UI буде готовий
- Перешліть мені перший email від KB у форматі **.eml** або хоча б скрін заголовків (From/Subject) + content-type/назва attachment — щоб я підкоригував sender_filter і парсер під реальні поля

## Безпека

- Пароль шифрується AES-256-GCM
- В UI поле password — `type=password`, в API ніколи не повертається (тільки маска `***`)
- TLS обов'язково (`imaps://`)
- Rate-limit на `testBankInbox` (макс 5 спроб за хвилину) щоб не дозволити brute-force
- Тільки server-side доступ до пароля

## Файли

### Створюються
- `src/modules/finance/data/bank-inbox-engine.ts` (~400 LoC, з парсерами)
- `src/modules/finance/api/bank-inbox.handlers.ts` (~250 LoC)
- 6 API routes (~25 LoC)
- `src/app/(dashboard)/finance/settings/_components/BankInboxesTab.tsx` (~200 LoC)
- `src/app/(dashboard)/finance/settings/_components/BankInboxModal.tsx` (~250 LoC)

### Змінюються
- `src/lib/db.ts` — нова таблиця (~25 LoC)
- `src/modules/finance/api/index.ts` — експорти
- `src/app/(dashboard)/finance/settings/page.tsx` — нова вкладка
- `package.json` — 3 нові deps

**Разом:** ~1500 LoC + 3 npm-пакети.

## Тест-план

1. Add inbox → test connection → success
2. Forward sample KB email manually → trigger run-now → see new bank_transactions
3. Auto-rules apply: створюються fin_operations з category/project/counterparty (за aliases)
4. Повторний email same UID — пропускається
5. Bad password → error message in UI
6. /finance/operations показує імпортовані операції з source='bank_import'
7. Cron-tick спрацьовує раз на 15 хв

## Питання

1. **Зашифрований пароль** — використовуємо `BANK_INBOX_SECRET` env-змінну. Чи у вас є існуюча схема для таких секретів, чи я генерую нову? Якщо нової немає — згенерую випадковий ключ і додам у документ після коміту.
2. **Sender filter** — після першого реального KB email уточнимо. Поки default `noreply@kb.cz` (загальноприйнято). Можу почати з нього.
3. **Multi-account** — у вас 2 рахунки в KB (Krony + EUR). Кожен надсилає окремий email на ту саму адресу? Чи лише один наразі налаштований?

Після ваших відповідей на 1–3 — стартую імплементацію.
