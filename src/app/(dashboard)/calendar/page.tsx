'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import GroupBookingModal from '@/components/booking/GroupBookingModal';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Tent,
  Building2,
  TreePine,
  Plus,
  Eye,
  Edit3,
  Save,
  X,
  Loader2,
  RefreshCw,
  Users,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
} from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────
interface UnitRow {
  id: string; name: string; code: string; beds: number;
  category_type: string; category_name: string;
  unit_type_name: string; unit_type_id: string;
  building_name?: string; building_code?: string;
  zone?: string; room_status: string; cleaning_status: string;
}

interface BookingRow {
  id: string; unit_id: string; check_in: string; check_out: string;
  nights: number; adults: number; children: number;
  status: string; payment_status: string; source: string; total_price: number; currency: string;
  first_name: string; last_name: string;
  guest_email?: string; guest_phone?: string;
  unit_name: string; unit_code: string;
  category_name: string; category_type: string;
  unit_type_id?: string; unit_type_name?: string;
}

// ─── Constants ────────────────────────────────────────────
const DAY_W = 44;
const ROW_H = 40;
const GROUP_H = 32;
const HEADER_H = 52;
const AVAIL_H = 28;
const LEFT_W = 190;

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

// SOURCE_MAP is built dynamically from /api/booking-sources

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  unpaid: { label: 'Не оплачено', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '✗' },
  payment_requested: { label: 'Запит на оплату', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '✉' },
  prepaid: { label: 'Передплата', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '◓' },
  paid: { label: 'Оплачено', color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: '✓' },
};

const CLEAN_MAP: Record<string, { label: string; color: string }> = {
  clean: { label: '✓', color: '#34d399' },
  dirty: { label: '✗', color: '#f87171' },
  in_progress: { label: '⟳', color: '#fbbf24' },
};

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  glamping: { label: 'Glamping', icon: <Tent size={14} />, color: '#a78bfa' },
  resort: { label: 'Resort', icon: <Building2 size={14} />, color: '#60a5fa' },
  camping: { label: 'Camping', icon: <TreePine size={14} />, color: '#34d399' },
};

const statusColors: Record<string, string> = {
  draft: '#6c7086',
  tentative: '#fbbf24',
  confirmed: '#34d399',
  checked_in: '#60a5fa',
  checked_out: '#a78bfa',
  cancelled: '#f87171',
};

