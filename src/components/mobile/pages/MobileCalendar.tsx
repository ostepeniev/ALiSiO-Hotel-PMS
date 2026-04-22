'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

interface UnitRow {
  id: string; name: string; code: string; category_type: string;
  building_name: string; unit_type_id: string; unit_type_name: string;
  cleaning_status: string; beds: number; zone: string;
}

interface BookingRow {
  id: string; unit_id: string; check_in: string; check_out: string;
  status: string; first_name: string; last_name: string; nights: number;
}

const COL_W = 52;
const ROW_H = 44;
const LEFT_W = 80;
const HEADER_H = 40;
const DAY_ABBR = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];

const STATUS_BG: Record<string, string> = {
  confirmed:   '#3b82f6',
  checked_in:  '#14b8a6',
  tentative:   '#f59e0b',
  checked_out: '#8b5cf6',
  draft:       '#6b7280',
};

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export default function MobileCalendar() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  // startDay: first visible date column (Monday of current week by default)
  const [startDay, setStartDay] = useState<Date>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    // go back to Monday
    const dow = t.getDay(); // 0=Sun
    t.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1));
    return t;
  });

  const DAYS = 14; // columns visible in data (render wider window)

  const days = useMemo(() => {
    return Array.from({ length: DAYS }, (_, i) => addDays(startDay, i));
  }, [startDay]);

  const today = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);
  const todayISO = toISO(today);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, bRes] = await Promise.all([
        fetch('/api/units'),
        fetch('/api/bookings?limit=500'),
      ]);
      if (uRes.ok) setUnits(await uRes.json());
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group units by building
  const groups = useMemo(() => {
    const map = new Map<string, UnitRow[]>();
    for (const u of units) {
      const key = u.building_name || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return map;
  }, [units]);

  // Flat ordered list of units (for row index lookup)
  const flatUnits = useMemo(() => {
    const arr: UnitRow[] = [];
    groups.forEach(us => arr.push(...us));
    return arr;
  }, [groups]);

  // Scroll container ref — scroll to today on mount
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayOffset = daysBetween(startDay, today);
    if (todayOffset >= 0 && todayOffset < DAYS) {
      scrollRef.current.scrollLeft = todayOffset * COL_W - 8;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  const gridHeight = flatUnits.length * ROW_H;
  const gridWidth = DAYS * COL_W;

  // Check if a booking overlaps the visible range
  const visibleBookings = useMemo(() => {
    const rangeStart = toISO(startDay);
    const rangeEnd = toISO(addDays(startDay, DAYS));
    return bookings.filter(b =>
      b.status !== 'cancelled' &&
      b.check_in < rangeEnd &&
      b.check_out > rangeStart
    );
  }, [bookings, startDay]);

  // Build Gantt spans
  type Span = { booking: BookingRow; unitIdx: number; colStart: number; colSpan: number };
  const spans = useMemo<Span[]>(() => {
    const result: Span[] = [];
    for (const b of visibleBookings) {
      const unitIdx = flatUnits.findIndex(u => u.id === b.unit_id);
      if (unitIdx < 0) continue;
      const checkIn = new Date(b.check_in + 'T00:00:00');
      const checkOut = new Date(b.check_out + 'T00:00:00');
      const colStart = Math.max(0, daysBetween(startDay, checkIn));
      const colEnd = Math.min(DAYS, daysBetween(startDay, checkOut));
      if (colEnd <= colStart) continue;
      result.push({ booking: b, unitIdx, colStart, colSpan: colEnd - colStart });
    }
    return result;
  }, [visibleBookings, flatUnits, startDay]);

  const goWeek = (dir: -1 | 1) => setStartDay(d => addDays(d, dir * 7));
  const goToday = () => setStartDay(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const dow = t.getDay();
    t.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1));
    return t;
  });

  // Month label for header
  const endDay = addDays(startDay, DAYS - 1);
  const monthLabel = startDay.getMonth() === endDay.getMonth()
    ? `${MONTH_SHORT[startDay.getMonth()]} ${startDay.getFullYear()}`
    : `${MONTH_SHORT[startDay.getMonth()]} — ${MONTH_SHORT[endDay.getMonth()]} ${endDay.getFullYear()}`;

  // 52px header + 64px bottom tabs + 12px top padding + 10px toolbar margin + 48px toolbar + 10px + 28px legend
  const gridH = 'calc(100dvh - 52px - 64px - 12px - 68px - 48px)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <button onClick={() => goWeek(-1)} style={navBtn}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{monthLabel}</span>
          <button onClick={goToday} style={todayBtn}>Сьогодні</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={fetchData} disabled={loading} style={navBtn}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
          </button>
          <button onClick={() => goWeek(1)} style={navBtn}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Gantt wrapper: left sticky col + scrollable grid */}
      <div style={{ height: gridH, overflow: 'hidden', display: 'flex', borderRadius: 14, border: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>

        {/* LEFT STICKY COLUMN */}
        <div style={{ width: LEFT_W, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-primary)', zIndex: 2 }}>
          {/* Corner cell */}
          <div style={{ height: HEADER_H, flexShrink: 0, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }} />
          {/* Unit rows */}
          <div style={{ overflowY: 'scroll', flex: 1, scrollbarWidth: 'none' } as React.CSSProperties} id="gantt-left">
            {Array.from(groups.entries()).map(([building, us]) => (
              <div key={building}>
                {/* Building group header */}
                <div style={{
                  height: 22, display: 'flex', alignItems: 'center', paddingLeft: 8,
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                  color: 'var(--text-tertiary)', background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-primary)',
                }}>
                  {building}
                </div>
                {us.map(u => (
                  <div key={u.id} style={{
                    height: ROW_H, display: 'flex', alignItems: 'center', paddingLeft: 8,
                    borderBottom: '1px solid var(--border-primary)',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', whiteSpace: 'nowrap',
                  }}>
                    {u.code || u.name}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* SCROLLABLE GRID */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}
          onScroll={e => {
            // sync left column scroll
            const el = document.getElementById('gantt-left');
            if (el) el.scrollTop = (e.target as HTMLDivElement).scrollTop;
          }}
        >
          {/* Date header row */}
          <div style={{ display: 'flex', height: HEADER_H, position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', width: gridWidth }}>
            {days.map((d, i) => {
              const iso = toISO(d);
              const isTd = iso === todayISO;
              return (
                <div key={i} style={{
                  width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  borderRight: '1px solid var(--border-primary)',
                  background: isTd ? 'rgba(20,184,166,0.15)' : undefined,
                }}>
                  <span style={{ fontSize: 9, color: isTd ? 'var(--accent-primary)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                    {DAY_ABBR[d.getDay()]}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: isTd ? 800 : 600, color: isTd ? 'var(--accent-primary)' : 'var(--text-primary)', lineHeight: 1 }}>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grid body */}
          <div style={{ position: 'relative', width: gridWidth }}>
            {/* Background grid lines */}
            {loading && units.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-tertiary)', textAlign: 'center', fontSize: 13 }}>Завантаження...</div>
            ) : (
              <>
                {/* Row stripes + column lines */}
                {Array.from(groups.entries()).map(([building, us]) => (
                  <div key={building}>
                    {/* Building group label row */}
                    <div style={{ height: 22, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', display: 'flex' }}>
                      {days.map((_, i) => (
                        <div key={i} style={{ width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border-primary)' }} />
                      ))}
                    </div>
                    {us.map(u => {
                      const uIdx = flatUnits.findIndex(f => f.id === u.id);
                      return (
                        <div key={u.id} style={{ height: ROW_H, display: 'flex', borderBottom: '1px solid var(--border-primary)', position: 'relative' }}>
                          {days.map((d, i) => {
                            const iso = toISO(d);
                            const isTd = iso === todayISO;
                            return (
                              <div key={i} style={{
                                width: COL_W, flexShrink: 0,
                                borderRight: '1px solid var(--border-primary)',
                                background: isTd ? 'rgba(20,184,166,0.07)' : undefined,
                              }} />
                            );
                          })}
                          {/* Booking spans for this unit */}
                          {spans.filter(s => s.unitIdx === uIdx).map(s => {
                            const color = STATUS_BG[s.booking.status] || '#6b7280';
                            const name = `${s.booking.first_name} ${s.booking.last_name?.[0] || ''}`;
                            return (
                              <div
                                key={s.booking.id}
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: s.colStart * COL_W + 2,
                                  width: s.colSpan * COL_W - 4,
                                  height: ROW_H - 8,
                                  borderRadius: 6,
                                  background: color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: 6,
                                  overflow: 'hidden',
                                  zIndex: 1,
                                }}
                              >
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '8px 0 0', flexShrink: 0 }}>
        {Object.entries(STATUS_BG).map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {status === 'confirmed' ? 'Підтверджено' :
               status === 'checked_in' ? 'Заселено' :
               status === 'tentative' ? 'Тент.' :
               status === 'checked_out' ? 'Виїхав' : 'Чернетка'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-secondary)', padding: 8,
  cursor: 'pointer', display: 'flex', alignItems: 'center',
};

const todayBtn: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: 'none',
  color: 'var(--text-secondary)', padding: '4px 10px',
  borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
