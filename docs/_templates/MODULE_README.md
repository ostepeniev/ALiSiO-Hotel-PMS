# [Module Name] Module

> Замініть цей рядок на 1-2 речення про призначення модуля.

## Публічне API

Всі публічні функції та типи знаходяться в `api/index.ts`. Імпортуй тільки звідти:

```ts
import { createXxx, getXxx, type XxxType } from '@xxx'
```

| Функція / Тип | Опис |
|---|---|
| `functionName(input)` | Що робить |
| `type TypeName` | Що описує |

## Залежності

**Модулі** (через публічний API):
- `@guests` — навіщо використовується
- `@core/db` — підключення до БД
- `@core/event-bus` — підписка/емісія подій

**Shared**:
- `@shared/types` — базові типи (DateRange, Money, тощо)
- `@shared/utils` — утиліти

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `module.action_done` | `{ id: string }` | Опис тригера |

**Слухає** (`events/subscribed.ts`):
| Подія | Що робить |
|---|---|
| `other.event` | Що відбувається у відповідь |

## Схема даних

**Таблиці:** `table_name`, `other_table`

```sql
-- Головна таблиця модуля
CREATE TABLE table_name (
  id TEXT PRIMARY KEY,
  ...
);
```

## Структура файлів

```
module-name/
  api/
    index.ts          ← єдина точка експорту (ТІЛЬКИ звідси імпортувати ззовні)
    handlers.ts       ← HTTP-обгортки для Next.js route handlers
  domain/
    types.ts          ← TypeScript типи та інтерфейси
    [entity].ts       ← бізнес-логіка
  data/
    [entity].repo.ts  ← SQL-запити, better-sqlite3
  events/
    published.ts      ← типи подій, що емітить цей модуль
    subscribed.ts     ← підписка на події інших модулів
  ui/
    [Component].tsx   ← React компоненти (сторінки, форми)
  __tests__/
    [entity].test.ts
  README.md           ← цей файл
```

## Точки розширення

- Додати нову X → `domain/[entity].ts`
- Новий тип Y → `domain/types.ts` + оновити `api/index.ts`
- Нова подія → додати в `events/published.ts` + в `src/core/event-bus/registry.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
