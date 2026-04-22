'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Phone, Plus, X, LogIn, LogOut } from 'lucide-react';
import BookingViewModal from '@/components/booking/BookingViewModal';

interface BookingRow {
  id: string; check_in: string; check_out: string; nights: number;
  adults: number; children: number; status: string; payment_status: string;
  source: string; total_price: number; first_name: string; last_name: string;
  guest_email: string | null; guest_phone: string | null;
  unit_name: string; unit_code: string; category_type: string;
  unit_type_name: string; group_id: string | null;
  commission_amount: number; guest_page_token: string | null;
  internal_notes: string | null; city_tax_amount: number;
  city_tax_included: number; city_tax_paid: string;
  registration_status: string; nationality: string | null;
  unit_id: string; unit_type_id: string; category_id: string; category_name: string;
  guest_id: string; notes: string | null; cleaning_status: string | null;
}

interface UnitRow {
  id: string; name: string; code: string; category_type: string;
  unit_type_id: string; unit_type_name: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Чернетка',     color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  tentative:   { label: 'Очікується',   color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  confirmed:   { label: 'Підтверджено', color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  checked_in:  { label: 'Заселено',     color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  checked_out: { label: 'Виселено',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  cancelled:   { label: 'Скасовано',    color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

const PAY_MAP: Record<string, { label: string; color: string }> = {
  unpaid:   { label: 'Не оплачено', color: '#f87171' },
  partial:  { label: 'Частково',    color: '#fbbf24' },
  paid:     { label: 'Оплачено',    color: '#34d399' },
  refunded: { label: 'Повернення',  color: '#a78bfa' },
};

const FILTER_CHIPS = [
  { key: '', label: 'Всі' },
  { key: 'confirmed', label: 'Підтверджено' },
  { key: 'tentative', label: 'Очікується' },
  { key: 'checked_in', label: 'Заселено' },
  { key: 'checked_out', label: 'Виселено' },
];

function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

// ─── New Booking Sheet ─────────────────────────────────────

function NewBookingSheet({ units, onClose, onSaved }: {
  units: UnitRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    checkIn: today,
    checkOut: tomorrow,
    unitId: units.find(u => u.category_type === 'resort')?.id || units[0]?.id || '',
    adults: 2,
    source: 'direct',
    status: 'confirmed',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resortUnits = useMemo(() => units.filter(u => u.category_type === 'resort'), [units]);
  const nights = calcNights(form.checkIn, form.checkOut);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.unitId || nights < 1) {
      setError('Заповніть обов\'язкові поля');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || null,
          unitId: form.unitId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          nights,
          adults: form.adults,
          children: 0,
          status: form.status,
          paymentStatus: 'unpaid',
          source: form.source,
          totalPrice: 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Помилка створення');
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Помилка мережі');
      setSaving(false);
    }
  }

  const inp = (style?: React.CSSProperties) => ({
    width: '100%', padding: '11px 12px', borderRadius: 10,
    border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: 15,
    boxSizing: 'border-box' as const,
    ...style,
  });

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 5, display: 'block' as const };

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '92dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>Нове бронювання</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Ім'я *</label>
              <input style={inp()} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Іван" required />
            </div>
            <div>
              <label style={label}>Прізвище *</label>
              <input style={inp()} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Іваненко" required />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label style={label}>Телефон</label>
            <input style={inp()} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+380..." />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Заїзд *</label>
              <input style={inp()} type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} required />
            </div>
            <div>
              <label style={label}>Виїзд *</label>
              <input style={inp()} type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} required />
            </div>
          </div>

          {nights > 0 && (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600, marginTop: -6 }}>
              {nights} ніч{nights === 1 ? '' : nights < 5 ? 'і' : 'ей'}
            </div>
          )}

          {/* Unit */}
          <div>
            <label style={label}>Юніт *</label>
            <select style={inp()} value={form.unitId} onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))} required>
              <option value="">— оберіть —</option>
              {resortUnits.map(u => <option key={u.id} value={u.id}>{u.code} — {u.unit_type_name}</option>)}
            </select>
          </div>

          {/* Adults + Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Дорослих</label>
              <select style={inp()} value={form.adults} onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))}>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Статус</label>
              <select style={inp()} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="confirmed">Підтверджено</option>
                <option value="tentative">Очікується</option>
                <option value="draft">Чернетка</option>
              </select>
            </div>
          </div>

          {/* Source */}
          <div>
            <label style={label}>Джерело</label>
            <select style={inp()} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
              <option value="direct">Прямий</option>
              <option value="phone">Телефон</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="booking_com">Booking.com</option>
              <option value="airbnb">Airbnb</option>
              <option value="agoda">Agoda</option>
            </select>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={saving || nights < 1}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
              color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              opacity: (saving || nights < 1) ? 0.6 : 1,
            }}
          >
            {saving ? 'Створення...' : 'Створити бронювання'}
          </button>
        </form>
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────

interface MobileBookingsProps {
  openNew?: boolean;
}

