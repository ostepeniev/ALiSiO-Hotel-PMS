'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface UnitRow {
  id: string; name: string; code: string; category_type: string;
  building_name: string; unit_type_id: string; unit_type_name: string;
  cleaning_status: string; beds: number; zone: string;
}

interface BookingRow {
  id: string; unit_id: string; check_in: string; check_out: string;
  status: string; payment_status: string; first_name: string; last_name: string;
  nights: number; source: string; total_price: number;
}

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function getDays(center: Date, range: number): Date[] {
  const arr: Date[] = [];
  for (let i = -range; i <= range; i++) {
    const d = new Date(center);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

const statusDot: Record<string, string> = {
  confirmed: '#34d399', checked_in: '#60a5fa', tentative: '#fbbf24',
  draft: '#6c7086', checked_out: '#a78bfa',
};

export default function MobileCalendar() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const dayPickerRef = useRef<HTMLDivElement>(null);

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const days = useMemo(() => getDays(baseDate, 14), [baseDate]);
  const selectedStr = fmtDate(selectedDate);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, bRes] = await Promise.all([
        fetch('/api/units'),
        fetch('/api/bookings?category=resort'),
      ]);
      if (uRes.ok) setUnits(await uRes.json());
      if (bRes.ok) { const d = await bRes.json(); setBookings(d.bookings || d); }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll to today in day picker
  useEffect(() => {
    if (dayPickerRef.current) {
      const todayIdx = days.findIndex(d => isToday(d));
      if (todayIdx >= 0) {
        const el = dayPickerRef.current.children[todayIdx] as HTMLElement;
        if (el) el.scrollIntoView({ inline: 'center', behavior: 'smooth' });
      }
    }
  }, [days]);

  // Filter units by resort category
  const filteredUnits = useMemo(() => units.filter(u => u.category_type === 'resort'), [units]);

  // Get booking for a unit on the selected date
  const getBookingForUnit = useCallback((unitId: string) => {
    return bookings.find(b =>
      b.unit_id === unitId &&
      b.status !== 'cancelled' &&
      selectedStr >= b.check_in &&
      selectedStr < b.check_out
    );
  }, [bookings, selectedStr]);

  return (
    <div>
      {/* Month + Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => setWeekOffset(p => p - 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
          {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { setWeekOffset(0); setSelectedDate(new Date()); }} style={{ background: 'var(--bg-tertiary)', border: 'none', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Сьогодні
          </button>
          <button onClick={() => setWeekOffset(p => p + 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: 8, cursor: 'pointer' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Day Picker */}
      <div className="m-day-picker" ref={dayPickerRef}>
        {days.map((day, i) => {
          const isTd = isToday(day);
          const isActive = fmtDate(day) === selectedStr;
          return (
            <div
              key={i}
              className={`m-day-item ${isTd ? 'm-day-item-today' : ''} ${isActive ? 'm-day-item-active' : ''}`}
              onClick={() => setSelectedDate(new Date(day))}
            >
              <span className="m-day-label">{DAY_NAMES[day.getDay()]}</span>
              <span className="m-day-number">{day.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0' }}>
        <button onClick={fetchData} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* Unit Status List */}
      {loading && units.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="m-skeleton" style={{ height: 56, borderRadius: 12 }} />)}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>
            {selectedStr} · {filteredUnits.length} юнітів
          </div>
          {filteredUnits.map(unit => {
            const booking = getBookingForUnit(unit.id);
            const isFree = !booking;
            return (
              <div key={unit.id} className="m-unit-row">
                <div
                  className="m-unit-dot"
                  style={{ background: isFree ? '#34d399' : (statusDot[booking?.status || ''] || '#6c7086') }}
                />
                <div className="m-unit-name">{unit.code || unit.name}</div>
                {isFree ? (
                  <div className="m-unit-status" style={{ color: 'var(--accent-success)' }}>Вільно</div>
                ) : (
                  <div style={{ textAlign: 'right' }}>
                    <div className="m-unit-guest">{booking!.first_name} {booking!.last_name?.[0]}.</div>
                    <div className="m-unit-status">
                      {booking!.check_in} → {booking!.check_out}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
