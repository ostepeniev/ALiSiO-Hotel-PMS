'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';

interface Metric {
  id: string;
  project_id: string;
  project_name: string;
  year_month: string;
  occupancy_pct: number | null;
  revenue: number | null;
  notes: string | null;
}

interface Project { id: string; name: string }

export default function MetricsTab() {
  const [items, setItems] = useState<Metric[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Metric> | null>(null);
  const [filter, setFilter] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('project_id', filter);
      const [mRes, pRes] = await Promise.all([
        fetch(`/api/finance/investor-monthly-metrics?${params}`),
        fetch('/api/finance/investor-projects'),
      ]);
      const [mJ, pJ] = await Promise.all([mRes.json(), pRes.json()]);
      setItems(mJ.items || []);
      setProjects(pJ.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.project_id || !editing?.year_month) {
      alert('project_id і year_month обовʼязкові');
      return;
    }
    try {
      const res = await fetch('/api/finance/investor-monthly-metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  async function remove(id: string) {
    if (!confirm('Видалити запис?')) return;
    await fetch(`/api/finance/investor-monthly-metrics/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select style={input} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Всі проєкти</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setEditing({ year_month: new Date().toISOString().substring(0,7), project_id: filter || undefined })}
                style={{ marginLeft: 'auto', ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Додати місяць
        </button>
      </div>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Метрик ще немає.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Місяць</th>
                <th style={th}>Проєкт</th>
                <th style={{ ...th, textAlign: 'right' }}>Occupancy %</th>
                <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                <th style={th}>Нотатки</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}><b>{m.year_month}</b></td>
                  <td style={td}>{m.project_name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.occupancy_pct != null ? `${m.occupancy_pct}%` : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.revenue != null ? m.revenue.toLocaleString('cs-CZ', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={td}>{m.notes || '—'}</td>
                  <td style={td}>
                    <button onClick={() => setEditing(m)} style={iconBtn} title="Редагувати"><Edit size={14} /></button>
                    <button onClick={() => remove(m.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Місячна метрика</h3>
            <Field label="Проєкт *">
              <select style={input} value={editing.project_id || ''} onChange={(e) => setEditing({ ...editing, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Місяць (YYYY-MM) *"><input type="month" style={input} value={editing.year_month || ''} onChange={(e) => setEditing({ ...editing, year_month: e.target.value })} /></Field>
            <Field label="Occupancy % (0-100)"><input type="number" step="0.1" min="0" max="100" style={input} value={editing.occupancy_pct ?? ''} onChange={(e) => setEditing({ ...editing, occupancy_pct: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
            <Field label="Revenue (місячна виручка)"><input type="number" step="0.01" style={input} value={editing.revenue ?? ''} onChange={(e) => setEditing({ ...editing, revenue: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
            <Field label="Нотатки"><textarea style={{ ...input, minHeight: 60 }} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} /></Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 12px' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: 520 };