export default function MobileBookings({ openNew }: MobileBookingsProps) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [registrations, setRegistrations] = useState<unknown[]>([]);
  const [activityLog, setActivityLog] = useState<unknown[]>([]);
  const [bookingSources, setBookingSources] = useState<unknown[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState(openNew ?? false);

  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources as { code: string; name: string; color: string }[]) {
      map[s.code] = { label: s.name, color: s.color };
    }
    return map;
  }, [bookingSources]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes, uRes] = await Promise.all([
        fetch('/api/bookings?category=resort'),
        fetch('/api/booking-sources'),
        fetch('/api/units'),
      ]);
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
      if (sRes.ok) setBookingSources(await sRes.json());
      if (uRes.ok) setUnits(await uRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = bookings.filter(b => b.status !== 'cancelled');
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(b =>
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(s) ||
        b.unit_code?.toLowerCase().includes(s) ||
        b.guest_phone?.includes(s)
      );
    }
    return result.sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, statusFilter, search]);

  const openBooking = async (booking: BookingRow) => {
    setViewBooking(booking);
    try {
      const [pRes, rRes, aRes] = await Promise.all([
        fetch(`/api/bookings/${booking.id}/payments`),
        fetch(`/api/bookings/${booking.id}/registrations`),
        fetch(`/api/bookings/${booking.id}/activity`),
      ]);
      if (pRes.ok) setPayments(await pRes.json());
      if (rRes.ok) setRegistrations(await rRes.json());
      if (aRes.ok) { const d = await aRes.json(); setActivityLog(d.activities || d); }
    } catch (e) { console.error(e); }
  };

  const handleChangeStatus = async (id: string, status: string) => {
    await fetch(`/api/bookings/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchData();
  };

  return (
    <div>
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Ім'я, телефон, юніт..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 12px 10px 32px', borderRadius: 12 }}
          />
        </div>
      )}

      {/* Filter chips */}
      <div className="m-chips">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`m-chip ${statusFilter === chip.key ? 'm-chip-active' : ''}`}
            onClick={() => setStatusFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {filtered.length} бронювань
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowNewBooking(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 10, background: 'var(--accent-primary)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Нове
          </button>
          <button onClick={() => setShowSearch(p => !p)} style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <Search size={16} />
          </button>
          <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      {loading && bookings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="m-skeleton" style={{ height: 80, borderRadius: 14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="m-empty">
          <div className="m-empty-icon">📋</div>
          <div>Нічого не знайдено</div>
        </div>
      ) : (
        filtered.map(b => {
          const st = STATUS_MAP[b.status] || STATUS_MAP.draft;
          const pay = PAY_MAP[b.payment_status] || PAY_MAP.unpaid;
          const cleanLabel = b.cleaning_status === 'clean' ? 'Чисто' : b.cleaning_status === 'dirty' ? 'Брудно' : b.cleaning_status === 'in_progress' ? 'В процесі' : null;
          const cleanColor = b.cleaning_status === 'clean' ? '#22c55e' : b.cleaning_status === 'dirty' ? '#ef4444' : '#f59e0b';
          return (
            <div key={b.id} className="m-card" style={{ padding: '12px 14px', cursor: 'pointer' }}>
              <div className="m-card-row" onClick={() => openBooking(b)}>
                <div style={{ flex: 1 }}>
                  <div className="m-card-title">{b.first_name} {b.last_name}</div>
                  <div className="m-card-subtitle">
                    {b.unit_code} · {b.nights} ноч. · {b.check_in} → {b.check_out}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: pay.color }}>
                    {b.total_price > 0 ? `${b.total_price.toLocaleString()} Kč` : pay.label}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {b.guest_phone && (
                    <a href={`tel:${b.guest_phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                      <Phone size={10} /> {b.guest_phone}
                    </a>
                  )}
                  {cleanLabel && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${cleanColor}18`, color: cleanColor }}>
                      {cleanLabel}
                    </span>
                  )}
                </div>
                {b.status === 'confirmed' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleChangeStatus(b.id, 'checked_in'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <LogIn size={12} /> Заселити
                  </button>
                )}
                {b.status === 'checked_in' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleChangeStatus(b.id, 'checked_out'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <LogOut size={12} /> Виселити
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* New booking sheet */}
      {showNewBooking && units.length > 0 && (
        <NewBookingSheet
          units={units}
          onClose={() => setShowNewBooking(false)}
          onSaved={() => { setShowNewBooking(false); fetchData(); }}
        />
      )}

      {/* Booking detail modal */}
      {viewBooking && (
        <BookingViewModal
          booking={viewBooking}
          payments={payments as Parameters<typeof BookingViewModal>[0]['payments']}
          registrations={registrations as Parameters<typeof BookingViewModal>[0]['registrations']}
          activityLog={activityLog as Parameters<typeof BookingViewModal>[0]['activityLog']}
          sourceMap={sourceMap}
          onClose={() => setViewBooking(null)}
          onEdit={() => {}}
          onChangeStatus={handleChangeStatus}
          onFetchPayments={(id) => fetch(`/api/bookings/${id}/payments`).then(r => r.json()).then(setPayments)}
          onFetchBookings={fetchData}
          onFetchRegistrations={(id) => fetch(`/api/bookings/${id}/registrations`).then(r => r.json()).then(setRegistrations)}
          showToast={() => {}}
          setBooking={setViewBooking}
        />
      )}
    </div>
  );
}
