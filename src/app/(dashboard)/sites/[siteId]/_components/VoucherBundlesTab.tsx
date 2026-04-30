'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Package, Ticket, ChevronDown, ChevronUp, Edit3, CopyPlus, Check } from 'lucide-react';
import { Modal } from './SiteHelpers';
import type { SiteService } from '../_types';

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  nights_included: number;
  listing_type: string | null;
  included_services: string; // JSON
  validity_months: number;
  is_active: number;
  issued_count: number;
  redeemed_count: number;
  allowed_days: string | null;
  promo_code: string | null;
  redemption_limit: number;
  current_uses: number;
}

interface IncludedService {
  service_id: string;
  qty: number;
  free: boolean; // included in price (free for guest)
}

const emptyBundle = () => ({
  name: '',
  description: '',
  price: '',
  currency: 'CZK',
  nights_included: 1,
  listing_type: '',
  validity_months: 12,
  included_services: [] as IncludedService[],
  allowed_days: [] as number[],
  promo_code: '',
  redemption_limit: 100,
});



export function VoucherBundlesTab({ siteId, onCountChange }: { siteId: string; onCountChange?: (n: number) => void }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyBundle());
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bd, sd] = await Promise.all([
        fetch(`/api/voucher-bundles?site_id=${siteId}`).then(r => r.json()),
        fetch(`/api/booking-sites/${siteId}/services`).then(r => r.json()),
      ]);
      if (bd.bundles) {
        setBundles(bd.bundles);
        onCountChange?.(bd.bundles.length);
      }
      if (Array.isArray(sd.services)) setServices(sd.services);
    } finally { setLoading(false); }
  }, [siteId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const toggleService = (svcId: string) => {
    setForm(f => {
      const exists = f.included_services.find(s => s.service_id === svcId);
      if (exists) return { ...f, included_services: f.included_services.filter(s => s.service_id !== svcId) };
      return { ...f, included_services: [...f.included_services, { service_id: svcId, qty: 1, free: true }] };
    });
  };

  const updateIncluded = (svcId: string, key: 'qty' | 'free', val: number | boolean) => {
    setForm(f => ({
      ...f,
      included_services: f.included_services.map(s => s.service_id === svcId ? { ...s, [key]: val } : s),
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.price || !form.promo_code) { alert('Вкажіть назву, ціну та промокод'); return; }
    setCreating(true);
    try {
      const isEdit = !!editId;
      const body = {
        site_id: siteId,
        ...form,
        price: +form.price,
        redemption_limit: +form.redemption_limit,
        allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
      };
      const res = await fetch(isEdit ? `/api/voucher-bundles/${editId}` : '/api/voucher-bundles', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) { showToast(isEdit ? 'Оновлено ✓' : 'Пакет створено ✓'); setShowCreate(false); setForm(emptyBundle()); setEditId(null); load(); }
      else alert(d.error);
    } finally { setCreating(false); }
  };

  const handleDelete = async (b: Bundle) => {
    if (!confirm(`Архівувати пакет «${b.name}»?`)) return;
    await fetch(`/api/voucher-bundles/${b.id}`, { method: 'DELETE' });
    showToast('Архівовано'); load();
  };

  const getServiceName = (id: string) => services.find(s => s.id === id)?.name || id;
  const getServiceIcon = (id: string) => services.find(s => s.id === id)?.icon || '🛎';

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => { setForm(emptyBundle()); setEditId(null); setShowCreate(true); }}>
          <Plus size={16} /> Новий пакет
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.15)', display: 'flex', gap: 8 }}>
        <Package size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Пакет (Акційний тариф)</strong> — це пропозиція, яка включає ночі та сервіси за фіксованою ціною. 
          Ви задаєте пакету <strong>Промокод</strong> (напр., <code>SUMMER26</code>) та ліміт використань. 
          Коли гість вводить цей код у віджеті — вказані послуги додаються безкоштовно, а загальна ціна бронювання стає рівною ціні пакету (гість оплачує пакет під час бронювання).
        </span>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>
        : bundles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <div style={{ fontWeight: 600 }}>Пакетів ще немає</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bundles.map(b => {
              const services_list: IncludedService[] = (() => { try { return JSON.parse(b.included_services); } catch { return []; } })();
              const isExpanded = expanded === b.id;
              return (
                <div key={b.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', background: 'var(--surface-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setExpanded(isExpanded ? null : b.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-primary)' }}>
                          {b.price.toLocaleString('cs-CZ')} {b.currency}
                        </span>
                        {!b.is_active && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#ef444422', color: '#ef4444', fontWeight: 600 }}>Архів</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {b.promo_code && <span>🏷 Код: <strong>{b.promo_code}</strong> ({b.current_uses}/{b.redemption_limit})</span>}
                        {b.nights_included > 0 && <span>🌙 {b.nights_included} н.</span>}

                        <span>⏳ {b.validity_months} міс.</span>
                        {b.allowed_days && <span>📅 {(JSON.parse(b.allowed_days) as number[]).map(d => DAY_LABELS[d]).join(', ')}</span>}
                        {services_list.length > 0 && (
                          <span>{services_list.map(s => getServiceIcon(s.service_id)).join(' ')} {services_list.length} сервісів</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>

                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}
                        onClick={() => {
                          setForm({
                            name: b.name,
                            description: b.description || '',
                            price: String(b.price),
                            currency: b.currency,
                            nights_included: b.nights_included,
                            listing_type: b.listing_type || '',
                            validity_months: b.validity_months,
                            included_services: b.included_services ? JSON.parse(b.included_services) : [],
                            allowed_days: b.allowed_days ? JSON.parse(b.allowed_days) : [],
                            promo_code: b.promo_code || '',
                            redemption_limit: b.redemption_limit || 100,
                          });
                          setEditId(b.id);
                          setShowCreate(true);
                        }} title="Редагувати">
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}
                        onClick={() => {
                          setForm({
                            name: b.name + ' (Копія)',
                            description: b.description || '',
                            price: String(b.price),
                            currency: b.currency,
                            nights_included: b.nights_included,
                            listing_type: b.listing_type || '',
                            validity_months: b.validity_months,
                            included_services: b.included_services ? JSON.parse(b.included_services) : [],
                            allowed_days: b.allowed_days ? JSON.parse(b.allowed_days) : [],
                            promo_code: b.promo_code ? b.promo_code + 'COPY' : '',
                            redemption_limit: b.redemption_limit || 100,
                          });
                          setEditId(null);
                          setShowCreate(true);
                        }} title="Дублювати">
                        <CopyPlus size={14} />
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '5px 8px', color: '#ef4444' }}
                        onClick={() => handleDelete(b)} title="В архів">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {b.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{b.description}</div>}
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>Включені сервіси:</div>
                      {services_list.length === 0
                        ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Без додаткових сервісів</div>
                        : services_list.map(s => (
                          <div key={s.service_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span>{getServiceIcon(s.service_id)}</span>
                            <span>{getServiceName(s.service_id)}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>× {s.qty}</span>
                            {s.free && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>Безкоштовно</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editId ? "Редагувати пакет" : "Новий пакет"} size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : (editId ? <Check size={14} /> : <Package size={14} />)} {editId ? "Зберегти" : "Створити"}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Назва пакету *</label>
            <input className="form-input" placeholder="Романтичний вікенд" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Опис</label>
            <textarea className="form-input" rows={2} placeholder="2 ночі + сауна + сніданок..."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ціна пакету *</label>
              <input className="form-input" type="number" min={0} placeholder="8500"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Валюта</label>
              <select className="form-select" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>CZK</option><option>EUR</option><option>USD</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ночей включено</label>
              <input className="form-input" type="number" min={0}
                value={form.nights_included} onChange={e => setForm(f => ({ ...f, nights_included: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Дійсний (міс.)</label>
              <input className="form-input" type="number" min={1}
                value={form.validity_months} onChange={e => setForm(f => ({ ...f, validity_months: +e.target.value }))} />
            </div>
          </div>

          <div className="form-row" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.15)' }}>
            <div className="form-group">
              <label className="form-label">Промокод пакету *</label>
              <input className="form-input" placeholder="Напр., WEEKEND26" value={form.promo_code}
                onChange={e => setForm(f => ({ ...f, promo_code: e.target.value.toUpperCase() }))} />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Гості зможуть застосувати цей пакет за кодом</div>
            </div>
            <div className="form-group">
              <label className="form-label">Ліміт використань</label>
              <input className="form-input" type="number" min={1} disabled={!form.promo_code}
                value={form.redemption_limit} onChange={e => setForm(f => ({ ...f, redemption_limit: +e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Дозволені дні тижня <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{form.allowed_days.length === 0 ? '(всі дні)' : ''}</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS.map(d => {
                const on = form.allowed_days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => setForm(f => ({ ...f, allowed_days: f.allowed_days.includes(d) ? f.allowed_days.filter(x => x !== d) : [...f.allowed_days, d].sort() }))}
                    style={{ width: 38, height: 38, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: on ? 'var(--accent-primary)' : 'var(--surface-secondary)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                    {DAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Services picker */}
          <div className="form-group">
            <label className="form-label">Включені сервіси</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', padding: '2px 0' }}>
              {services.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Немає сервісів — додайте у вкладці «Сервіси»</div>
                : services.map(svc => {
                  const inc = form.included_services.find(s => s.service_id === svc.id);
                  return (
                    <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${inc ? 'var(--accent-primary)' : 'var(--border-primary)'}`, background: inc ? 'rgba(99,102,241,0.06)' : 'var(--surface-secondary)', cursor: 'pointer' }}
                      onClick={() => toggleService(svc.id)}>
                      <input type="checkbox" checked={!!inc} readOnly style={{ cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{svc.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: inc ? 600 : 400 }}>{svc.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{svc.price_override ?? svc.price} {svc.currency}</span>
                      {inc && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={inc.free}
                              onChange={e => updateIncluded(svc.id, 'free', e.target.checked)} />
                            безкоштовно
                          </label>
                          <input type="number" min={1} value={inc.qty}
                            onChange={e => updateIncluded(svc.id, 'qty', +e.target.value)}
                            style={{ width: 48, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 12 }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>шт.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </Modal>

    </div>
  );
}
