'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import SourceIcon from '@/components/ui/SourceIcon';
import MobileFilterBar from '@/components/mobile/MobileFilterBar';
import GroupBookingModal from '@/components/booking/GroupBookingModal';
import GroupViewModal from '@/components/booking/GroupViewModal';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  X,
  Save,
  Users,
  Trash2,
  Check,
  ArrowRight,
  RefreshCw,
  Loader2,
  Phone,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
interface BookingRow {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  payment_status: string;
  source: string;
  total_price: number;
  notes: string | null;
  guest_id: string;
  first_name: string;
  last_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  unit_id: string;
  unit_name: string;
  unit_code: string;
  category_id: string;
  category_name: string;
  category_type: string;
  unit_type_id: string;
  unit_type_name: string;
  group_id: string | null;
  commission_amount: number;
  guest_page_token: string | null;
  internal_notes: string | null;
  city_tax_amount: number;
  city_tax_included: number;
  city_tax_paid: string;
}

interface GroupRow {
  id: string;
  group_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_price: number;
  status: string;
  payment_status: string;
  source: string;
  first_name: string;
  last_name: string;
  building_name: string | null;
  room_count: number;
}

interface UnitTypeRow {
  id: string;
  name: string;
  code: string;
  max_adults: number;
  category_id: string;
  category_type: string;
  unit_count: number;
}

interface UnitRow {
  id: string;
  name: string;
  code: string;
  category_type: string;
  unit_type_id: string;
}

/* ================================================================
   Status / Source maps
   ================================================================ */
