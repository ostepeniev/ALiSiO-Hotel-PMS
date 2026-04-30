'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Globe, Plus, Search, Trash2, ExternalLink,
  Loader2, X, ToggleLeft, ToggleRight,
  Ticket, Gift, Check, AlertCircle,
} from 'lucide-react';

/* ───── Types ───── */
interface BookingSite {
  id: string;
  name: string;
  type: 'widget' | 'self-hosted';
  currency: string;
  status: 'active' | 'paused' | 'deleted';
  listings_count: number;
  created_at: string;
}

/* ───── Modal ───── */
function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ───── Status badge ───── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:  { label: 'Активний',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  paused:  { label: 'Призупинено', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  deleted: { label: 'Видалено',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const TYPE_LABELS: Record<string, string> = {
  widget: 'Віджет',
  'self-hosted': 'Self-hosted',
};

function fmt(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ───── Voucher Types ───── */
interface VoucherTemplate {
  id: string; name: string; description: string;
  type: string; value_type: string; face_value: number;
  currency: string; emoji: string; badge: string;
  validityMonths: number; config_json: Record<string, unknown>;
}
interface Voucher {
  id: string; code: string; template_id: string; name: string;
  type: string; value_type: string; face_value: number; currency: string;
  status: 'draft' | 'active' | 'paid' | 'redeemed' | 'expired' | 'cancelled';
  recipient_name: string | null; recipient_email: string | null;
  buyer_name: string | null; buyer_email: string | null;
  message: string | null; expires_at: string | null;
  redeemed_at: string | null; reservation_id: string | null;
  unit_name: string | null; check_in: string | null; check_out: string | null;
  notes: string | null; created_at: string;
}

const VOUCHER_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Чернетка',    color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: null },
  active:    { label: 'Активний',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: <Check size={11}/> },
  paid:      { label: 'Оплачено',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: <Check size={11}/> },
  redeemed:  { label: 'Погашено',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: <Ticket size={11}/> },
  expired:   { label: 'Прострочено', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: <AlertCircle size={11}/> },
  cancelled: { label: 'Скасовано',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: null },
};

const FILTER_TABS = [
  { key: 'all', label: 'Всі' },
  { key: 'active', label: 'Активні' },
  { key: 'paid', label: 'Оплачені' },
  { key: 'redeemed', label: 'Погашені' },
  { key: 'expired', label: 'Прострочені' },
];

/* ───── VouchersTab ───── */
function VouchersTab({ propertyId }: { propertyId: string }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<VoucherTemplate | null>(null);
  const [createStep, setCreateStep] = useState<'pick' | 'fill'>('pick');
  const [form, setForm] = useState({ recipient_name: '', recipient_email: '', buyer_name: '', buyer_email: '', buyer_phone: '', message: '', notes: '', expires_at: '' });
  const [creating, setCreating] = useState(false);

  // Redeem modal
  const [redeemVoucher, setRedeemVoucher] = useState<Voucher | null>(null);
  const [redeemResId, setRedeemResId] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ propertyId });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (search) params.set('search', search);
      const res = await fetch(`/api/vouchers?${params}`);
      const data = await res.json();
      if (data.vouchers) setVouchers(data.vouchers);
      if (data.templates) setTemplates(data.templates);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [propertyId, filterStatus, search]);

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  const openCreate = () => { setSelectedTpl(null); setCreateStep('pick'); setForm({ recipient_name: '', recipient_email: '', buyer_name: '', buyer_email: '', buyer_phone: '', message: '', notes: '', expires_at: '' }); setShowCreate(true); };

  const handleCreate = async () => {
    if (!selectedTpl) return;
    setCreating(true);
    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, template_id: selectedTpl.id, ...form }),
      });
      if (res.ok) { showToast('Ваучер створено!'); setShowCreate(false); fetchVouchers(); }
      else { const d = await res.json(); alert(d.error || 'Помилка'); }
    } catch { alert('Помилка мережі'); }
    finally { setCreating(false); }
  };

  const handleStatusChange = async (v: Voucher, newStatus: string) => {
    await fetch(`/api/vouchers/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    showToast('Статус оновлено'); fetchVouchers();
  };

  const handleDelete = async (v: Voucher) => {
    if (!confirm(`Скасувати ваучер «${v.code}»?`)) return;
    await fetch(`/api/vouchers/${v.id}`, { method: 'DELETE' });
    showToast('Ваучер скасовано'); fetchVouchers();
  };

  const handleRedeem = async () => {
    if (!redeemVoucher || !redeemResId.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch(`/api/vouchers/${redeemVoucher.id}/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: redeemResId.trim() }),
      });
      if (res.ok) { showToast('Ваучер погашено! ✓'); setRedeemVoucher(null); setRedeemResId(''); fetchVouchers(); }
      else { const d = await res.json(); alert(d.error || 'Помилка'); }
    } catch { alert('Помилка мережі'); }
    finally { setRedeeming(false); }
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Подарункові ваучери</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Продавайте ваучери як подарунки — гості самостійно обирають дати й умови.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Новий ваучер</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTER_TABS.map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={filterStatus === f.key ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '4px 14px', fontSize: 13 }}>{f.label}</button>
        ))}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="form-input" placeholder="Код, ім'я…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 28, width: 200, fontSize: 13 }} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} /></div>
      ) : vouchers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <Gift size={44} style={{ margin: '0 auto 14px', opacity: 0.2 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Ваучерів ще немає</div>
          <div style={{ fontSize: 13 }}>Натисніть «Новий ваучер» щоб створити перший</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {vouchers.map(v => {
            const st = VOUCHER_STATUS[v.status] || VOUCHER_STATUS.active;
            return (
              <div key={v.id} style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{v.name}</div>
                    <code style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: 1 }}>{v.code}</code>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.color, flexShrink: 0 }}>
                    {st.icon}{st.label}
                  </span>
                </div>

                {/* Info */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {v.recipient_name && <span>🎁 {v.recipient_name}{v.recipient_email ? ` — ${v.recipient_email}` : ''}</span>}
                  {v.buyer_name && <span>💳 Покупець: {v.buyer_name}</span>}
                  <span>💰 {v.face_value.toLocaleString('cs-CZ')} {v.currency}</span>
                  {v.expires_at && <span>⏳ Діє до: {fmt(v.expires_at)}</span>}
                  {v.status === 'redeemed' && v.check_in && <span>✅ Погашено: {fmt(v.check_in)} → {v.check_out ? fmt(v.check_out) : '?'}{v.unit_name ? ` (${v.unit_name})` : ''}</span>}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {(v.status === 'active' || v.status === 'paid') && (
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setRedeemVoucher(v); setRedeemResId(''); }}>
                      <Ticket size={13} /> Погасити
                    </button>
                  )}
                  {v.status === 'draft' && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => handleStatusChange(v, 'active')}>
                      <Check size={13} /> Активувати
                    </button>
                  )}
                  {v.status === 'active' && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => handleStatusChange(v, 'paid')}>
                      💳 Позначити оплаченим
                    </button>
                  )}
                  {!['redeemed', 'cancelled'].includes(v.status) && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', color: '#ef4444', marginLeft: 'auto' }} onClick={() => handleDelete(v)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий ваучер"
        footer={createStep === 'fill' ? (
          <>
            <button className="btn btn-ghost" onClick={() => setCreateStep('pick')}>← Назад</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 size={15} className="spin" /> : <Gift size={15} />} Створити ваучер
            </button>
          </>
        ) : undefined}
      >
        {createStep === 'pick' ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Оберіть шаблон ваучера:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(tpl => (
                <div key={tpl.id}
                  onClick={() => { setSelectedTpl(tpl); setCreateStep('fill'); }}
                  style={{ border: `2px solid ${selectedTpl?.id === tpl.id ? 'var(--accent-primary)' : 'var(--border-primary)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s', background: 'var(--surface-secondary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{tpl.emoji} {tpl.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>{tpl.badge}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tpl.description}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedTpl && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13 }}>
                {selectedTpl.emoji} <strong>{selectedTpl.name}</strong> — {selectedTpl.badge}
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ім'я отримувача</label>
                <input className="form-input" placeholder="Jana Nováková" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email отримувача</label>
                <input className="form-input" type="email" placeholder="jana@email.cz" value={form.recipient_email} onChange={e => setForm(f => ({ ...f, recipient_email: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Покупець (ім'я)</label>
                <input className="form-input" value={form.buyer_name} onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Покупець (телефон)</label>
                <input className="form-input" value={form.buyer_phone} onChange={e => setForm(f => ({ ...f, buyer_phone: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Персональне повідомлення</label>
              <textarea className="form-input" rows={2} placeholder="Бажаємо незабутнього відпочинку! 🌲" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Термін дії (авто: +{selectedTpl?.validityMonths} міс.)</label>
              <input className="form-input" type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Нотатки (внутрішні)</label>
              <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Redeem Modal ── */}
      <Modal open={!!redeemVoucher} onClose={() => setRedeemVoucher(null)} title="Погашення ваучера"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRedeemVoucher(null)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleRedeem} disabled={redeeming || !redeemResId.trim()}>
              {redeeming ? <Loader2 size={15} className="spin" /> : <Ticket size={15} />} Погасити
            </button>
          </>
        }
      >
        {redeemVoucher && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13 }}>
              🎟️ <strong>{redeemVoucher.code}</strong> — {redeemVoucher.name}
              {redeemVoucher.recipient_name && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Для: {redeemVoucher.recipient_name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">ID бронювання *</label>
              <input className="form-input" placeholder="Вставте reservation_id з PMS" value={redeemResId} onChange={e => setRedeemResId(e.target.value)} autoFocus />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Знайдіть бронювання в розкладі або Inbox і скопіюйте його ID</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#22c55e', color: '#fff', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

/* ───── Main Page ───── */
export default function SitesPage() {
  const router = useRouter();
  const onMenuClick = useMobileMenu();

  const [activeTab, setActiveTab] = useState<'sites' | 'vouchers'>('sites');

  const [sites, setSites] = useState<BookingSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  /* create modal */
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'widget' | 'self-hosted'>('self-hosted');
  const [newCurrency, setNewCurrency] = useState('CZK');
  const [creating, setCreating] = useState(false);

  /* ── fetch ── */
  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/booking-sites');
      const data = await res.json();
      if (Array.isArray(data.sites)) setSites(data.sites);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  /* ── create ── */
  const handleCreate = async () => {
    if (!newName.trim()) { alert('Введіть назву сайту'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/booking-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType, currency: newCurrency }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Сайт створено!');
        setShowCreate(false);
        setNewName('');
        fetchSites();
        router.push(`/sites/${data.site.id}`);
      } else {
        alert(data.error || 'Помилка создання');
      }
    } catch { alert('Помилка мережі'); }
    finally { setCreating(false); }
  };

  /* ── toggle status ── */
  const toggleStatus = async (site: BookingSite) => {
    const nextStatus = site.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/booking-sites/${site.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(nextStatus === 'active' ? 'Сайт активовано' : 'Сайт призупинено');
      fetchSites();
    } catch { alert('Помилка'); }
  };

  /* ── delete ── */
  const handleDelete = async (site: BookingSite) => {
    if (!confirm(`Видалити сайт «${site.name}»? Це незворотно.`)) return;
    await fetch(`/api/booking-sites/${site.id}`, { method: 'DELETE' });
    showToast('Сайт видалено');
    fetchSites();
  };

  /* ── toast ── */
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  /* ── filter ── */
  const filtered = sites.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ── render ── */
  return (
    <div className="page-layout">
      <Header title="Сайти бронювання" onMenuClick={onMenuClick} />

      <div className="page-content" style={{ padding: 12 }}>

        {/* ── Tab navigation ── */}
        <div style={{ display: 'flex', gap: 4, marginTop: 54, marginBottom: 20, borderBottom: '1px solid var(--border-primary)' }}>
          {([
            ['sites', <Globe key="g" size={15} />, 'Сайти'],
            ['vouchers', <Ticket key="t" size={15} />, 'Ваучери'],
          ] as const).map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', fontSize: 14, fontWeight: activeTab === key ? 700 : 500,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >{icon}{label}</button>
          ))}
        </div>

        {/* ── Vouchers tab ── */}
        {activeTab === 'vouchers' && <VouchersTab propertyId="" />}

        {/* ── Sites tab ── */}
        {activeTab === 'sites' && (
          <>
            {/* Hero / Intro блок */}
            <div style={{
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 12,
              padding: '24px 28px',
              marginBottom: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Globe size={22} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Сайти прямого бронювання</h2>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 10px' }}>
                  Створіть власний сайт для прямого бронювання короткострокової оренди.
                  Керуйте оголошеннями, тарифними планами та правилами бронювання в одному місці.
                  Виберіть дизайн, підключіть онлайн-оплату через Stripe або PayPal і приймайте
                  бронювання без посередників.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                  {[
                    '💳 Stripe та PayPal з коробки',
                    '🎨 Налаштування стилю та дизайну',
                    '📦 Підтримка оголошень та тарифних планів',
                    '🔗 Вбудований і self-hosted режими',
                  ].map(f => (
                    <span key={f} style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{f}</span>
                  ))}
                </div>
              </div>
              <div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Plus size={16} /> Новий сайт
                </button>
              </div>
            </div>

            {/* Пошук */}
            {(sites.length > 0 || search) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    className="form-input"
                    placeholder="Пошук сайтів..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 32, width: 260 }}
                  />
                </div>
              </div>
            )}

            {/* Таблиця / Empty state */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} />
              </div>
            ) : filtered.length === 0 && search ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 15, marginBottom: 8 }}>Сайтів не знайдено</div>
                <div style={{ fontSize: 13 }}>Спробуйте змінити запит</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Globe size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Сайтів ще немає</div>
                <div style={{ fontSize: 13 }}>Натисніть «Новий сайт» щоб почати</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Назва</th>
                      <th>Тип</th>
                      <th>Оголошень</th>
                      <th>Валюта</th>
                      <th>Статус</th>
                      <th>Створено</th>
                      <th style={{ textAlign: 'right' }}>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(site => {
                      const st = STATUS_CONFIG[site.status] || STATUS_CONFIG.active;
                      return (
                        <tr
                          key={site.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/sites/${site.id}`)}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Globe size={16} style={{ color: 'var(--accent-primary)' }} />
                              <span style={{ fontWeight: 600 }}>{site.name}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              {TYPE_LABELS[site.type] || site.type}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-info">{site.listings_count}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{site.currency}</td>
                          <td>
                            <span style={{
                              fontSize: 12, fontWeight: 600, padding: '3px 10px',
                              borderRadius: 99, background: st.bg, color: st.color,
                            }}>
                              {st.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmt(site.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }} onClick={e => e.stopPropagation()}>
                              <button
                                className="btn btn-ghost"
                                title={site.status === 'active' ? 'Призупинити' : 'Активувати'}
                                onClick={() => toggleStatus(site)}
                                style={{ padding: '4px 8px' }}
                              >
                                {site.status === 'active'
                                  ? <ToggleRight size={18} style={{ color: '#22c55e' }} />
                                  : <ToggleLeft size={18} style={{ color: 'var(--text-tertiary)' }} />
                                }
                              </button>
                              <button
                                className="btn btn-ghost"
                                title="Відкрити"
                                onClick={() => router.push(`/sites/${site.id}`)}
                                style={{ padding: '4px 8px' }}
                              >
                                <ExternalLink size={16} />
                              </button>
                              <button
                                className="btn btn-ghost"
                                title="Видалити"
                                onClick={() => handleDelete(site)}
                                style={{ padding: '4px 8px', color: '#ef4444' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Create Modal */}
            <Modal
              open={showCreate}
              onClose={() => setShowCreate(false)}
              title="Новий сайт бронювання"
              footer={
                <>
                  <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                    Створити
                  </button>
                </>
              }
            >
              <div className="form-group">
                <label className="form-label">Назва сайту *</label>
                <input
                  className="form-input"
                  placeholder="Наприклад: Glamping ALiSiO"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Тип</label>
                  <select className="form-select" value={newType} onChange={e => setNewType(e.target.value as 'widget' | 'self-hosted')}>
                    <option value="self-hosted">Self-hosted</option>
                    <option value="widget">Лише віджет</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Валюта</label>
                  <select className="form-select" value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="UAH">UAH</option>
                  </select>
                </div>
              </div>
              {/* Type explanation */}
              <div style={{ marginBottom: 8, padding: '12px 16px', borderRadius: 10, fontSize: 13, border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)', lineHeight: 1.5 }}>
                {newType === 'self-hosted' ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>🌐 Повноцінний сайт</div>
                    Вибирайте цей варіант, <span style={{color:'var(--accent-primary)',fontWeight:600}}>якщо у вас немає свого сайту</span>. Ми створимо окрему сторінку з усіма вашими будиночками на нашому домені.
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>📌 Тільки віджет</div>
                    Вибирайте цей варіант, <span style={{color:'var(--accent-primary)',fontWeight:600}}>якщо у вас вже є свій сайт</span> (Wix, WordPress тощо). Ви отримаєте код, який просто вставите на свою сторінку.
                  </>
                )}
              </div>
              <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--surface-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                💡 Після створення ви зможете налаштувати оголошення, дизайн, тарифні плани та інсталяційний код.
              </div>
            </Modal>
          </>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#22c55e', color: '#fff', padding: '12px 20px',
          borderRadius: 8, fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
