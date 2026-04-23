import { getDb } from '@core/db';

const VALID_TYPES = ['glamping', 'resort', 'camping'] as const;
export type CategoryTypeValue = typeof VALID_TYPES[number];

export function listCategories() {
  return getDb().prepare(`
    SELECT
      c.id, c.name, c.type, c.icon, c.color, c.sort_order,
      COUNT(u.id) as unit_count
    FROM categories c
    LEFT JOIN units u ON u.category_id = c.id AND u.is_active = 1
    GROUP BY c.id
    ORDER BY c.sort_order
  `).all();
}

export interface CreateCategoryInput {
  property_id: string;
  name: string;
  type: CategoryTypeValue;
  description?: string;
  sort_order?: number;
  icon?: string;
  color?: string;
}

export function validateCategoryType(type: string): type is CategoryTypeValue {
  return VALID_TYPES.includes(type as CategoryTypeValue);
}

export function createCategory(input: CreateCategoryInput) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO categories (property_id, name, type, description, sort_order, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.property_id, input.name, input.type, input.description ?? null, input.sort_order ?? 0, input.icon ?? null, input.color ?? null);
  return db.prepare('SELECT * FROM categories WHERE rowid = ?').get(result.lastInsertRowid);
}

export function updateCategory(id: string, fields: Record<string, unknown>) {
  const db = getDb();
  const allowed = ['name', 'type', 'description', 'sort_order', 'icon', 'color'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(fields[field]);
    }
  }

  if (updates.length === 0) return null;

  values.push(id);
  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function deleteCategory(id: string): { ok: boolean; error?: string } {
  const db = getDb();
  const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE category_id = ?').get(id) as { cnt: number };
  if (unitCount.cnt > 0) {
    return { ok: false, error: `Cannot delete: ${unitCount.cnt} units belong to this category. Delete units first.` };
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { ok: true };
}