// ─── Date helpers ─────────────────────────────────────────
function getDays(start: Date, count: number): Date[] {
  const arr: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

function fmtDate(d: Date): string { return d.toISOString().split('T')[0]; }
function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isWeekend(d: Date): boolean { return d.getDay() === 0 || d.getDay() === 6; }

// ─── Main Component ──────────────────────────────────────
export default function CalendarPage() {
  // ─── State ──────
  const onMenuClick = useMobileMenu();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cleaningFilter, setCleaningFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [calPayments, setCalPayments] = useState<any[]>([]);
  const [bookingSources, setBookingSources] = useState<any[]>([]);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });

  // Modals
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // New booking form
  const [unitTypes, setUnitTypes] = useState<any[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [form, setForm] = useState({
    category: 'glamping', unitTypeId: '', unitId: '', source: 'direct',
    checkIn: '', checkOut: '', adults: 2, children: 0,
    firstName: '', lastName: '', email: '', phone: '',
    status: 'confirmed', paymentStatus: 'unpaid',
  });

  // Build dynamic source map
  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources) {
      map[s.code] = { label: s.name, color: s.color };
    }
    return map;
  }, [bookingSources]);

  const CZK_TO_EUR = 23.5;
  const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);
  const METHOD_LABELS: Record<string, string> = {
    cash: '💵 Готівка', card: '💳 Картою',
    bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура', online: '🌐 Онлайн',
  };
  const TYPE_LABELS: Record<string, string> = {
    deposit: 'Передпл.', full: 'Повна', partial: 'Частк.', refund: 'Поверн.',
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const availRef = useRef<HTMLDivElement>(null);

  // Timeline: 14 days before today → 120 days after = 134 total days
  const timelineStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const TOTAL_DAYS = 134;
  const days = useMemo(() => getDays(timelineStart, TOTAL_DAYS), [timelineStart]);
  const todayIndex = useMemo(() => days.findIndex(d => isToday(d)), [days]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ─── Fetch data ──────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [unitsRes, bookingsRes, sourcesRes, utRes, allURes] = await Promise.all([
        fetch('/api/units'),
        fetch('/api/bookings'),
        fetch('/api/booking-sources'),
        fetch('/api/unit-types'),
        fetch('/api/units'),
      ]);
      const u = await unitsRes.json();
      const b = await bookingsRes.json();
      const srcs = await sourcesRes.json();
      const uts = await utRes.json();
      const aus = await allURes.json();
      if (Array.isArray(u)) setUnits(u);
      if (Array.isArray(b)) setBookings(b);
      if (Array.isArray(srcs)) setBookingSources(srcs);
      if (Array.isArray(uts)) setUnitTypes(uts);
      if (Array.isArray(aus)) setAllUnits(aus);
    } catch (e) { console.error('Calendar fetch error:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Scroll to today on mount ──────
  useEffect(() => {
    if (!loading && scrollRef.current && todayIndex >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayIndex * DAY_W - 200);
    }
  }, [loading, todayIndex]);

  // ─── Sync scroll ──────
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    if (leftRef.current) leftRef.current.scrollTop = scrollRef.current.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = scrollRef.current.scrollLeft;
    if (availRef.current) availRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, []);

  // ─── Filter units ──────
  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.code.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && u.category_type !== categoryFilter) return false;
      if (cleaningFilter && u.cleaning_status !== cleaningFilter) return false;
      return true;
    });
  }, [units, search, categoryFilter, cleaningFilter]);

  const filteredBookings = useMemo(() => {
    let result = bookings;
    if (statusFilter) result = result.filter(b => b.status === statusFilter);
    if (paymentFilter) result = result.filter(b => b.payment_status === paymentFilter);
    return result;
  }, [bookings, statusFilter, paymentFilter]);

  // ─── Group units ──────
  const groups = useMemo(() => {
    const result: { key: string; label: string; category: string; units: UnitRow[] }[] = [];
    const cats = ['glamping', 'resort', 'camping'];
    for (const cat of cats) {
      const catUnits = filteredUnits.filter(u => u.category_type === cat);
      if (catUnits.length === 0) continue;
      if (cat === 'resort') {
        const bldgs = [...new Set(catUnits.map(u => u.building_name || 'Other'))];
        for (const b of bldgs) {
          const bUnits = catUnits.filter(u => u.building_name === b);
          result.push({ key: `resort-${b}`, label: `Resort / ${b}`, category: cat, units: bUnits });
        }
      } else if (cat === 'camping') {
        const zones = [...new Set(catUnits.map(u => u.zone || 'Other'))];
        for (const z of zones) {
          const zUnits = catUnits.filter(u => u.zone === z);
          result.push({ key: `camping-${z}`, label: `Camping / ${z}`, category: cat, units: zUnits });
        }
      } else {
        result.push({ key: cat, label: categoryConfig[cat]?.label || cat, category: cat, units: catUnits });
      }
    }
    return result;
  }, [filteredUnits]);

  // ─── Flat unit list (for row indexing) ──────
  const flatRows = useMemo(() => {
    const rows: { type: 'group'; key: string; label: string; category: string; count: number }[] | { type: 'unit'; unit: UnitRow }[] = [];
    const allRows: any[] = [];
    for (const g of groups) {
      allRows.push({ type: 'group', key: g.key, label: g.label, category: g.category, count: g.units.length });
      if (!collapsed[g.key]) {
        for (const u of g.units) allRows.push({ type: 'unit', unit: u });
      }
    }
    return allRows;
  }, [groups, collapsed]);

  // ─── Booking for a unit ──────
  const getUnitBookings = useCallback((unitId: string) => {
    return filteredBookings.filter(b => b.unit_id === unitId);
  }, [filteredBookings]);

  // ─── Booking bar style ──────
  const getBarStyle = useCallback((b: BookingRow) => {
    const ci = new Date(b.check_in + 'T00:00:00');
    const co = new Date(b.check_out + 'T00:00:00');
    const start = days[0];
    const end = days[days.length - 1];
    if (co <= start || ci > end) return null;
    const startIdx = Math.max(0, Math.round((ci.getTime() - start.getTime()) / 86400000));
    const endIdx = Math.min(days.length, Math.round((co.getTime() - start.getTime()) / 86400000));
    return { left: startIdx * DAY_W + 2, width: (endIdx - startIdx) * DAY_W - 4 };
  }, [days]);

  // ─── Count free units per day ──────
  const freePerDay = useMemo(() => {
    return days.map(day => {
      const dateStr = fmtDate(day);
      const booked = new Set(filteredBookings.filter(b => dateStr >= b.check_in && dateStr < b.check_out).map(b => b.unit_id));
      return filteredUnits.length - booked.size;
    });
  }, [days, filteredBookings, filteredUnits]);

  // ─── Toggle group ──────
  const toggleGroup = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  // ─── Scroll to today ──────
  const scrollToToday = () => {
    if (scrollRef.current && todayIndex >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayIndex * DAY_W - 200);
    }
  };

  // ─── View booking modal ──────
  const fetchCalPayments = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/payments?reservation_id=${resId}`);
      const data = await res.json();
      if (Array.isArray(data)) setCalPayments(data);
    } catch (e) { console.error('Failed to fetch payments', e); }
  }, []);

  const openBookingDetails = async (bookingId: string) => {
    try {
      const [bookRes, payRes] = await Promise.all([
        fetch(`/api/bookings/${bookingId}`),
        fetch(`/api/payments?reservation_id=${bookingId}`),
      ]);
      if (bookRes.ok) {
        const data = await bookRes.json();
        setViewBooking(data);
        setShowPayForm(false);
      }
      const payData = await payRes.json();
      if (Array.isArray(payData)) setCalPayments(payData);
    } catch (e) { console.error(e); }
  };

  // ─── Status change ──────
  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchData();
        if (viewBooking && viewBooking.id === id) {
          setViewBooking({ ...viewBooking, status: newStatus });
        }
        showToast('Статус оновлено');
      }
    } catch (e) { console.error(e); }
  };

  // ─── Open Edit ──────
  const openEditBooking = (b: BookingRow) => {
    setForm({
      category: b.category_type, unitTypeId: b.unit_type_id || '', unitId: b.unit_id,
      source: b.source, checkIn: b.check_in, checkOut: b.check_out,
      adults: b.adults, children: b.children,
      firstName: b.first_name, lastName: b.last_name,
      email: b.guest_email || '', phone: b.guest_phone || '',
      status: b.status, paymentStatus: b.payment_status || 'unpaid',
    });
    setEditBooking(b);
    setViewBooking(null);
  };

  // ─── Save Edit ──────
  const handleSaveEdit = async () => {
    if (!editBooking) return;
    setSaving(true);
    try {
      const nights = Math.max(1, Math.floor((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86400000));
      const res = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: form.unitId, check_in: form.checkIn, check_out: form.checkOut,
          nights, adults: form.adults, children: form.children,
          status: form.status, payment_status: form.paymentStatus,
          source: form.source, firstName: form.firstName, lastName: form.lastName,
          email: form.email, phone: form.phone,
        }),
      });
      if (res.ok) {
        showToast('Бронювання оновлено!');
        setEditBooking(null);
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error || 'Помилка збереження');
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ─── Create New Booking ──────
  const handleCreateBooking = async () => {
    if (!form.firstName || !form.lastName || !form.checkIn || !form.checkOut) {
      alert("Заповніть обов'язкові поля: Ім'я, Прізвище, Заїзд, Виїзд"); return;
    }
    const nights = Math.max(1, Math.floor((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86400000));
    if (nights <= 0) { alert('Дата виїзду має бути після заїзду'); return; }
    let unitId = form.unitId;
    if (!unitId) {
      const avail = allUnits.filter((u: any) => u.unit_type_id === form.unitTypeId || u.category_type === form.category);
      unitId = avail[0]?.id;
    }
    if (!unitId) { alert('Немає доступних юнітів'); return; }
    setSaving(true);
    try {
      let totalPrice = 0;
      try {
        const qRes = await fetch(`/api/pricing/quote?unitTypeId=${form.unitTypeId}&checkIn=${form.checkIn}&checkOut=${form.checkOut}&adults=${form.adults}&children=${form.children}`);
        if (qRes.ok) { const q = await qRes.json(); totalPrice = q.totalPrice || 0; }
      } catch {}
      const res = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId, checkIn: form.checkIn, checkOut: form.checkOut, nights,
          adults: form.adults, children: form.children,
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, phone: form.phone,
          status: form.status, paymentStatus: form.paymentStatus,
          source: form.source, totalPrice,
        }),
      });
      if (res.ok) {
        showToast('Бронювання створено!');
        setShowNewBooking(false);
        fetchData();
      } else {
        const d = await res.json(); alert(d.error || 'Помилка');
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ─── Cascading dropdowns ──────
  const unitTypesForCategory = useMemo(() => unitTypes.filter((ut: any) => ut.category_type === form.category), [unitTypes, form.category]);
  const unitsForType = useMemo(() => {
    if (!form.unitTypeId) return allUnits.filter((u: any) => u.category_type === form.category);
    return allUnits.filter((u: any) => u.unit_type_id === form.unitTypeId);
  }, [allUnits, form.unitTypeId, form.category]);

  // ─── Total width ──────
  const totalW = TOTAL_DAYS * DAY_W;

  if (loading) {
    return (
      <>
        <Header title="Календар" onMenuClick={onMenuClick} />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={24} className="animate-pulse" /> <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>Завантаження...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Календар" onMenuClick={onMenuClick} />
      <div className="app-content" style={{ padding: '16px 24px', paddingTop: 'calc(var(--header-height) + 16px)', display: 'grid', gridTemplateRows: 'auto 1fr', height: 'calc(100vh - 16px)', overflow: 'hidden' }}>

        {/* ─── Toolbar ───────────────────── */}
        <div style={{
          flexShrink: 0, padding: '10px 16px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', borderBottom: 'none',
          display: 'flex', flexDirection: 'column', gap: 8,
          overflow: 'hidden', boxSizing: 'border-box',
        }}>
          {/* Row 1: Month + Today + Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={scrollToToday} style={{ fontSize: 12 }}>
                Сьогодні
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => fetchData()} title="Оновити">
                <RefreshCw size={14} />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowGroupModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Users size={14} /> Групове
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ category: 'glamping', unitTypeId: unitTypesForCategory[0]?.id || '', unitId: '', source: 'direct', checkIn: '', checkOut: '', adults: 2, children: 0, firstName: '', lastName: '', email: '', phone: '', status: 'confirmed', paymentStatus: 'unpaid' }); setShowNewBooking(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Plus size={14} /> Нове бронювання
              </button>
            </div>
          </div>

          {/* Row 2: Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                className="form-input"
                placeholder="Пошук юніта..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px 6px 28px', width: 150 }}
              />
            </div>

            <select className="form-select" style={{ width: 130, fontSize: 12 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">Всі категорії</option>
              <option value="glamping">Glamping</option>
              <option value="resort">Resort</option>
              <option value="camping">Camping</option>
            </select>

            <select className="form-select" style={{ width: 130, fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Всі статуси</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            <select className="form-select" style={{ width: 150, fontSize: 12 }} value={cleaningFilter} onChange={e => setCleaningFilter(e.target.value)}>
              <option value="">🧹 Прибирання: все</option>
              <option value="clean">✓ Чисто</option>
              <option value="dirty">✗ Брудно</option>
              <option value="in_progress">⟳ Прибирається</option>
            </select>

            <select className="form-select" style={{ width: 150, fontSize: 12 }} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
              <option value="">💰 Оплата: всі</option>
              {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Calendar Grid ───────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          minWidth: 0, width: '100%',
          border: '1px solid var(--border-primary)', borderTop: '1px solid var(--border-primary)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', background: 'var(--bg-card)',
        }}>
          {/* Top section: fixed header + dates */}
          <div style={{ display: 'flex', flexShrink: 0, minWidth: 0, overflow: 'hidden' }}>
            {/* Top-left corner */}
            <div style={{
              width: LEFT_W, minWidth: LEFT_W, height: HEADER_H + AVAIL_H,
              borderRight: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Юніти ({filteredUnits.length})
              </div>
              <div style={{ height: AVAIL_H, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, borderTop: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                Вільних
              </div>
            </div>

            {/* Date headers */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div ref={headerRef} style={{ overflowX: 'hidden', overflowY: 'hidden' }}>
                {/* Date cells */}
                <div style={{ display: 'flex', width: totalW, height: HEADER_H, borderBottom: '1px solid var(--border-primary)' }}>
                  {days.map((day, i) => {
                    const isTd = isToday(day);
                    const isWknd = isWeekend(day);
                    const showMonth = i === 0 || day.getDate() === 1;
                    return (
                      <div key={i} style={{
                        width: DAY_W, minWidth: DAY_W, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', fontSize: 11,
                        borderRight: '1px solid var(--border-primary)',
                        borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                        borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                        background: isTd ? 'rgba(96, 165, 250, 0.08)' : isWknd ? 'rgba(255,255,255,0.02)' : 'transparent',
                        position: 'relative',
                      }}>
                        {showMonth && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, position: 'absolute', top: 2 }}>{MONTH_NAMES[day.getMonth()].substring(0, 3)}</div>}
                        <div style={{ fontWeight: isTd ? 800 : 600, color: isTd ? 'var(--accent-primary)' : 'var(--text-primary)', marginTop: showMonth ? 6 : 0 }}>{day.getDate()}</div>
                        <div style={{ fontSize: 9, color: isWknd ? 'var(--accent-danger)' : 'var(--text-tertiary)' }}>{DAY_NAMES[day.getDay()]}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Availability row */}
                <div style={{ display: 'flex', width: totalW, height: AVAIL_H, borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                  {days.map((day, i) => {
                    const free = freePerDay[i];
                    const isTd = isToday(day);
                    return (
                      <div key={i} style={{
                        width: DAY_W, minWidth: DAY_W, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                        color: free <= 0 ? 'var(--accent-danger)' : free <= 10 ? 'var(--accent-warning)' : 'var(--accent-success)',
                        borderRight: '1px solid var(--border-primary)',
                        borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                        borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                        background: isTd ? 'rgba(96, 165, 250, 0.08)' : 'transparent',
                      }}>
                        {Math.max(0, free)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section: left panel + scrollable grid */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minWidth: 0 }}>
            {/* Left panel */}
            <div ref={leftRef} style={{
              width: LEFT_W, minWidth: LEFT_W, overflowY: 'hidden', overflowX: 'hidden',
              borderRight: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
            }}>
              {groups.map(group => (
                <div key={group.key}>
                  {/* Group header */}
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      height: GROUP_H, display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 10px', cursor: 'pointer', background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--border-primary)', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {collapsed[group.key] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span style={{ color: categoryConfig[group.category]?.color || 'var(--text-primary)' }}>
                      {categoryConfig[group.category]?.icon}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({group.units.length})</span>
                  </div>

                  {/* Unit rows */}
                  {!collapsed[group.key] && group.units.map(unit => (
                    <div key={unit.id} style={{
                      height: ROW_H, display: 'flex', alignItems: 'center', gap: 8,
                      padding: '0 10px', borderBottom: '1px solid var(--border-primary)',
                      fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unit.name}</div>
                        {unit.beds > 0 && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{unit.beds} місць</div>}
                      </div>
                      {/* Cleaning status indicator */}
                      <div title={`Прибирання: ${unit.cleaning_status}`} style={{
                        fontSize: 12, fontWeight: 700, width: 18, textAlign: 'center',
                        color: CLEAN_MAP[unit.cleaning_status]?.color || 'var(--text-tertiary)',
                      }}>
                        {CLEAN_MAP[unit.cleaning_status]?.label || '?'}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Scrollable grid */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{ flex: 1, overflow: 'auto' }}
            >
              <div style={{ width: totalW, position: 'relative' }}>
                {groups.map(group => (
                  <div key={group.key}>
                    {/* Group spacer */}
                    <div style={{ height: GROUP_H, display: 'flex', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                      {days.map((day, i) => {
                        const isTd = isToday(day);
                        return (
                          <div key={i} style={{
                            width: DAY_W, minWidth: DAY_W, height: GROUP_H,
                            borderRight: '1px solid var(--border-primary)',
                            borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                            borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                            background: isTd ? 'rgba(96, 165, 250, 0.06)' : 'transparent',
                          }} />
                        );
                      })}
                    </div>

                    {/* Unit rows */}
                    {!collapsed[group.key] && group.units.map(unit => {
                      const unitBookings = getUnitBookings(unit.id);
                      return (
                        <div key={unit.id} style={{ height: ROW_H, position: 'relative', display: 'flex', borderBottom: '1px solid var(--border-primary)' }}>
                          {/* Day grid cells */}
                          {days.map((day, i) => {
                            const isTd = isToday(day);
                            const isWknd = isWeekend(day);
                            return (
                              <div key={i} style={{
                                width: DAY_W, minWidth: DAY_W, height: ROW_H,
                                borderRight: '1px solid var(--border-primary)',
                                borderLeft: isTd ? '2px solid var(--accent-primary)' : 'none',
                                borderRightColor: isTd ? 'var(--accent-primary)' : 'var(--border-primary)',
                                background: isTd ? 'rgba(96, 165, 250, 0.06)' : isWknd ? 'rgba(255,255,255,0.015)' : 'transparent',
                              }} />
                            );
                          })}

                          {/* Booking bars */}
                          {unitBookings.map(booking => {
                            const bar = getBarStyle(booking);
                            if (!bar) return null;
                            const bgColor = statusColors[booking.status] || '#6c7086';
                            return (
                              <div
                                key={booking.id}
                                onClick={() => openBookingDetails(booking.id)}
                                title={`${booking.first_name} ${booking.last_name} — ${sourceMap[booking.source]?.label || booking.source} ${booking.nights} н.`}
                                style={{
                                  position: 'absolute', top: 4, height: ROW_H - 8,
                                  left: bar.left, width: bar.width,
                                  background: `linear-gradient(135deg, ${bgColor}dd, ${bgColor}99)`,
                                  borderRadius: 6, display: 'flex', alignItems: 'center',
                                  padding: '0 8px', overflow: 'hidden', cursor: 'pointer',
                                  gap: 6, zIndex: 2,
                                  boxShadow: `0 1px 4px ${bgColor}44`,
                                  transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                                onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'scaleY(1.08)'; (e.target as HTMLElement).style.boxShadow = `0 2px 8px ${bgColor}66`; }}
                                onMouseLeave={e => { (e.target as HTMLElement).style.transform = ''; (e.target as HTMLElement).style.boxShadow = `0 1px 4px ${bgColor}44`; }}
                              >
                                <span style={{ fontWeight: 700, fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {booking.first_name} {booking.last_name}
                                </span>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                                  {sourceMap[booking.source]?.label || booking.source} {booking.nights} н.
                                </span>
                                {booking.payment_status && booking.payment_status !== 'paid' && (
                                  <span title={PAYMENT_STATUS_MAP[booking.payment_status]?.label || booking.payment_status} style={{
                                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                                    color: PAYMENT_STATUS_MAP[booking.payment_status]?.color || '#888',
                                    background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '1px 4px',
                                  }}>
                                    {PAYMENT_STATUS_MAP[booking.payment_status]?.icon || '●'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'var(--accent-success)', color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease' }}>
          <Check size={16} /> {toast}
        </div>
      )}

      {/* ─── View Booking Modal (same as Bookings page) ───────── */}
      {viewBooking && (
        <div className="modal-overlay" onClick={() => setViewBooking(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Бронювання</h3>
              <button className="modal-close" onClick={() => setViewBooking(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Гість</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{viewBooking.first_name} {viewBooking.last_name}</div>
                    {viewBooking.guest_email && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{viewBooking.guest_email}</div>}
                    {viewBooking.guest_phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{viewBooking.guest_phone}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Розміщення</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{viewBooking.unit_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      <span className={`badge ${STATUS_MAP[viewBooking.status]?.badge}`}>{STATUS_MAP[viewBooking.status]?.label}</span>{' '}
                      <span className="badge badge-info">{viewBooking.category_name}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Заїзд</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{viewBooking.check_in}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <ArrowRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-primary)' }}>{viewBooking.nights} н.</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Виїзд</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{viewBooking.check_out}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Гостей</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{viewBooking.adults} дор.{viewBooking.children > 0 && ` + ${viewBooking.children} діт.`}</div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Джерело</div>
                    <div style={{ marginTop: 4 }}><span className="badge" style={{ background: (sourceMap[viewBooking.source]?.color || '#6c7086') + '22', color: sourceMap[viewBooking.source]?.color || '#6c7086' }}>{sourceMap[viewBooking.source]?.label || viewBooking.source}</span></div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Тариф</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)', marginTop: 4 }}>{(viewBooking.total_price || 0).toLocaleString()} CZK</div>
                    {((viewBooking as any).commission_amount || 0) > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        <div style={{ color: '#f59e0b', fontWeight: 600 }}>Комісія: {((viewBooking as any).commission_amount || 0).toLocaleString()} CZK</div>
                        <div style={{ color: '#22c55e', fontWeight: 600 }}>Чиста ставка: {((viewBooking.total_price || 0) - ((viewBooking as any).commission_amount || 0)).toLocaleString()} CZK</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 💰 Payment Section */}
                {(() => {
                  const total = viewBooking.total_price || 0;
                  const paid = calPayments.filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
                  const remaining = Math.max(0, total - paid);
                  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                  const barColor = pct >= 100 ? '#22c55e' : pct > 0 ? '#3b82f6' : '#ef4444';
                  return (
                    <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 }}>💰 Оплата</div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Всього</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)' }}>{total.toLocaleString()} CZK</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>≈ {toEur(total)} EUR</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Оплачено</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{paid.toLocaleString()} CZK</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>≈ {toEur(paid)} EUR</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Залишок</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: remaining > 0 ? '#ef4444' : '#22c55e' }}>{remaining.toLocaleString()} CZK</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>≈ {toEur(remaining)} EUR</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: 36 }}>{pct}%</span>
                      </div>

                      {/* Transactions */}
                      {calPayments.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Транзакції</div>
                          {calPayments.map((p: any) => (
                            <div key={p.id} style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                              borderBottom: '1px solid var(--border-primary)', fontSize: 12,
                            }}>
                              <span style={{ color: 'var(--text-tertiary)', minWidth: 70 }}>{p.paid_at || '—'}</span>
                              <span style={{ fontWeight: 700, color: p.type === 'refund' ? '#ef4444' : '#22c55e', minWidth: 80 }}>
                                {p.type === 'refund' ? '-' : '+'}{p.amount.toLocaleString()} CZK
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>{METHOD_LABELS[p.method] || p.method}</span>
                              <span style={{ color: 'var(--text-tertiary)' }}>{TYPE_LABELS[p.type] || p.type}</span>
                              {p.notes && <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</span>}
                              <button
                                style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: 2, marginLeft: 'auto', flexShrink: 0 }}
                                title="Видалити"
                                onClick={async () => {
                                  if (!confirm('Видалити транзакцію?')) return;
                                  await fetch(`/api/payments/${p.id}`, { method: 'DELETE' });
                                  fetchCalPayments(viewBooking.id);
                                  fetchData();
                                  showToast('Транзакцію видалено');
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add payment form */}
                      {!showPayForm ? (
                        <button className="btn btn-sm btn-secondary" style={{ width: '100%' }} onClick={() => setShowPayForm(true)}>
                          <Plus size={14} /> Додати платіж
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input className="form-input" type="number" placeholder="Сума CZK" style={{ flex: 1, fontSize: 13 }}
                              value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                            <select className="form-select" style={{ width: 140, fontSize: 13 }} value={payForm.method}
                              onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))}>
                              <option value="cash">💵 Готівка</option>
                              <option value="card">💳 Картою</option>
                              <option value="bank_transfer">🏦 На рахунок</option>
                              <option value="invoice">📄 Фактура</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <select className="form-select" style={{ flex: 1, fontSize: 13 }} value={payForm.type}
                              onChange={e => setPayForm(p => ({ ...p, type: e.target.value }))}>
                              <option value="deposit">Передплата</option>
                              <option value="partial">Часткова</option>
                              <option value="full">Повна оплата</option>
                              <option value="refund">Повернення</option>
                            </select>
                            <input className="form-input" placeholder="Примітка" style={{ flex: 2, fontSize: 13 }}
                              value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => setShowPayForm(false)}>Скасувати</button>
                            <button className="btn btn-sm btn-primary" disabled={!payForm.amount || Number(payForm.amount) <= 0}
                              onClick={async () => {
                                await fetch('/api/payments', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reservation_id: viewBooking.id, amount: Number(payForm.amount),
                                    method: payForm.method, type: payForm.type, notes: payForm.notes || undefined,
                                  }),
                                });
                                setPayForm({ amount: '', method: 'cash', type: 'partial', notes: '' });
                                setShowPayForm(false);
                                fetchCalPayments(viewBooking.id);
                                fetchData();
                                showToast('Платіж додано!');
                              }}
                            >
                              <Save size={12} /> Зберегти
                            </button>
                          </div>

                          {/* Quick fill: remaining amount */}
                          {remaining > 0 && (
                            <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                              onClick={() => setPayForm(p => ({ ...p, amount: String(remaining), type: remaining === total ? 'full' : 'partial' }))}>
                              Заповнити залишок: {remaining.toLocaleString()} CZK
                            </button>
                          )}
                        </div>
                      )}

                      {/* payment_requested toggle */}
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className={`btn btn-sm ${viewBooking.payment_status === 'payment_requested' ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ fontSize: 11 }}
                          onClick={async () => {
                            const newSt = viewBooking.payment_status === 'payment_requested' ? 'unpaid' : 'payment_requested';
                            await fetch(`/api/bookings/${viewBooking.id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ payment_status: newSt }),
                            });
                            setViewBooking({ ...viewBooking, payment_status: newSt });
                            fetchData();
                            showToast(newSt === 'payment_requested' ? 'Запит на оплату надіслано' : 'Запит скасовано');
                          }}
                        >
                          ✉ Запит на оплату
                        </button>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Змінити статус</div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {(['confirmed', 'checked_in', 'checked_out', 'cancelled'] as const).map(st => (
                      <button key={st} className={`btn btn-sm ${viewBooking.status === st ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => changeStatus(viewBooking.id, st)}>
                        {STATUS_MAP[st].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewBooking(null)}>Закрити</button>
              {(viewBooking as any).guest_page_token && (
                <>
                  <button className="btn btn-secondary" title="Скопіювати посилання" onClick={() => {
                    const url = `${window.location.origin}/guest/${(viewBooking as any).guest_page_token}`;
                    navigator.clipboard.writeText(url).then(() => showToast('Посилання скопійовано!'));
                  }}>
                    <Copy size={14} /> Скопіювати
                  </button>
                  <button className="btn btn-secondary" style={{ color: 'var(--accent-primary)' }} onClick={() => window.open(`/guest/${(viewBooking as any).guest_page_token}`, '_blank')}>
                    <ExternalLink size={14} /> Гостьова сторінка
                  </button>
                </>
              )}
              <button className="btn btn-primary" onClick={() => openEditBooking(viewBooking)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Edit3 size={14} /> Редагувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Booking Modal ───────── */}
      {editBooking && (
        <div className="modal-overlay" onClick={() => setEditBooking(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Редагувати бронювання</h3>
              <button className="modal-close" onClick={() => setEditBooking(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Ім&apos;я *</label><input className="form-input" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Прізвище *</label><input className="form-input" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Телефон</label><input className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Заїзд *</label><input className="form-input" type="date" value={form.checkIn} onChange={e => setForm(p => ({ ...p, checkIn: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Виїзд *</label><input className="form-input" type="date" value={form.checkOut} onChange={e => setForm(p => ({ ...p, checkOut: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Дорослих</label><input className="form-input" type="number" min={1} value={form.adults} onChange={e => setForm(p => ({ ...p, adults: Number(e.target.value) }))} /></div>
                <div className="form-group"><label className="form-label">Дітей</label><input className="form-input" type="number" min={0} value={form.children} onChange={e => setForm(p => ({ ...p, children: Number(e.target.value) }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Юніт</label>
                  <select className="form-select" value={form.unitId} onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))}>
                    {unitsForType.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Джерело</label>
                  <select className="form-select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                    {bookingSources.map((s: any) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Статус</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Оплата</label>
                  <select className="form-select" value={form.paymentStatus} onChange={e => setForm(p => ({ ...p, paymentStatus: e.target.value }))}>
                    {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditBooking(null)}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Booking Modal ───────── */}
      {showNewBooking && (
        <div className="modal-overlay" onClick={() => setShowNewBooking(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Нове бронювання</h3>
              <button className="modal-close" onClick={() => setShowNewBooking(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Ім&apos;я *</label><input className="form-input" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Прізвище *</label><input className="form-input" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Телефон</label><input className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Категорія</label>
                  <select className="form-select" value={form.category} onChange={e => { const cat = e.target.value; const uts = unitTypes.filter((ut: any) => ut.category_type === cat); setForm(p => ({ ...p, category: cat, unitTypeId: uts[0]?.id || '', unitId: '' })); }}>
                    <option value="glamping">Glamping</option>
                    <option value="resort">Resort</option>
                    <option value="camping">Camping</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Тип юніта</label>
                  <select className="form-select" value={form.unitTypeId} onChange={e => setForm(p => ({ ...p, unitTypeId: e.target.value, unitId: '' }))}>
                    {unitTypesForCategory.map((ut: any) => <option key={ut.id} value={ut.id}>{ut.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Юніт</label>
                  <select className="form-select" value={form.unitId} onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))}>
                    <option value="">Автовибір</option>
                    {unitsForType.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Джерело</label>
                  <select className="form-select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                    {bookingSources.map((s: any) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Заїзд *</label><input className="form-input" type="date" value={form.checkIn} onChange={e => setForm(p => ({ ...p, checkIn: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Виїзд *</label><input className="form-input" type="date" value={form.checkOut} onChange={e => setForm(p => ({ ...p, checkOut: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Дорослих</label><input className="form-input" type="number" min={1} value={form.adults} onChange={e => setForm(p => ({ ...p, adults: Number(e.target.value) }))} /></div>
                <div className="form-group"><label className="form-label">Дітей</label><input className="form-input" type="number" min={0} value={form.children} onChange={e => setForm(p => ({ ...p, children: Number(e.target.value) }))} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewBooking(false)}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleCreateBooking} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-pulse" /> : <Plus size={14} />} Створити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Group Booking Modal ───────── */}
      <GroupBookingModal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onCreated={() => { fetchData(); showToast('Групове бронювання створено!'); }}
        bookingSources={bookingSources}
      />

      {/* Floating "Today" button – mobile only */}
      <button className="floating-btn" onClick={scrollToToday}>
        Сьогодні
      </button>
    </>
  );
}
