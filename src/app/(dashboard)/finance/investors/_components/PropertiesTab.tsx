'use client';

//
// "Об'єкти" admin tab — lists real units (= individual houses) tracked
// in the PMS, with a per-unit pencil to edit investor metadata
// (image, Airbnb URL, status, work_stages). The unit row itself
// (name/code/property) lives in the regular PMS settings — this tab
// only attaches investor-facing metadata.
//

import { useCallback, useEffect, useState } from 'react';
import { Edit, ExternalLink, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';

interface WorkStage {
  id?: string;
  name: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  weight: number;
  percentage: number;
  lastUpdated?: string;
}

interface UnitRow {
  id: string;                 // unit_id
  name: string;
  code: string;
  property_name: string;      // PMS property the unit belongs to
  is_active: number;
  location: string | null;
  image_url: string | null;
  airbnb_url: string | null;
  ical_url: string | null;
  status: 'project' | 'in_progress' | 'active' | 'paused';
  active_lots: number;
  total_invested: number;
  work_stages: WorkStage[];
}

const DEFAULT_STAGES: WorkStage[] = [
  { name: 'Construction', status: 'Not Started', weight: 40, percentage: 0 },
  { name: 'Renovation',   status: 'Not Started', weight: 30, percentage: 0 },
  { name: 'Interior',     status: 'Not Started', weight: 20, percentage: 0 },
  { name: 'Launch Prep',  status: 'Not Started', weight: 10, percentage: 0 },
];

const STATUS_OPTIONS: { value: UnitRow['status']; label: string; color: string }[] = [
  { value: 'project',     label: 'Project',     color: '#6366f1' },
  { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'active',      label: 'Active',      color: '#22c55e' },
  { value: 'paused',      label: 'Paused',      color: '#94a3b8' },
];

export default function PropertiesTab() {
  const [items, setItems] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<UnitRow> | null>(null);
  const [filter, setFilter] = useState<'all' | 'with_lots'>('with_lots');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/investor-units');
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.id) return;
    try {
      const body = {
        location: editing.location || null,
        image_url: editing.image_url || null,
        airbnb_url: editing.airbnb_url || null,
        ical_url: editing.ical_url || null,
        status: editing.status || 'active',
        work_stages: editing.work_stages || [],
      };
      const res = await fetch(`/api/finance/investor-units/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  function openEdit(u: UnitRow) {
    setEditing({
      ...u,
      work_stages: u.work_stages.length > 0 ? u.work_stages.map((s) => ({ ...s })) : DEFAULT_STAGES.map((s) => ({ ...s })),
    });
  }

  const visibleItems = filter === 'with_lots' ? items.filter((u) => u.active_lots > 0) : items;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
          Кожен будинок-юніт у вашому PMS може мати інвесторську мета-інформацію (фото, Airbnb URL, статус, work-stages).
          Самі юніти створюються у Settings → Units. Тут ви прикріплюєте дані для портал-сторінок інвестора.
        </p>
        <select style={input} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'with_lots')}>
          <option value="with_lots">Тільки з інвесторами</option>
          <option value="all">Усі юніти</option>
        </select>
      </div>

      {loading ? <div>Завантаження…</div> : visibleItems.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          {items.length === 0
            ? 'У PMS немає жодного юніта. Створіть юніти у Settings → Units.'
            : 'Жоден юніт не має активних інвестицій. Перемкніть на «Усі юніти» щоб побачити всі.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {visibleItems.map((u) => {
            const stat = STATUS_OPTIONS.find((s) => s.value === u.status) || STATUS_OPTIONS[2];
            const totalWeight = u.work_stages.reduce((sum, s) => sum + s.weight, 0);
            const overallPct = u.work_stages.length > 0 && totalWeight > 0
              ? Math.round(u.work_stages.reduce((sum, s) => sum + (s.weight * s.percentage / 100), 0) / totalWeight * 100)
              : 0;
            return (
              <div key={u.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {u.image_url ? (
                    <img src={u.image_url} alt={u.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                      <span style={{ fontSize: 10, padding: '2px 8px', background: `${stat.color}22`, color: stat.color, borderRadius: 999, fontWeight: 600 }}>{stat.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {u.property_name} · {u.code}
                    </div>
                    {u.location && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📍 {u.location}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Інвесторів: <b>{u.active_lots}</b> · Інвестовано: <b>{u.total_invested.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })}</b>
                    </div>
                  </div>
                </div>

                {u.work_stages.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Прогрес реалізації</span>
                      <span>{overallPct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${overallPct}%`, background: overallPct >= 99 ? '#16a34a' : '#22c55e' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(u)} style={btn} title="Редагувати інвесторську мета-інформацію"><Edit size={13} /> Редагувати</button>
                  {u.airbnb_url && (
                    <a href={u.airbnb_url} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}><ExternalLink size={13} /> Airbnb</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 4 }}>Редагувати юніт</h3>
            <p style={{ margin: 0, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
              <b>{editing.name}</b> ({editing.code}) у <b>{editing.property_name}</b>
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 2 }}>
                <Field label="Локація (текстом, для відображення)"><input style={input} value={editing.location || ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} placeholder="QA Glamping" /></Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Статус">
                  <select style={input} value={editing.status || 'active'} onChange={(e) => setEditing({ ...editing, status: e.target.value as UnitRow['status'] })}>
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <Field label="URL зображення (right-click → Copy Image Address на Airbnb)">
              <input style={input} value={editing.image_url || ''} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://a0.muscache.com/..." />
            </Field>
            {editing.image_url && (
              <img src={editing.image_url} alt="preview" style={{ maxWidth: 200, height: 100, objectFit: 'cover', borderRadius: 6, marginBottom: 10 }} />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><Field label="Airbnb URL"><input style={input} value={editing.airbnb_url || ''} onChange={(e) => setEditing({ ...editing, airbnb_url: e.target.value })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="iCal URL (опц.)"><input style={input} value={editing.ical_url || ''} onChange={(e) => setEditing({ ...editing, ical_url: e.target.value })} /></Field></div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Етапи реалізації (work stages)</h4>
                <button onClick={() => setEditing({ ...editing, work_stages: [...(editing.work_stages || []), { name: 'Новий етап', status: 'Not Started', weight: 0, percentage: 0 }] })}
                        style={{ ...btn, fontSize: 11, padding: '4px 8px' }}>
                  <Plus size={11} /> Додати
                </button>
              </div>
              {(editing.work_stages || []).map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 60px 1fr auto auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input style={{ ...input, fontSize: 12 }} value={s.name}
                         onChange={(e) => updateStage(editing, setEditing, i, { name: e.target.value })} placeholder="Назва" />
                  <select style={{ ...input, fontSize: 12 }} value={s.status}
                          onChange={(e) => updateStage(editing, setEditing, i, { status: e.target.value as WorkStage['status'] })}>
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <input type="number" style={{ ...input, fontSize: 12 }} value={s.weight} min={0} max={100}
                         onChange={(e) => updateStage(editing, setEditing, i, { weight: parseInt(e.target.value) || 0 })} title="Вага у загальному прогресі (сума має бути 100)" />
                  <input type="range" min={0} max={100} value={s.percentage}
                         onChange={(e) => updateStage(editing, setEditing, i, { percentage: parseInt(e.target.value) })} title={`${s.percentage}%`} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'right' }}>{s.percentage}%</span>
                  <button onClick={() => setEditing({ ...editing, work_stages: (editing.work_stages || []).filter((_, j) => j !== i) })}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }} title="Видалити етап">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Сума ваг: {(editing.work_stages || []).reduce((s, x) => s + (x.weight || 0), 0)} {(editing.work_stages || []).reduce((s, x) => s + (x.weight || 0), 0) !== 100 && <span style={{ color: '#f59e0b' }}>(рекомендовано 100)</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function updateStage(
  editing: Partial<UnitRow> | null,
  setEditing: (v: Partial<UnitRow> | null) => void,
  index: number,
  patch: Partial<WorkStage>,
) {
  if (!editing) return;
  const stages = (editing.work_stages || []).map((s, i) => i === index ? { ...s, ...patch } : s);
  setEditing({ ...editing, work_stages: stages });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 580, maxWidth: 700, maxHeight: '90vh', overflow: 'auto' };
