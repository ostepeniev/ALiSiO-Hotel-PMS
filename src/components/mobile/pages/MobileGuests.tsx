'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Phone, Mail, MapPin, X, ChevronRight, User } from 'lucide-react';

interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  total_stays: number;
  total_revenue: number | null;
  last_check_in: string | null;
  last_booking_status: string | null;
}

interface ReservationRow {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  status: string;
  total_price: number;
  unit_name: string;
  unit_code: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Чернетка',    color: '#6c7086', bg: 'rgba(108,112,134,0.15)' },
  tentative:   { label: 'Очікується',  color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  confirmed:   { label: 'Підтверджено',color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  checked_in:  { label: 'Заселено',    color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  checked_out: { label: 'Виселено',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  cancelled:   { label: 'Скасовано',   color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
};

function GuestDetailSheet({ guest, onClose }: { guest: GuestRow; onClose: () => void }) {
  const [stays, setStays] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/guests/${guest.id}/reservations`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setStays(Array.isArray(d) ? d : (d.reservations || [])); setLoading(false); })
      .catch(() => setLoading(false));
  }, [guest.id]);

  const initials = `${guest.first_name[0] || ''}${guest.last_name[0] || ''}`.toUpperCase();

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ maxHeight: '88dvh' }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 style={{ fontSize: 17 }}>{guest.first_name} {guest.last_name}</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Avatar + stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, flexShrink: 0,
            }}>
              {initials || <User size={28} />}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{guest.first_name} {guest.last_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {guest.total_stays} перебування · {guest.total_revenue ? `${Math.round(guest.total_revenue).toLocaleString()} Kč` : ''}
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
            {guest.phone && (
              <a href={`tel:${guest.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)' }}>
                <Phone size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{guest.phone}</span>
              </a>
            )}
            {guest.email && (
              <a href={`mailto:${guest.email}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)', borderBottom: guest.country ? '1px solid var(--border-primary)' : 'none' }}>
                <Mail size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{guest.email}</span>
              </a>
            )}
            {guest.country && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <MapPin size={16} color="var(--text-tertiary)" />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {[guest.country, guest.city].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Stay history */}
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Бронювання
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} className="m-skeleton" style={{ height: 56, borderRadius: 12 }} />)}
            </div>
          ) : stays.length === 0 ? (
            <div className="m-empty" style={{ padding: 24 }}>Немає бронювань</div>
          ) : (
            stays.map(s => {
              const st = STATUS_MAP[s.status] || STATUS_MAP.draft;
              return (
                <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{s.unit_code}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {s.check_in} → {s.check_out} · {s.nights} ноч.
                  </div>
                  {s.total_price > 0 && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                      {s.total_price.toLocaleString()} Kč
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default function MobileGuests() {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestRow | null>(null);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/guests?${params}`);
      if (res.ok) {
        const d = await res.json();
        setGuests(d.guests || d || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const initials = (g: GuestRow) =>
    `${g.first_name[0] || ''}${g.last_name[0] || ''}`.toUpperCase();

  return (
    <div>
      {/* Search bar */}
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            placeholder="Ім'я, email, телефон..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 12px 10px 32px', borderRadius: 12 }}
          />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {guests.length} гостей
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowSearch(p => !p)}
            style={{ background: 'transparent', border: 'none', color: showSearch ? 'var(--accent-primary)' : 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
          >
            <Search size={16} />
          </button>
          <button
            onClick={fetchGuests}
            disabled={loading}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      {loading && guests.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="m-skeleton" style={{ height: 68, borderRadius: 14 }} />)}
        </div>
      ) : guests.length === 0 ? (
        <div className="m-empty">
          <div className="m-empty-icon">👥</div>
          <div>Гостей не знайдено</div>
        </div>
      ) : (
        guests.map(g => (
          <div
            key={g.id}
            className="m-card"
            onClick={() => setSelectedGuest(g)}
            style={{ padding: '12px 14px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700,
              }}>
                {initials(g)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-card-title">{g.first_name} {g.last_name}</div>
                <div className="m-card-subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {g.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{g.phone}</span>}
                  {g.country && <span>{g.country}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                {g.total_stays > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', padding: '2px 7px', borderRadius: 8, background: 'rgba(20,184,166,0.12)' }}>
                    {g.total_stays}×
                  </span>
                )}
                <ChevronRight size={14} color="var(--text-tertiary)" />
              </div>
            </div>
          </div>
        ))
      )}

      {/* Detail sheet */}
      {selectedGuest && (
        <GuestDetailSheet guest={selectedGuest} onClose={() => setSelectedGuest(null)} />
      )}
    </div>
  );
}
