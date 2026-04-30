'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal, CANCEL_LABELS } from './SiteHelpers';
import type { RatePlan } from '../_types';

export function RatePlansTab({ siteId, onCountChange }: { siteId: string; onCountChange?: (n: number) => void }) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', cancellation_policy: 'non_refundable',
    min_stay: 1, max_stay: 999, min_days_before_checkin: 0,
    pricing_mode: 'independent', is_default: false,
  });
  const [creating, setCreating] = useState(false);

  const onCountRef = useRef(onCountChange);
  useEffect(() => { onCountRef.current = onCountChange; }, [onCountChange]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/rate-plans`);
    const d = await res.json();
    if (Array.isArray(d.plans)) { setPlans(d.plans); onCountRef.current?.(d.plans.length); }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleCreate = async () => {
    if (!form.name.trim()) { alert('Введіть назву тарифу'); return; }
    setCreating(true);
    await fetch(`/api/booking-sites/${siteId}/rate-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, is_default: form.is_default ? 1 : 0 }),
    });
    setCreating(false);
    setShowCreate(false);
    setForm({ name: '', cancellation_policy: 'non_refundable', min_stay: 1, max_stay: 999, min_days_before_checkin: 0, pricing_mode: 'independent', is_default: false });
    fetchPlans();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити тариф?')) return;
    await fetch(`/api/booking-sites/${siteId}/rate-plans/${id}`, { method: 'DELETE' });
    fetchPlans();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      <div className="table-toolbar">
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Новий тариф</button>
      </div>

      {plans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <div>Тарифних планів ще немає</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plans.map(plan => (
            <div key={plan.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: 'var(--surface-secondary)' }}
                onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, marginRight: 8 }}>{plan.name}</span>
                  {plan.is_default === 1 && <span style={{ fontSize: 11, background: 'var(--accent-primary)', color: '#fff', padding: '2px 8px', borderRadius: 99, marginRight: 8 }}>За замовч.</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{CANCEL_LABELS[plan.cancellation_policy]}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', color: '#ef4444' }} onClick={e => { e.stopPropagation(); handleDelete(plan.id); }}>
                    <Trash2 size={14} />
                  </button>
                  {expanded === plan.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              {expanded === plan.id && (
                <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Мін. ночей:</span> <strong>{plan.min_stay}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Макс. ночей:</span> <strong>{plan.max_stay}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Днів до заїзду:</span> <strong>{plan.min_days_before_checkin}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Ціноутворення:</span> <strong>{plan.pricing_mode}</strong></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий тарифний план"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Створити
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Назва *</label>
          <input className="form-input" placeholder="Базовий тариф" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Політика скасування</label>
          <select className="form-select" value={form.cancellation_policy} onChange={e => setForm(f => ({ ...f, cancellation_policy: e.target.value }))}>
            <option value="non_refundable">❌ Без повернення</option>
            <option value="full_refund">✅ Повне повернення</option>
            <option value="flexible">⚡ Гнучке</option>
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" min={1} value={form.min_stay} onChange={e => setForm(f => ({ ...f, min_stay: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Макс. ночей</label>
            <input className="form-input" type="number" min={1} value={form.max_stay} onChange={e => setForm(f => ({ ...f, max_stay: +e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Мін. днів до заїзду</label>
          <input className="form-input" type="number" min={0} value={form.min_days_before_checkin} onChange={e => setForm(f => ({ ...f, min_days_before_checkin: +e.target.value }))} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
          <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Встановити як тариф за замовчуванням</span>
        </label>
      </Modal>
    </div>
  );
}