const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
  cancelled: { label: 'Скасовано', badge: 'badge-danger' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  unpaid: { label: 'Не оплачено', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  payment_requested: { label: 'Запит на оплату', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  prepaid: { label: 'Передплата', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  paid: { label: 'Оплачено', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
};

// SOURCE_MAP is built dynamically from /api/booking-sources

/* ================================================================
   Helpers
   ================================================================ */
function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const diff = Math.floor((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return Math.max(0, diff);
}

function emptyForm() {
  return {
    category: 'glamping',
    unitTypeId: '',
    unitId: '',
    source: 'direct',
    checkIn: '',
    checkOut: '',
    adults: 2,
    children: 0,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: '',
    commissionAmount: '',
    cityTaxAmount: '',
    cityTaxIncluded: false,
    cityTaxPaid: 'pending',
    internalNotes: '',
  };
}

/* ================================================================
   Modal
   ================================================================ */
function Modal({ open, onClose, title, children, footer, size }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'lg';
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
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

/* ================================================================
   Main
   ================================================================ */
export default function BookingsPage() {
  /* ── data ──────────────────────────────────────────── */
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [allUnits, setAllUnits] = useState<UnitRow[]>([]);
  const [bookingSources, setBookingSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Build dynamic source map from fetched sources
  const sourceMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const s of bookingSources) {
      map[s.code] = { label: s.name, color: s.color };
    }
    return map;
  }, [bookingSources]);

  /* ── filters ──────────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortCol, setSortCol] = useState<string>('check_in');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  /* ── modals ───────────────────────────────────────── */
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [viewBooking, setViewBooking] = useState<BookingRow | null>(null);
  const [editBooking, setEditBooking] = useState<BookingRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  /* ── payments + activity ──────────────────────────── */
  const [payments, setPayments] = useState<any[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', type: 'partial', notes: '' });
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const onMenuClick = useMobileMenu();

  /* ── group bookings ──────────────────────────────── */
  const [groupBookings, setGroupBookings] = useState<GroupRow[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [viewGroupId, setViewGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (gid: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // Build merged list: group headers + children interleaved with standalone bookings
  const mergedBookingRows = useMemo(() => {
    // Sort bookings first
    const sorted = [...bookings].sort((a, b) => {
      const aVal = (a as any)[sortCol] ?? '';
      const bVal = (b as any)[sortCol] ?? '';
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const rows: Array<
      | { type: 'booking'; data: BookingRow }
      | { type: 'group'; data: GroupRow }
      | { type: 'child'; data: BookingRow; groupId: string }
    > = [];
    const seenGroups = new Set<string>();
    const groupMap = new Map<string, GroupRow>();
    for (const g of groupBookings) groupMap.set(g.id, g);

    for (const b of sorted) {
      if (b.group_id && groupMap.has(b.group_id)) {
        if (!seenGroups.has(b.group_id)) {
          seenGroups.add(b.group_id);
          rows.push({ type: 'group', data: groupMap.get(b.group_id)! });
          const children = sorted.filter(bb => bb.group_id === b.group_id);
          for (const c of children) {
            rows.push({ type: 'child', data: c, groupId: b.group_id });
          }
        }
      } else {
        rows.push({ type: 'booking', data: b });
      }
    }
    for (const g of groupBookings) {
      if (!seenGroups.has(g.id)) {
        rows.push({ type: 'group', data: g });
      }
    }
    return rows;
  }, [bookings, groupBookings, sortCol, sortDir]);

  const fetchGroupBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/group-bookings');
      const data = await res.json();
      if (Array.isArray(data)) setGroupBookings(data);
    } catch (e) { console.error(e); }
  }, []);

  const CZK_TO_EUR = 23.5;
  const toEur = (czk: number) => (czk / CZK_TO_EUR).toFixed(1);

  const METHOD_LABELS: Record<string, string> = {
    cash: '💵 Готівка', card: '💳 Картою',
    bank_transfer: '🏦 На рахунок', invoice: '📄 Фактура', online: '🌐 Онлайн',
  };
  const TYPE_LABELS: Record<string, string> = {
    deposit: 'Передплата', full: 'Повна', partial: 'Часткова', refund: 'Повернення',
  };

  const fetchPayments = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/payments?reservation_id=${resId}`);
      const data = await res.json();
      if (Array.isArray(data)) setPayments(data);
    } catch (e) { console.error('Failed to fetch payments', e); }
  }, []);

  const fetchActivity = useCallback(async (resId: string) => {
    try {
      const res = await fetch(`/api/bookings/${resId}/activity`);
      const data = await res.json();
      if (Array.isArray(data)) setActivityLog(data);
    } catch { setActivityLog([]); }
  }, []);

  const openViewBooking = useCallback((b: BookingRow) => {
    setViewBooking(b);
    fetchPayments(b.id);
    fetchActivity(b.id);
    setShowPayForm(false);
  }, [fetchPayments, fetchActivity]);

  /* ── fetch bookings ───────────────────────────────── */
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (paymentFilter) params.set('payment_status', paymentFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (sourceFilter) params.set('source', sourceFilter);

      const res = await fetch(`/api/bookings?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setBookings(data);
    } catch (e) {
      console.error('Failed to fetch bookings', e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, categoryFilter, paymentFilter, dateFrom, dateTo, sourceFilter]);

  /* ── fetch ref data ───────────────────────────────── */
  useEffect(() => {
    // Load unit types and units for the booking form
    Promise.all([
      fetch('/api/unit-types').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
      fetch('/api/booking-sources').then(r => r.json()),
    ]).then(([uts, us, srcs]) => {
      if (Array.isArray(uts)) setUnitTypes(uts);
      if (Array.isArray(us)) setAllUnits(us);
      if (Array.isArray(srcs)) setBookingSources(srcs);
    });
  }, []);

  /* ── fetch on filter change ───────────────────────── */
  useEffect(() => {
    const debounce = setTimeout(() => { fetchBookings(); fetchGroupBookings(); }, 300);
    return () => clearTimeout(debounce);
  }, [fetchBookings, fetchGroupBookings]);

  /* ── cascading dropdowns ──────────────────────────── */
  const unitTypesForCategory = useMemo(() => {
    return unitTypes.filter(ut => ut.category_type === form.category);
  }, [unitTypes, form.category]);

  const unitsForType = useMemo(() => {
    if (!form.unitTypeId) return allUnits.filter(u => u.category_type === form.category);
    return allUnits.filter(u => u.unit_type_id === form.unitTypeId);
  }, [allUnits, form.unitTypeId, form.category]);

  const handleCategoryChange = (cat: string) => {
    const types = unitTypes.filter(ut => ut.category_type === cat);
    setForm(p => ({ ...p, category: cat, unitTypeId: types[0]?.id || '', unitId: '' }));
  };

  const handleUnitTypeChange = (utId: string) => {
    setForm(p => ({ ...p, unitTypeId: utId, unitId: '' }));
  };

  /* ── open new ─────────────────────────────────────── */
  const openNewBooking = () => {
    const f = emptyForm();
    const types = unitTypes.filter(ut => ut.category_type === f.category);
    f.unitTypeId = types[0]?.id || '';
    setForm(f);
    setShowNewBooking(true);
  };

  /* ── open edit ────────────────────────────────────── */
  const openEditBooking = (b: BookingRow) => {
    setForm({
      category: b.category_type,
      unitTypeId: b.unit_type_id,
      unitId: b.unit_id,
      source: b.source,
      checkIn: b.check_in,
      checkOut: b.check_out,
      adults: b.adults,
      children: b.children,
      firstName: b.first_name,
      lastName: b.last_name,
      email: b.guest_email || '',
      phone: b.guest_phone || '',
      status: b.status,
      paymentStatus: b.payment_status || 'unpaid',
      totalPrice: String(b.total_price || ''),
      commissionAmount: String((b as any).commission_amount || ''),
      cityTaxAmount: String((b as any).city_tax_amount || ''),
      cityTaxIncluded: !!(b as any).city_tax_included,
      cityTaxPaid: (b as any).city_tax_paid || 'pending',
      internalNotes: b.internal_notes || '',
    });
    setEditBooking(b);
  };

  /* ── auto-calc helpers ───────────────────────────── */
  const getSourceCommissionPct = (sourceCode: string) => {
    const src = bookingSources.find((s: any) => s.code === sourceCode);
    return src?.commission_percent || 0;
  };

  const recalcCommission = (price: string, sourceCode: string) => {
    const pct = getSourceCommissionPct(sourceCode);
    if (pct > 0 && Number(price) > 0) {
      return String(Math.round(Number(price) * pct / 100));
    }
    return '0';
  };

  const recalcCityTax = (adults: number, checkIn: string, checkOut: string) => {
    const nights = calcNights(checkIn, checkOut);
    if (nights > 0 && adults > 0) {
      return String(adults * nights * 25);
    }
    return '0';
  };

  /* ── create booking ───────────────────────────────── */
  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.checkIn || !form.checkOut) {
      alert("Будь ласка, заповніть обов'язкові поля: Ім'я, Прізвище, Заїзд, Виїзд");
      return;
    }
    const nights = calcNights(form.checkIn, form.checkOut);
    if (nights <= 0) {
      alert('Дата виїзду має бути після дати заїзду');
      return;
    }

    // Find the unit ID
    let unitId = form.unitId;
    if (!unitId && unitsForType.length > 0) {
      unitId = unitsForType[0].id;
    }
    if (!unitId) {
      alert('Не знайдено доступних юнітів');
      return;
    }

    setSaving(true);
    try {
      // Use form price or auto-calculate from pricing API
      let totalPrice = Number(form.totalPrice) || 0;
      if (!totalPrice) {
        try {
          const quoteRes = await fetch('/api/pricing/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unitTypeId: form.unitTypeId, checkIn: form.checkIn, checkOut: form.checkOut, adults: form.adults, children: form.children }),
          });
          const quoteData = await quoteRes.json();
          if (quoteRes.ok && quoteData.total > 0) totalPrice = quoteData.total;
        } catch { /* fallback to 0 */ }
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          unitId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          nights,
          adults: form.adults,
          children: form.children,
          status: form.status,
          paymentStatus: form.paymentStatus,
          source: form.source,
          totalPrice,
          commissionAmount: form.commissionAmount ? Number(form.commissionAmount) : undefined,
          cityTaxAmount: Number(form.cityTaxAmount) || 0,
          cityTaxIncluded: form.cityTaxIncluded,
          cityTaxPaid: form.cityTaxPaid,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowNewBooking(false);
        showToast(`Бронювання створено!`);
        fetchBookings();
      } else {
        alert(data.error || 'Помилка створення');
      }
    } catch {
      alert('Помилка мережі');
    } finally {
      setSaving(false);
    }
  };

  /* ── update booking ───────────────────────────────── */
  const handleSaveEdit = async () => {
    if (!editBooking) return;
    const nights = calcNights(form.checkIn, form.checkOut);

    setSaving(true);
    try {
      const totalPrice = form.totalPrice ? Number(form.totalPrice) : undefined;

      const res = await fetch(`/api/bookings/${editBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: form.unitId || undefined,
          check_in: form.checkIn,
          check_out: form.checkOut,
          nights: nights > 0 ? nights : undefined,
          adults: form.adults,
          children: form.children,
          status: form.status,
          payment_status: form.paymentStatus,
          source: form.source,
          total_price: totalPrice,
          commission_amount: form.commissionAmount ? Number(form.commissionAmount) : 0,
          city_tax_amount: Number(form.cityTaxAmount) || 0,
          city_tax_included: form.cityTaxIncluded ? 1 : 0,
          city_tax_paid: form.cityTaxPaid,
          internal_notes: form.internalNotes || null,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditBooking(null);
        showToast(`Бронювання ${editBooking.id} оновлено!`);
        fetchBookings();
      } else {
        alert(`Помилка збереження: ${data.error || 'Невідома помилка'}`);
      }
    } catch (e) {
      console.error('Save error:', e);
      alert('Помилка мережі при збереженні');
    } finally {
      setSaving(false);
    }
  };

  /* ── delete ───────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    if (!confirm(`Видалити бронювання ${id}?`)) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    showToast(`Бронювання ${id} видалено`);
    fetchBookings();
  };

  /* ── change status ────────────────────────────────── */
  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`Статус змінено на: ${STATUS_MAP[newStatus]?.label || newStatus}`);
        await fetchBookings();
        if (viewBooking && viewBooking.id === id) {
          setViewBooking({ ...viewBooking, status: newStatus });
        }
      } else {
        const data = await res.json();
        alert(`Помилка зміни статусу: ${data.error || 'Невідома помилка'}`);
      }
    } catch (e) {
      console.error('Status change error:', e);
      alert('Помилка мережі');
    }
  };

  /* ── toast ────────────────────────────────────────── */
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  /* ── render form ──────────────────────────────────── */
  const renderForm = () => (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Категорія *</label>
          <select className="form-select" value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
            <option value="glamping">Glamping</option>
            <option value="resort">Resort</option>
            <option value="camping">Camping</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Тип розміщення *</label>
          <select className="form-select" value={form.unitTypeId} onChange={(e) => handleUnitTypeChange(e.target.value)}>
            {unitTypesForCategory.map(ut => (
              <option key={ut.id} value={ut.id}>{ut.name} ({ut.unit_count})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Юніт</label>
          <select className="form-select" value={form.unitId} onChange={(e) => setForm(p => ({ ...p, unitId: e.target.value }))}>
            <option value="">Автоматично (перший вільний)</option>
            {unitsForType.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Джерело</label>
          <select className="form-select" value={form.source} onChange={(e) => {
            const newSource = e.target.value;
            const newCommission = recalcCommission(form.totalPrice, newSource);
            const src = bookingSources.find((s: any) => s.code === newSource);
            setForm(p => ({ ...p, source: newSource, commissionAmount: newCommission, cityTaxIncluded: !!src?.city_tax_included_default }));
          }}>
            {bookingSources.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
            {bookingSources.length === 0 && <option value="direct">Direct</option>}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Заїзд *</label>
          <input className="form-input" type="date" value={form.checkIn} onChange={(e) => setForm(p => ({ ...p, checkIn: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Виїзд *</label>
          <input className="form-input" type="date" value={form.checkOut} onChange={(e) => setForm(p => ({ ...p, checkOut: e.target.value }))} />
        </div>
      </div>
      {form.checkIn && form.checkOut && calcNights(form.checkIn, form.checkOut) > 0 && (
        <div style={{ fontSize: 13, color: 'var(--accent-primary)', marginBottom: 12 }}>
          📅 {calcNights(form.checkIn, form.checkOut)} ночей
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Дорослих</label>
          <input className="form-input" type="number" value={form.adults} onChange={(e) => {
            const adults = Number(e.target.value);
            setForm(p => ({ ...p, adults, cityTaxAmount: recalcCityTax(adults, p.checkIn, p.checkOut) }));
          }} min={1} max={10} />
        </div>
        <div className="form-group">
          <label className="form-label">Дітей</label>
          <input className="form-input" type="number" value={form.children} onChange={(e) => setForm(p => ({ ...p, children: Number(e.target.value) }))} min={0} max={6} />
        </div>
      </div>
      {editBooking && (
        <>
        <div className="form-group">
          <label className="form-label">Статус</label>
          <select className="form-select" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="draft">Чернетка</option>
            <option value="tentative">Очікується</option>
            <option value="confirmed">Підтверджено</option>
            <option value="checked_in">Заселено</option>
            <option value="checked_out">Виселено</option>
            <option value="cancelled">Скасовано</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Статус оплати</label>
          <select className="form-select" value={form.paymentStatus} onChange={(e) => setForm(p => ({ ...p, paymentStatus: e.target.value }))}>
            {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        </>
      )}
      {/* ── Фінанси ── */}
      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>💰 Фінанси</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Вартість (CZK)</label>
            <input className="form-input" type="number" placeholder="0" value={form.totalPrice}
              onChange={(e) => {
                const price = e.target.value;
                setForm(p => ({ ...p, totalPrice: price, commissionAmount: recalcCommission(price, p.source) }));
              }} />
          </div>
          <div className="form-group">
            <label className="form-label">Комісія (CZK){getSourceCommissionPct(form.source) > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>авто: {getSourceCommissionPct(form.source)}%</span>}</label>
            <input className="form-input" type="number" placeholder="0" value={form.commissionAmount}
              onChange={(e) => setForm(p => ({ ...p, commissionAmount: e.target.value }))} />
          </div>
        </div>
        {Number(form.totalPrice) > 0 && Number(form.commissionAmount) > 0 && (
          <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>Чиста ставка: {(Number(form.totalPrice) - Number(form.commissionAmount)).toLocaleString()} CZK</div>
        )}
      </div>
      {/* ── Туристичний збір ── */}
      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🏛️ Туристичний збір</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Сума збору (CZK){form.checkIn && form.checkOut && form.adults > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>авто: {form.adults}×{calcNights(form.checkIn, form.checkOut)}×25</span>}</label>
            <input className="form-input" type="number" placeholder="0" value={form.cityTaxAmount}
              onChange={(e) => setForm(p => ({ ...p, cityTaxAmount: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Статус збору</label>
            <select className="form-select" value={form.cityTaxPaid} onChange={(e) => setForm(p => ({ ...p, cityTaxPaid: e.target.value }))}>
              <option value="pending">⏳ Очікує оплати</option>
              <option value="paid">✅ Оплачено</option>
              <option value="exempt">🚫 Звільнено</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input type="checkbox" id="cityTaxIncluded" checked={form.cityTaxIncluded}
            onChange={(e) => setForm(p => ({ ...p, cityTaxIncluded: e.target.checked }))} />
          <label htmlFor="cityTaxIncluded" style={{ fontSize: 13, cursor: 'pointer' }}>Збір включено у вартість бронювання</label>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Дані гостя</h4>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ім&apos;я *</label>
            <input className="form-input" placeholder="Ім'я" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Прізвище *</label>
            <input className="form-input" placeholder="Прізвище" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} />
          </div>
      {/* ── Примітки ── */}
      <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📝 Примітки</h4>
        <textarea className="form-input" placeholder="Внутрішні примітки (бачить лише персонал)..."
          value={form.internalNotes} onChange={(e) => setForm(p => ({ ...p, internalNotes: e.target.value }))}
          style={{ minHeight: 60, resize: 'vertical' }} />
      </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Телефон</label>
            <input className="form-input" type="tel" placeholder="+420..." value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Header title="Бронювання" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: 'var(--accent-success)', color: '#fff',
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
          }}>
            <Check size={16} /> {toast}
          </div>
        )}

        <div className="page-header">
          <div>
            <h2 className="page-title">Бронювання</h2>
            <div className="page-subtitle">{bookings.length} записів</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => { fetchBookings(); fetchGroupBookings(); }} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-secondary" onClick={() => setShowGroupModal(true)}>
              <Building2 size={16} /> Групове
            </button>
            <button className="btn btn-primary" onClick={openNewBooking}>
              <Plus size={16} /> Нове бронювання
            </button>
          </div>
        </div>

        {/* Desktop Filters */}
        <div className="card desktop-filter-card" style={{ marginBottom: 16 }}>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <div className="search-box" style={{ minWidth: 250 }}>
              <Search size={14} className="search-icon" />
              <input
                className="form-input"
                placeholder="Пошук по гостю, юніту або ID..."
                style={{ paddingLeft: 34 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ width: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Всі статуси</option>
              <option value="draft">Чернетка</option>
              <option value="tentative">Очікується</option>
              <option value="confirmed">Підтверджено</option>
              <option value="checked_in">Заселено</option>
              <option value="checked_out">Виселено</option>
              <option value="cancelled">Скасовано</option>
            </select>
            <select className="form-select" style={{ width: 150 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Всі категорії</option>
              <option value="glamping">Glamping</option>
              <option value="resort">Resort</option>
              <option value="camping">Camping</option>
            </select>
            <select className="form-select" style={{ width: 170 }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="">Всі оплати</option>
              {Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {(search || statusFilter || categoryFilter || paymentFilter || dateFrom || dateTo || sourceFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); setPaymentFilter(''); setDateFrom(''); setDateTo(''); setSourceFilter(''); }}>
                <X size={14} /> Скинути
              </button>
            )}
          </div>
          {/* Row 2: date + source */}
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Заїзд:</span>
              <input className="form-input" type="date" style={{ width: 140 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              <input className="form-input" type="date" style={{ width: 140 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 160 }} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Всі джерела</option>
              {bookingSources.map((s: any) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Mobile Status Tabs + Filter Chips ── */}
        <MobileFilterBar
          tabs={[
            { key: '', label: 'Всі' },
            { key: 'confirmed', label: 'Підтверджено' },
            { key: 'tentative', label: 'Очікується' },
            { key: 'checked_in', label: 'Заселено' },
            { key: 'checked_out', label: 'Виселено' },
            { key: 'cancelled', label: 'Скасовано' },
          ]}
          activeTab={statusFilter}
          onTabChange={setStatusFilter}
        />

        {/* ── Mobile Search (compact) ── */}
        <div className="mobile-only" style={{ marginBottom: 10 }}>
          <div className="search-box" style={{ width: '100%' }}>
            <Search size={14} className="search-icon" />
            <input
              className="form-input"
              placeholder="Пошук..."
              style={{ paddingLeft: 34, fontSize: 13 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>


        {/* ── Desktop Table ── */}
        <div className="table-wrapper desktop-only">
          <table className="table">
            <thead>
              <tr>
                {[
                  { key: 'last_name', label: 'Гість' },
                  { key: 'unit_name', label: 'Юніт' },
                  { key: 'check_in', label: 'Заїзд' },
                  { key: 'check_out', label: 'Виїзд' },
                  { key: 'nights', label: 'Ночей' },
                  { key: 'adults', label: 'Гостей' },
                  { key: 'status', label: 'Статус' },
                  { key: 'payment_status', label: 'Оплата' },
                  { key: 'source', label: 'Джерело' },
                  { key: 'total_price', label: 'Сума' },
                  { key: '', label: '' },
                ].map(col => (
                  <th key={col.key || 'actions'} style={col.key ? { cursor: 'pointer', userSelect: 'none' } : {}}
                    onClick={() => { if (col.key) { setSortCol(col.key); setSortDir(prev => sortCol === col.key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); } }}>
                    {col.label}{sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32 }}>
                  <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
                </td></tr>
              )}
              {!loading && mergedBookingRows.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                  Нічого не знайдено
                </td></tr>
              )}
              {mergedBookingRows.map((row, idx) => {
                if (row.type === 'group') {
                  const g = row.data;
                  const isExpanded = expandedGroups.has(g.id);
                  const childCount = bookings.filter(b => b.group_id === g.id).length;
                  return (
                    <tr key={`grp-${g.id}`} style={{ background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid var(--accent-primary)' }}>
                      <td colSpan={11} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ padding: 2 }}
                            onClick={(e) => { e.stopPropagation(); toggleGroup(g.id); }}>
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                            {g.group_type === 'building' ? <Building2 size={16} /> : childCount}
                          </div>
                          <div style={{ flex: 1, minWidth: 120, cursor: 'pointer' }} onClick={() => setViewGroupId(g.id)}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{g.first_name} {g.last_name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                              {g.group_type === 'building' ? `🏨 ${g.building_name}` : `🛏️ ${childCount} кім.`}
                              {' · '}{g.check_in} → {g.check_out} · {g.nights} н.
                            </span>
                          </div>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: STATUS_MAP[g.status]?.badge ? undefined : '#6c7086' }} className={`badge ${STATUS_MAP[g.status]?.badge || 'badge-info'}`}>
                            {STATUS_MAP[g.status]?.label || g.status}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-primary)' }}>
                            {(g.total_price || 0).toLocaleString()} CZK
                          </span>
                          <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути групу"
                            onClick={(e) => { e.stopPropagation(); setViewGroupId(g.id); }}>
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (row.type === 'child') {
                  if (!expandedGroups.has(row.groupId)) return null;
                  const b = row.data;
                  return (
                    <tr key={b.id} style={{ cursor: 'pointer', background: 'rgba(99,102,241,0.03)' }}
                      onClick={() => openViewBooking(b)}>
                      <td style={{ fontWeight: 500, paddingLeft: 40 }}>↳ {b.first_name} {b.last_name}</td>
                      <td><span className="badge badge-primary">{b.unit_name}</span></td>
                      <td>{b.check_in}</td><td>{b.check_out}</td><td>{b.nights}</td>
                      <td><span className="flex items-center gap-2" style={{ fontSize: 12 }}><Users size={12} /> {b.adults}{b.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}>+{b.children}</span>}</span></td>
                      <td><span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span></td>
                      <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>{PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}</span></td>
                      <td><span className="badge" style={{ background: (sourceMap[b.source]?.color || '#6c7086') + '22', color: sourceMap[b.source]?.color || '#6c7086' }}>{sourceMap[b.source]?.label || b.source}</span></td>
                      <td><div style={{ fontWeight: 700 }}>{(b.total_price || 0).toLocaleString()} CZK</div>{(b.commission_amount || 0) > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>}</td>
                      <td><div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути" onClick={() => openViewBooking(b)}><Eye size={14} /></button>
                      </div></td>
                    </tr>
                  );
                }
                // type === 'booking' — standalone
                const b = row.data;
                return (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => openViewBooking(b)}>
                    <td style={{ fontWeight: 500 }}>{b.first_name} {b.last_name}</td>
                    <td><span className="badge badge-primary">{b.unit_name}</span></td>
                    <td>{b.check_in}</td><td>{b.check_out}</td><td>{b.nights}</td>
                    <td><span className="flex items-center gap-2" style={{ fontSize: 12 }}><Users size={12} /> {b.adults}{b.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}>+{b.children}</span>}</span></td>
                    <td><span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span></td>
                    <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>{PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}</span></td>
                    <td><span className="badge" style={{ background: (sourceMap[b.source]?.color || '#6c7086') + '22', color: sourceMap[b.source]?.color || '#6c7086' }}>{sourceMap[b.source]?.label || b.source}</span></td>
                    <td><div style={{ fontWeight: 700 }}>{(b.total_price || 0).toLocaleString()} CZK</div>{(b.commission_amount || 0) > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>}</td>
                    <td><div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути" onClick={() => openViewBooking(b)}><Eye size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Редагувати" onClick={() => openEditBooking(b)}><Edit3 size={14} /></button>
                      {b.guest_page_token && (
                        <button className="btn btn-sm btn-ghost btn-icon" title="Гостьова сторінка" style={{ color: 'var(--accent-primary)' }} onClick={() => window.open(`/guest/${b.guest_page_token}`, '_blank')}><ExternalLink size={14} /></button>
                      )}
                      <button className="btn btn-sm btn-ghost btn-icon" title="Видалити" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDelete(b.id)}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Mobile Card List (improved Phase 3) ── */}
        <div className="mobile-only">
          {loading && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
            </div>
          )}
          {!loading && mergedBookingRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
              Нічого не знайдено
            </div>
          )}
          <div className="card-list">
            {mergedBookingRows.map((row, idx) => {
              if (row.type === 'group') {
                const g = row.data;
                const isExpanded = expandedGroups.has(g.id);
                const childCount = bookings.filter(bb => bb.group_id === g.id).length;
                return (
                  <div key={`grp-m-${g.id}`} style={{
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.08)', borderLeft: '4px solid var(--accent-primary)',
                    marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="btn btn-sm btn-ghost btn-icon" style={{ padding: 2 }}
                        onClick={() => toggleGroup(g.id)}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        {g.group_type === 'building' ? <Building2 size={16} /> : childCount}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => setViewGroupId(g.id)}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{g.first_name} {g.last_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {g.check_in} → {g.check_out} · {g.nights} н. · {(g.total_price || 0).toLocaleString()} CZK
                        </div>
                      </div>
                      <span className={`badge ${STATUS_MAP[g.status]?.badge || 'badge-info'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                        {STATUS_MAP[g.status]?.label || g.status}
                      </span>
                    </div>
                  </div>
                );
              }
              if (row.type === 'child') {
                if (!expandedGroups.has(row.groupId)) return null;
                const b = row.data;
                return (
                  <div key={b.id} className="booking-card" style={{ marginLeft: 20, borderLeft: '2px solid rgba(99,102,241,0.3)' }}
                    onClick={() => openViewBooking(b)}>
                    <div className="booking-card-row">
                      <div className="booking-card-source">
                        <SourceIcon source={b.source} size={36} iconColor={sourceMap[b.source]?.color}
                          iconLetter={bookingSources.find(s => s.code === b.source)?.icon_letter} />
                      </div>
                      <div className="booking-card-main">
                        <div className="booking-card-guest">↳ {b.first_name} {b.last_name}</div>
                        <div className="booking-card-meta"><Users size={11} /> {b.adults}</div>
                      </div>
                      <div className="booking-card-date">
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.check_in?.split('-').slice(1).join('/')}</div>
                      </div>
                    </div>
                    <div className="booking-card-body">
                      <div>
                        <div className="booking-card-unit">{b.unit_name}</div>
                        <div className="booking-card-price">{(b.total_price || 0).toLocaleString()} CZK</div>
                      </div>
                      <span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span>
                    </div>
                  </div>
                );
              }
              // standalone booking
              const b = row.data;
              return (
                <div key={b.id} className="booking-card" onClick={() => openViewBooking(b)}>
                  <div className="booking-card-row">
                    <div className="booking-card-source">
                      <SourceIcon source={b.source} size={36}
                        iconColor={sourceMap[b.source]?.color}
                        iconLetter={bookingSources.find(s => s.code === b.source)?.icon_letter} />
                    </div>
                    <div className="booking-card-main">
                      <div className="booking-card-guest">{b.first_name} {b.last_name}</div>
                      <div className="booking-card-meta">
                        <Users size={11} /> {b.adults}{b.children > 0 ? `+${b.children}` : ''}
                        {b.guest_phone && <> · <Phone size={10} /> {b.guest_phone}</>}
                      </div>
                    </div>
                    <div className="booking-card-date">
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{b.check_in?.split('-').slice(1).join('/')}</div>
                    </div>
                  </div>
                  <div className="booking-card-body">
                    <div>
                      <div className="booking-card-unit">{b.unit_name}</div>
                      <div className="booking-card-unit-sub">{b.category_name || b.category_type || ''}</div>
                      <div className="booking-card-price">
                        {(b.total_price || 0).toLocaleString()} CZK
                        <span style={{ marginLeft: 6, display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: PAYMENT_STATUS_MAP[b.payment_status]?.color || '#888', background: PAYMENT_STATUS_MAP[b.payment_status]?.bg || 'rgba(128,128,128,0.1)' }}>
                          {PAYMENT_STATUS_MAP[b.payment_status]?.label || b.payment_status}
                        </span>
                      </div>
                      {(b.commission_amount || 0) > 0 && (
                        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Комісія {(b.commission_amount || 0).toLocaleString()}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div className="booking-card-date">
                        <div>{b.check_in}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>▼</div>
                        <div>{b.check_out}</div>
                      </div>
                      {(b.status === 'confirmed' || b.status === 'tentative') && (
                        <button className="mobile-action-btn" onClick={(e) => { e.stopPropagation(); changeStatus(b.id, 'checked_in'); }}>Реєстрація</button>
                      )}
                      {b.status !== 'confirmed' && b.status !== 'tentative' && (
                        <span className={`badge ${STATUS_MAP[b.status]?.badge || 'badge-info'}`}>{STATUS_MAP[b.status]?.label || b.status}</span>
                      )}
                      {b.guest_page_token && (
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-primary)' }} title="Гостьова сторінка" onClick={(e) => { e.stopPropagation(); window.open(`/guest/${b.guest_page_token}`, '_blank'); }}>
                          <ExternalLink size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* View Modal */}
        <Modal open={!!viewBooking} onClose={() => setViewBooking(null)} title={`Бронювання`} size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setViewBooking(null)}>Закрити</button>
            {viewBooking?.guest_page_token && (
              <>
                <button className="btn btn-secondary" title="Скопіювати посилання" onClick={() => {
                  const url = `${window.location.origin}/guest/${viewBooking.guest_page_token}`;
                  navigator.clipboard.writeText(url).then(() => showToast('Посилання скопійовано!'));
                }}>
                  <Copy size={14} /> Скопіювати
                </button>
                <button className="btn btn-secondary" style={{ color: 'var(--accent-primary)' }} onClick={() => window.open(`/guest/${viewBooking.guest_page_token}`, '_blank')}>
                  <ExternalLink size={14} /> Гостьова сторінка
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => { if (viewBooking) { openEditBooking(viewBooking); setViewBooking(null); } }}>
              <Edit3 size={14} /> Редагувати
            </button>
          </>}>
          {viewBooking && (
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
                  {(viewBooking.commission_amount || 0) > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <div style={{ color: '#f59e0b', fontWeight: 600 }}>Комісія: {(viewBooking.commission_amount || 0).toLocaleString()} CZK</div>
                      <div style={{ color: '#22c55e', fontWeight: 600 }}>Чиста ставка: {((viewBooking.total_price || 0) - (viewBooking.commission_amount || 0)).toLocaleString()} CZK</div>
                    </div>
                  )}
                  {(viewBooking.commission_amount || 0) === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Комісія 0</div>
                  )}
                </div>
              </div>

              {/* 🏛️ City Tax display */}
              {(() => {
                const taxAmt = (viewBooking as any).city_tax_amount || 0;
                const taxIncluded = !!(viewBooking as any).city_tax_included;
                const taxPaid = (viewBooking as any).city_tax_paid || 'pending';
                const taxStatusMap: Record<string, { label: string; color: string; icon: string }> = {
                  pending: { label: 'Очікує оплати', color: '#f59e0b', icon: '⏳' },
                  paid: { label: 'Оплачено', color: '#22c55e', icon: '✅' },
                  exempt: { label: 'Звільнено', color: '#6c7086', icon: '🚫' },
                };
                const ts = taxStatusMap[taxPaid] || taxStatusMap.pending;
                return (
                  <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏛️ Туристичний збір</div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{taxAmt.toLocaleString()} CZK</div>
                      {taxIncluded && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Включено у вартість</div>}
                    </div>
                    <span className="badge" style={{ background: ts.color + '22', color: ts.color, fontSize: 12 }}>{ts.icon} {ts.label}</span>
                  </div>
                );
              })()}
              {(() => {
                const total = viewBooking.total_price || 0;
                const paid = payments.filter(p => p.status === 'completed').reduce((s: number, p: any) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
                const remaining = Math.max(0, total - paid);
                const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                const barColor = pct >= 100 ? '#22c55e' : pct > 0 ? '#3b82f6' : '#ef4444';
                return (
                  <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 }}>💰 Оплата</div>

                    {/* Totals */}
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
                    {payments.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Транзакції</div>
                        {payments.map((p: any) => (
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
                                fetchPayments(viewBooking.id);
                                fetchBookings();
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
                              fetchPayments(viewBooking.id);
                              fetchBookings();
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

                    {/* Manual: payment_requested toggle */}
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
                          fetchBookings();
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

              {/* 📝 Internal Notes */}
              {viewBooking.internal_notes && (
                <div style={{ padding: 12, background: 'rgba(250,204,21,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(250,204,21,0.2)' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>📝 Примітки</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{viewBooking.internal_notes}</div>
                </div>
              )}

              {/* 📋 Activity Timeline */}
              {activityLog.length > 0 && (
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>📋 Історія</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activityLog.slice(0, 10).map((log: any) => {
                      const actionIcons: Record<string, string> = {
                        status_change: '🔄', payment_status_change: '💳',
                        price_change: '💰', note: '📝', created: '➕',
                      };
                      return (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontSize: 14 }}>{actionIcons[log.action] || '•'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12 }}>{log.details}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{log.created_at}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* New Booking Modal */}
        <Modal open={showNewBooking} onClose={() => setShowNewBooking(false)} title="Нове бронювання" size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowNewBooking(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Створити бронювання
            </button>
          </>}>
          {renderForm()}
        </Modal>

        {/* Edit Booking Modal */}
        <Modal open={!!editBooking} onClose={() => setEditBooking(null)} title={`Редагувати бронювання`} size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditBooking(null)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />} Зберегти зміни
            </button>
          </>}>
          {renderForm()}
        </Modal>

        {/* Group Booking Create Modal */}
        <GroupBookingModal
          open={showGroupModal}
          onClose={() => setShowGroupModal(false)}
          onCreated={() => { fetchBookings(); fetchGroupBookings(); showToast('Групове бронювання створено!'); }}
          bookingSources={bookingSources}
        />

        {/* Group View Modal */}
        <GroupViewModal
          groupId={viewGroupId}
          onClose={() => setViewGroupId(null)}
          onUpdated={() => { fetchBookings(); fetchGroupBookings(); }}
        />
      </div>
    </>
  );
}
