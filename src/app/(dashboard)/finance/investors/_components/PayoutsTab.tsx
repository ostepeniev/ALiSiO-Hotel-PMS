'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Payout {
  id: string;
  investor_id: string;
  investor_name: string;
  project_id: string | null;
  project_name: string | null;
  amount: number;
  currency: string;
  paid_at: string;
  period_year_month: string | null;
  comment: string | null;
  fin_operation_id: string | null;
}

interface Investor { id: string; name: string }
interface Project  { id: string; name: string }

function fmt(n: number, cur: string): string {
  return `${n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export default function PayoutsTab() {
  const [items, setItems] = useState<Payout[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Payout> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, iRes, prRes] = await Promise.all([
        fetch('/api/finance/investor-payouts'),
        fetch('/api/finance/investors'),
        fetch('/api/finance/investor-projects'),
      ]);
      const [pJ, iJ, prJ] = await Promise.all([pRes.json(), iRes.json(), prRes.json()]);
      setItems(pJ.items || []);
      setInvestors((iJ.items || []).map((i: any) => ({ id: i.id, name: i.name })));
      setProjects(prJ.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function save() {
    if (!editing?.investor_id || !editing?.amount || !editing?.paid_at) {
      alert('investor_id, amount, paid_at обовʼязкові');
      return;
    }
    try {
      const res = await fetch('/api/finance/investor-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      setEditing(null);
      fetchAll();
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
  }

  async function remove(id: string) {
    if (!confirm('Видалити виплату? Звʼязана fin_operation теж видалиться.')) return;
    await fetch(`/api/finance/investor-payouts/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setEditing({ currency: 'EUR', paid_at: new Date().toISOString().substring(0,10) })}
                style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>
          <Plus size={14} /> Виплатити дивіденд
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        💡 При створенні виплати автоматично створюється <code>fin_operation</code> (op_type=expense, source=&apos;dividend&apos;) — гроші відображаються у фінансових звітах як cash outflow.
      </p>

      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Виплат ще не було.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Дата</th>
                <th style={th}>Інвестор</th>
                <th style={th}>Проєкт</th>
                <th style={{ ...th, textAlign: 'right' }}>Сума</th>
                <th style={th}>Період</th>
                <th style={th}>Коментар</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                  <td style={td}>{p.paid_at}</td>
                  <td style={td}><b>{p.investor_name}</b></td>
                  <td style={td}>{p.project_name || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(p.amount, p.currency)}</td>
                  <td style={td}>{p.period_year_month || '—'}</td>
                  <td style={td}>{p.comment || '—'}</td>
                  <td style={td}><button onClick={() => remove(p.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Виплата дивіденду</h3>
            <Field label="Інвестор *">
              <select style={input} value={editing.investor_id || ''} onChange={(e) => setEditing({ ...editing, investor_id: e.target.value })}>
                <option value="">—</option>
                {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Проєкт (опц., для атрибуції)">
              <select style={input} value={editing.project_id || ''} onChange={(e) => setEditing({ ...editing, project_id: e.target.value || null })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 2 }}><Field label="Сума *"><input type="number" step="0.01" style={input} value={editing.amount || ''} onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Валюта"><select style={input} value={editing.currency || 'EUR'} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}><option>EUR</option><option>CZK</option><option>USD</option></select></Field></div>
            </div>
            <Field label="Дата виплати *"><input type="date" style={input} value={editing.paid_at || ''} onChange={(e) => setEditing({ ...editing, paid_at: e.target.value })} /></Field>
            <Field label="Період (YYYY-MM)"><input type="month" style={input} value={editing.period_year_month || ''} onChange={(e) => setEditing({ ...editing, period_year_month: e.target.value || null })} /></Field>
            <Field label="Коментар"><input style={input} value={editing.comment || ''} onChange={(e) => setEditing({ ...editing, comment: e.target.value || null })} /></Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>Виплатити</button>
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
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 480, maxWidth: 560 };
