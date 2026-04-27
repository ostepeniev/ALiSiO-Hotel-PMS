# PR #5 — Теги (Finmap migration)

Найкоротший PR у ланцюжку довідників. Плоска таблиця тегів, CRUD + UI.

## Рішення

1. **Плоска таблиця** — теги cross-cutting, без `parent_id`
2. **UNIQUE на `(organization_id, LOWER(name))`** — case-insensitive унікальність
3. **Колір + назва** (без іконки, без `kind` — теги прості чіпи)
4. **Без seed-даних** — користувач створює свої
5. **Junction-table `fin_operation_tags`** відкладено на PR #6 — там же, де створюються `fin_operations`

## Схема

```sql
CREATE TABLE IF NOT EXISTS finance_tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_org_name ON finance_tags(organization_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tags_org ON finance_tags(organization_id);
```

## API

```ts
listTags(request)          // ?archived=1
createTag(request)         // {name, color?, sort_order?}
updateTag(request, ctx)
archiveTag(request, ctx)
deleteTag(request, ctx)    // завжди OK поки немає operations-зв'язків
```

## Routes

```
src/app/api/finance/tags/route.ts              -- GET, POST
src/app/api/finance/tags/[id]/route.ts         -- PATCH, DELETE
src/app/api/finance/tags/[id]/archive/route.ts -- PATCH
```

## UI

- `TagsTab.tsx` — проста таблиця (без дерева, без drag)
- `TagModal.tsx` — ім'я + колір
- Активуємо вкладку «Теги» у `/finance/settings`

## Обсяг

~400 LoC. S-розмір. Коміт одним блоком.
