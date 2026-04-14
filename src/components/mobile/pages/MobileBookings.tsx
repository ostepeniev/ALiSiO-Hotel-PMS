'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Phone } from 'lucide-react';
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
  guest_id: string; notes: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Чернетка', color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  tentative: { label: 'Очікується', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  confirmed: { label: 'Підтверджено', color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  checked_in: { label: 'Заселено', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  checked_out: { label: 'Виселено', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  cancelled: { label: 'Скасовано', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

const PAY_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '₿', color: '#f87171' },
  partial: { label: '½', color: '#fbbf24' },
  paid: { label: '✓', color: '#34d399' },
  refunded: { label: '↩', color: '#a78bfa' },
};

const FILTER_CHIPS = [
  { key: '', label: 'Всі' },
  { key: 'confirmed', label: 'Підтверджено' },
  { key: 'tentative', label: 'Очікується' },
  { key: 'checked_in', label: 'Заселено' },
  { key: 'checked_out', label: 'Виселено' },
];

export default function MobileBookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewBooking, setViewBooking] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [bookingSources, setBookingSources] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources) { map[s.code] = { label: s.name, color: s.color }; }
    return map;
  }, [bookingSources]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        fetch('/api/bookings?category=resort'),
        fetch('/api/booking-sources'),
      ]);
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
      if (sRes.ok) setBookingSources(await sRes.json());
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {filtered.length} бронювань
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSearch(p => !p)} style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <Search size={16} />
          </button>
          <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

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
          return (
            <div key={b.id} className="m-card" onClick={() => openBooking(b)} style={{ padding: '12px 14px', cursor: 'pointer' }}>
              <div className="m-card-row">
                <div style={{ flex: 1 }}>
                  <div className="m-card-title">{b.first_name} {b.last_name}</div>
                  <div className="m-card-subtitle">
                    {b.unit_code} · {b.nights} ноч. · {b.check_in} → {b.check_out}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                    background: st.bg, color: st.color,
                  }}>{st.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: pay.color }}>{pay.label}</span>
                    {b.total_price > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {b.total_price.toLocaleString()} Kč
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {b.guest_phone && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={10} /> {b.guest_phone}
                </div>
              )}
            </div>
          );
        })
      )}

      {viewBooking && (
        <BookingViewModal
          booking={viewBooking}
          payments={payments}
          registrations={registrations}
          activityLog={activityLog}
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
