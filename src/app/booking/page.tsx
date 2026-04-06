'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './booking.css';
import { BookingLang, BOOKING_LANG_LABELS, BOOKING_LANG_FLAGS, getBookingTranslations } from './translations';

// API base URL — configurable for subdomain deployment
const API_BASE = process.env.NEXT_PUBLIC_PMS_API_URL || '';

// ─── Types ────────────────────────────────────────────
interface UnitResult {
  id: string;
  name: string;
  code: string;
  beds: number;
  unitTypeId: string;
  typeName: string;
  typeCode: string;
  description: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
  bedsSingle: number;
  bedsDouble: number;
  bedsSofa: number;
  hasPricing: boolean;
  avgPricePerNight: number;
  totalPrice: number;
  breakdown: { date: string; dayName: string; price: number; isWeekend: boolean }[];
  currency: string;
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  units: UnitResult[];
  promoDiscount: { name: string; discountType: string; discountValue: number } | null;
  certificate: { code: string; amount: number } | null;
}

interface ReserveResponse {
  success: boolean;
  reservationId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  originalPrice: number;
  promoDiscount: number;
  certificateDiscount: number;
  currency: string;
}

// ─── Helpers ──────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatDisplayDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { day: 'numeric', month: 'short' });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('cs-CZ').format(n);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

// ─── Step labels ──────────────────────────────────────
const STEPS = [1, 2, 3, 4, 5] as const;

// ─── Main Component ──────────────────────────────────
export default function BookingPage() {
  // ─── State ──────
  const [lang, setLang] = useState<BookingLang>('uk');
  const t = useMemo(() => getBookingTranslations(lang), [lang]);

  // Language dropdown
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [step, setStep] = useState(1);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('male');

  // Calendar navigation
  const today = useMemo(() => new Date(), []);
  const [calMonthOffset, setCalMonthOffset] = useState(0);

  // Promo / Certificate
  const [promoInput, setPromoInput] = useState('');
  const [certInput, setCertInput] = useState('');
  const [promoApplied, setPromoApplied] = useState('');
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Step 2 — Availability
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  // Step 3 — Guest info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 4 — Services
  const [saunaDate, setSaunaDate] = useState<string | null>(null);
  const [saunaStartHour, setSaunaStartHour] = useState(14);
  const [saunaHours, setSaunaHours] = useState(2);
  const [saunaBroom, setSaunaBroom] = useState(0);
  const [saunaAdded, setSaunaAdded] = useState(false);
  const [breakfastItems, setBreakfastItems] = useState<Record<string, number>>({});
  const [breakfastAdded, setBreakfastAdded] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [saunaPrice, setSaunaPrice] = useState(600);
  const [broomPrice, setBroomPrice] = useState(300);
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);

  // Step 5 — Success
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);

  // Mobile summary
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Derived ──────
  const calMonths = useMemo(() => {
    const m1 = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
    const m2 = new Date(today.getFullYear(), today.getMonth() + calMonthOffset + 1, 1);
    return [
      { year: m1.getFullYear(), month: m1.getMonth() },
      { year: m2.getFullYear(), month: m2.getMonth() },
    ];
  }, [today, calMonthOffset]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86400000);
  }, [checkIn, checkOut]);

  const selectedUnitData = useMemo(() => {
    if (!availability || !selectedUnit) return null;
    return availability.units.find(u => u.id === selectedUnit) || null;
  }, [availability, selectedUnit]);

  // Service totals
  const saunaTotal = useMemo(() => {
    if (!saunaAdded) return 0;
    return saunaPrice * saunaHours + broomPrice * saunaBroom;
  }, [saunaAdded, saunaPrice, saunaHours, broomPrice, saunaBroom]);

  const breakfastTotal = useMemo(() => {
    if (!breakfastAdded) return 0;
    return menuItems.reduce((sum, item) => sum + (item.price || 0) * (breakfastItems[item.id] || 0), 0);
  }, [breakfastAdded, menuItems, breakfastItems]);

  const servicesTotal = useMemo(() => saunaTotal + breakfastTotal, [saunaTotal, breakfastTotal]);

  const totalWithDiscount = useMemo(() => {
    if (!selectedUnitData) return 0;
    let total = selectedUnitData.totalPrice;
    if (availability?.promoDiscount) {
      const pd = availability.promoDiscount;
      if (pd.discountType === 'percentage') {
        total -= Math.round(total * pd.discountValue / 100);
      } else {
        total -= pd.discountValue;
      }
    }
    if (availability?.certificate?.amount) {
      total -= availability.certificate.amount;
    }
    total += servicesTotal;
    return Math.max(0, total);
  }, [selectedUnitData, availability, servicesTotal]);

  const stepLabels = useMemo(() => [t.step1, t.step2, t.step3, t.step4, t.step5], [t]);

  // ─── Calendar Day Click ──────
  const handleDayClick = useCallback((dateStr: string) => {
    const clickedDate = parseDate(dateStr);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    if (clickedDate < todayStart) return;

    if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) {
      setCheckIn(dateStr);
      setCheckOut(null);
      setSelectingCheckOut(true);
      setAvailability(null);
      setSelectedUnit(null);
    } else {
      if (clickedDate <= parseDate(checkIn!)) {
        setCheckIn(dateStr);
        setCheckOut(null);
      } else {
        setCheckOut(dateStr);
        setSelectingCheckOut(false);
      }
    }
  }, [checkIn, checkOut, selectingCheckOut, today]);

  // ─── Check Availability ──────
  const fetchAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setLoadingAvail(true);
    setError(null);
    try {
      const params = new URLSearchParams({ checkIn, checkOut });
      if (promoApplied) params.set('promoCode', promoApplied);
      if (certInput) params.set('certificateCode', certInput);
      const res = await fetch(`${API_BASE}/api/booking/availability?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAvailability(data);
    } catch {
      setError(t.errorOccurred);
    }
    setLoadingAvail(false);
  }, [checkIn, checkOut, promoApplied, certInput, t]);

  // ─── Apply Promo ──────
  const applyPromo = useCallback(async () => {
    if (!promoInput.trim()) return;
    setPromoApplied(promoInput.trim());
    setPromoMessage({ type: 'success', text: t.promoApplied });
  }, [promoInput, t]);

  // ─── Navigation ──────
  const goToStep = useCallback((targetStep: number) => {
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToStep2 = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    await fetchAvailability();
    goToStep(2);
  }, [checkIn, checkOut, fetchAvailability, goToStep]);

  const goToStep3 = useCallback(() => {
    if (!selectedUnit) return;
    goToStep(3);
  }, [selectedUnit, goToStep]);

  // ─── Fetch Services (entering Step 4) ──────
  const fetchServices = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setServicesLoading(true);
    try {
      // Fetch breakfast menu items
      const bRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_breakfast&checkIn=${checkIn}&checkOut=${checkOut}`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setMenuItems(bData.menuItems || []);
      }
      // Fetch sauna details + booked slots
      const sRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_sauna&checkIn=${checkIn}&checkOut=${checkOut}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSaunaPrice(sData.price || 600);
        setBookedSlots(sData.bookedSlots || []);
        if (sData.addons?.length) {
          setBroomPrice(sData.addons[0]?.price || 300);
        }
      }
    } catch { /* silent */ }
    setServicesLoading(false);
    // Default sauna date to check-in
    if (checkIn && !saunaDate) setSaunaDate(checkIn);
  }, [checkIn, checkOut, saunaDate]);

  const goToStep4 = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return;
    await fetchServices();
    goToStep(4);
  }, [firstName, lastName, phone, fetchServices, goToStep]);

  // ─── Submit Booking (Step 4 → Step 5) ──────
  const submitBooking = useCallback(async () => {
    if (!checkIn || !checkOut || !selectedUnit || !firstName || !lastName || !phone) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/booking/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: selectedUnit,
          checkIn,
          checkOut,
          adults,
          children,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          gender,
          promoCode: promoApplied || undefined,
          certificateCode: certInput || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();

      // Persist sauna booking if added
      if (saunaAdded && saunaDate) {
        try {
          await fetch(`${API_BASE}/api/booking/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'book-slots',
              serviceId: 'svc_sauna',
              date: saunaDate,
              startHour: saunaStartHour,
              hours: saunaHours,
              persons: adults,
              reservationId: data.reservationId,
              addons: saunaBroom > 0 ? [{ id: 'addon_broom', quantity: saunaBroom }] : [],
            }),
          });
        } catch { /* sauna booking error — non-fatal */ }
      }

      // Persist breakfast booking if added
      if (breakfastAdded) {
        const breakfastOrder = Object.entries(breakfastItems)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (breakfastOrder.length > 0) {
          try {
            await fetch(`${API_BASE}/api/booking/services`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'book-breakfast',
                reservationId: data.reservationId,
                items: breakfastOrder,
                serviceDate: checkIn,
              }),
            });
          } catch { /* breakfast booking error — non-fatal */ }
        }
      }

      setReservation(data);
      goToStep(5);
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [checkIn, checkOut, selectedUnit, adults, children, firstName, lastName, email, phone, gender, promoApplied, certInput, t, goToStep, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, breakfastAdded, breakfastItems]);

  // ─── Reset ──────
  const resetForm = useCallback(() => {
    setStep(1);
    setCheckIn(null);
    setCheckOut(null);
    setSelectingCheckOut(false);
    setAdults(2);
    setChildren(0);
    setGender('male');
    setPromoInput('');
    setCertInput('');
    setPromoApplied('');
    setPromoMessage(null);
    setAvailability(null);
    setSelectedUnit(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setReservation(null);
    setError(null);
    setCalMonthOffset(0);
    // Service state
    setSaunaDate(null);
    setSaunaStartHour(14);
    setSaunaHours(2);
    setSaunaBroom(0);
    setSaunaAdded(false);
    setBreakfastItems({});
    setBreakfastAdded(false);
    setMenuItems([]);
  }, []);

  // ─── Render Calendar Month ──────
  const renderMonth = (year: number, month: number) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const todayStr = fmtDate(today);

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`e-${i}`} className="booking-cal-day empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = parseDate(dateStr);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const isPast = dateObj < todayStart;
      const isToday = dateStr === todayStr;

      let rangeClass = '';
      if (checkIn && dateStr === checkIn) rangeClass = 'range-start';
      if (checkOut && dateStr === checkOut) rangeClass += ' range-end';
      if (checkIn && checkOut && dateStr > checkIn && dateStr < checkOut) rangeClass = 'in-range';

      cells.push(
        <button
          key={d}
          className={`booking-cal-day ${isPast ? 'past' : ''} ${isToday ? 'today' : ''} ${rangeClass}`}
          onClick={() => !isPast && handleDayClick(dateStr)}
          disabled={isPast}
          type="button"
        >
          {d}
        </button>
      );
    }

    return cells;
  };

  // ─── Sidebar Content (reused for desktop & mobile) ──────
  const renderSidebarContent = () => (
    <>
      {/* Choice Summary */}
      <div className="booking-sidebar-card">
        <div className="booking-sidebar-title">{t.yourChoice}</div>
        
        {checkIn && checkOut ? (
          <div className="booking-sidebar-dates">
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkIn}</div>
              <div className="booking-sidebar-value">{formatDisplayDate(checkIn, lang)}</div>
            </div>
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkOut}</div>
              <div className="booking-sidebar-value">{formatDisplayDate(checkOut, lang)}</div>
            </div>
          </div>
        ) : (
          <div className="booking-sidebar-dates">
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkIn}</div>
              <div className="booking-sidebar-value" style={{ color: 'var(--bk-text-muted)' }}>—</div>
            </div>
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkOut}</div>
              <div className="booking-sidebar-value" style={{ color: 'var(--bk-text-muted)' }}>—</div>
            </div>
          </div>
        )}

        <div className="booking-sidebar-location">
          <span className="booking-sidebar-location-icon">🏕️</span>
          QA Glamping
        </div>
      </div>

      {/* House Summary */}
      <div className="booking-sidebar-card">
        <div className="booking-sidebar-unit-title">
          <span>{t.yourHouse}</span>
          {selectedUnitData && (
            <button
              className="booking-sidebar-unit-delete"
              onClick={() => setSelectedUnit(null)}
              type="button"
            >
              🗑
            </button>
          )}
        </div>

        {selectedUnitData ? (
          <>
            <div className="booking-sidebar-unit-info">
              <div className="booking-sidebar-unit-thumb">🏕️</div>
              <div className="booking-sidebar-unit-details">
                <div className="booking-sidebar-unit-name">{selectedUnitData.name}</div>
                <div className="booking-sidebar-unit-meta">
                  👥 {selectedUnitData.baseOccupancy} {t.guests} · 🏕️ QA Glamping
                </div>
              </div>
              <div className="booking-sidebar-unit-price-label">
                {formatPrice(selectedUnitData.totalPrice)} Kč
              </div>
            </div>

            <div className="booking-sidebar-guests">
              👥 {adults} {t.adults.toLowerCase()}{children > 0 ? `, ${children} ${t.children.toLowerCase()}` : ''}
            </div>

            {/* Services in sidebar */}
            {saunaAdded && (
              <div style={{ padding: '8px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🧖 {t.saunaTitle}</div>
                <div style={{ color: 'var(--bk-text-muted)' }}>
                  {saunaDate && formatShortDate(saunaDate, lang)} · {String(saunaStartHour).padStart(2, '0')}:00–{String(saunaStartHour + saunaHours).padStart(2, '0')}:00
                </div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatPrice(saunaTotal)} Kč</div>
              </div>
            )}
            {breakfastAdded && breakfastTotal > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🍳 {t.breakfastTitle}</div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatPrice(breakfastTotal)} Kč</div>
              </div>
            )}

            <div className="booking-sidebar-total-row">
              <div className="booking-sidebar-total-details">
                {nights} {t.nightsWord(nights)}, {adults} {t.adults.toLowerCase()}
                {servicesTotal > 0 && ` + ${t.additionalServices.toLowerCase()}`}
              </div>
              <div className="booking-sidebar-total-amount">
                <span className="booking-sidebar-total-currency">Kč</span>
                {formatPrice(totalWithDiscount)}
              </div>
              <div className="booking-sidebar-total-note">{t.including}</div>
            </div>
          </>
        ) : (
          <div className="booking-sidebar-placeholder">
            <span className="booking-sidebar-placeholder-icon">ⓘ</span>
            {t.housePlaceholder}
          </div>
        )}
      </div>
    </>
  );

  // ─── Render ──────
  return (
    <div className="booking-page">
      {/* ═══ Header ═══ */}
      <header className="booking-header">
        <div className="booking-logo">
          <div className="booking-logo-icon">Q</div>
          <span>{t.brandName}</span>
        </div>
        <div className="booking-header-right">
          <div className="booking-social-links">
            <a className="booking-social-link" href="#" aria-label="Instagram">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <a className="booking-social-link" href="#" aria-label="Telegram">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>
            </a>
            <a className="booking-social-link" href="#" aria-label="Facebook">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/></svg>
            </a>
          </div>
          <div className="booking-lang-dropdown" ref={langRef}>
            <button
              className="booking-lang-trigger"
              onClick={() => setLangOpen(o => !o)}
              type="button"
            >
              <span className="booking-lang-flag">{BOOKING_LANG_FLAGS[lang]}</span>
              <span className="booking-lang-code">{lang.toUpperCase()}</span>
              <span className="booking-lang-chevron">{langOpen ? '▲' : '▼'}</span>
            </button>
            {langOpen && (
              <div className="booking-lang-menu">
                {(Object.keys(BOOKING_LANG_LABELS) as BookingLang[]).map(l => (
                  <button
                    key={l}
                    className={`booking-lang-option ${lang === l ? 'active' : ''}`}
                    onClick={() => { setLang(l); setLangOpen(false); }}
                    type="button"
                  >
                    <span className="booking-lang-flag">{BOOKING_LANG_FLAGS[l]}</span>
                    <span>{BOOKING_LANG_LABELS[l]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══ Stepper ═══ */}
      {step < 5 && (
        <div className="booking-stepper">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`booking-step-item ${step === s ? 'active' : ''} ${step > s ? 'completed' : ''}`}
            >
              {i > 0 && <div className={`booking-step-line ${step > s ? 'completed' : ''}`} />}
              <div className="booking-step-circle">
                {step > s ? '✓' : s}
              </div>
              <div
                className="booking-step-label"
                onClick={() => step > s && goToStep(s)}
              >
                {stepLabels[i]}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Main Layout ═══ */}
      <div className="booking-layout">
        {/* ─── Left Sidebar (visible on desktop only) ─── */}
        {step < 5 && (
          <aside className="booking-sidebar">
            {renderSidebarContent()}
          </aside>
        )}

        {/* ─── Center Content ─── */}
        <main className="booking-main">
          {/* Mobile Cart Toggle */}
          {step < 5 && step > 1 && (
            <button
              className="booking-mobile-summary-toggle"
              onClick={() => setMobileCartOpen(true)}
              type="button"
            >
              <span>{t.bookingDetails}</span>
              <span>{selectedUnitData ? `${formatPrice(totalWithDiscount)} Kč` : '—'}</span>
            </button>
          )}

          {/* ═══════ STEP 1: Your Choice (Dates) ═══════ */}
          {step === 1 && (
            <div className="booking-fade-in">
              {/* Nav Bar */}
              <div className="booking-nav-bar">
                <button className="booking-btn-back" disabled type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep2}
                  disabled={!checkIn || !checkOut || nights < 1}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>

              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterStayData}</div>

                <div className="booking-alert warning">
                  <span className="booking-alert-icon">⚠</span>
                  {t.fillRequired}
                </div>

                {/* Location */}
                <div className="booking-field" style={{ marginBottom: 20 }}>
                  <label className="booking-field-label">{t.location} <span className="booking-field-required">*</span></label>
                  <div className="booking-field-input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
                    <span>🏕️</span> QA Glamping
                  </div>
                </div>

                {/* Date Summary Bar */}
                <div className="booking-field" style={{ marginBottom: 16 }}>
                  <label className="booking-field-label">{t.dates} <span className="booking-field-required">*</span></label>
                  <div className="booking-dates-bar">
                    <div className={`booking-dates-bar-item ${!checkIn && !selectingCheckOut ? 'active' : ''}`}>
                      <div className="booking-dates-bar-label">{t.checkIn}</div>
                      <div className={`booking-dates-bar-value ${!checkIn ? 'placeholder' : ''}`}>
                        {checkIn ? formatDisplayDate(checkIn, lang) : t.selectCheckIn}
                      </div>
                    </div>
                    <div className={`booking-dates-bar-item ${checkIn && selectingCheckOut ? 'active' : ''}`}>
                      <div className="booking-dates-bar-label">{t.checkOut}</div>
                      <div className={`booking-dates-bar-value ${!checkOut ? 'placeholder' : ''}`}>
                        {checkOut ? formatDisplayDate(checkOut, lang) : t.selectCheckOut}
                      </div>
                    </div>
                    {nights > 0 && (
                      <div className="booking-duration-badge">
                        <div>
                          <div className="booking-duration-badge-label">{t.duration}</div>
                          <div style={{ fontWeight: 600 }}>{nights} {t.nightsWord(nights)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Calendar Navigation */}
                <div className="booking-cal-nav">
                  <button
                    className="booking-cal-nav-btn"
                    onClick={() => setCalMonthOffset(o => Math.max(0, o - 1))}
                    disabled={calMonthOffset === 0}
                    type="button"
                  >
                    ‹
                  </button>
                  <div className="booking-cal-months-label">
                    <span>{t.monthNames[calMonths[0].month]} {calMonths[0].year}</span>
                    <span>{t.monthNames[calMonths[1].month]} {calMonths[1].year}</span>
                  </div>
                  <button
                    className="booking-cal-nav-btn"
                    onClick={() => setCalMonthOffset(o => o + 1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>

                {/* Calendar */}
                <div className="booking-calendars">
                  {calMonths.map(({ year, month }) => (
                    <div key={`${year}-${month}`} className="booking-cal-month">
                      <div className="booking-cal-weekdays">
                        {[1, 2, 3, 4, 5, 6, 0].map(d => (
                          <div key={d} className={`booking-cal-weekday ${d === 0 || d === 6 ? 'weekend' : ''}`}>
                            {t.dayNamesShort[d]}
                          </div>
                        ))}
                      </div>
                      <div className="booking-cal-grid">
                        {renderMonth(year, month)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Guests */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bk-border-light)' }}>
                  <div className="booking-guests-row">
                    <div className="booking-guest-control">
                      <span className="booking-guest-label">{t.adults}</span>
                      <div className="booking-guest-btns">
                        <button className="booking-counter-btn" onClick={() => setAdults(a => Math.max(1, a - 1))} disabled={adults <= 1} type="button">−</button>
                        <span className="booking-counter-value">{adults}</span>
                        <button className="booking-counter-btn" onClick={() => setAdults(a => Math.min(10, a + 1))} disabled={adults >= 10} type="button">+</button>
                      </div>
                    </div>
                    <div className="booking-guest-control">
                      <span className="booking-guest-label">{t.children}</span>
                      <div className="booking-guest-btns">
                        <button className="booking-counter-btn" onClick={() => setChildren(c => Math.max(0, c - 1))} disabled={children <= 0} type="button">−</button>
                        <span className="booking-counter-value">{children}</span>
                        <button className="booking-counter-btn" onClick={() => setChildren(c => Math.min(6, c + 1))} disabled={children >= 6} type="button">+</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Promo & Certificate */}
                <div className="booking-codes-row">
                  <div className="booking-code-input-group">
                    <input
                      className="booking-code-input"
                      placeholder={t.promoCode}
                      value={promoInput}
                      onChange={e => { setPromoInput(e.target.value); setPromoMessage(null); }}
                    />
                    <button className="booking-code-btn" onClick={applyPromo} type="button">{t.apply}</button>
                  </div>
                  <div className="booking-code-input-group">
                    <input
                      className="booking-code-input"
                      placeholder={t.certificateCode}
                      value={certInput}
                      onChange={e => setCertInput(e.target.value)}
                    />
                    <button className="booking-code-btn" onClick={() => {}} type="button">{t.apply}</button>
                  </div>
                </div>

                {promoMessage && (
                  <div className={`booking-alert ${promoMessage.type}`} style={{ marginTop: 12 }}>
                    <span className="booking-alert-icon">{promoMessage.type === 'success' ? '✓' : '✗'}</span>
                    {promoMessage.text}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ STEP 2: House Selection ═══════ */}
          {step === 2 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(1)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep3}
                  disabled={!selectedUnit}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>

              {loadingAvail ? (
                <div className="booking-loading">
                  <div className="booking-spinner" />
                </div>
              ) : availability && availability.units.length > 0 ? (
                <div>
                  {availability.units.map(unit => (
                    <div
                      key={unit.id}
                      className={`booking-house-card ${selectedUnit === unit.id ? 'selected' : ''}`}
                    >
                      {/* Photo */}
                      <div className="booking-house-photo-container">
                        <div className="booking-house-photo-placeholder">🏕️</div>
                      </div>

                      {/* Info */}
                      <div className="booking-house-info">
                        <div className="booking-house-name">{unit.name}</div>
                        <div className="booking-house-specs">
                          <div className="booking-house-spec">
                            <span className="booking-house-spec-icon">👥</span>
                            {t.totalFor} {unit.baseOccupancy} {t.guests} ({t.guestsExtra})
                          </div>
                          <div className="booking-house-spec">
                            <span className="booking-house-spec-icon">🏕️</span>
                            QA Glamping
                          </div>
                          {unit.description && (
                            <div className="booking-house-spec">
                              <span className="booking-house-spec-icon">📐</span>
                              {unit.description}
                            </div>
                          )}
                        </div>

                        <div className="booking-house-pricing">
                          {!unit.hasPricing && (
                            <div className="booking-house-stub-badge">⚠ {t.stubPricing}</div>
                          )}
                          <div className="booking-house-price">
                            <span className="booking-house-price-currency">Kč</span>
                            <span className="booking-house-price-amount">{formatPrice(unit.totalPrice)}</span>
                          </div>
                          <button
                            className={`booking-house-add-btn ${selectedUnit === unit.id ? 'selected' : ''}`}
                            onClick={() => setSelectedUnit(unit.id)}
                            type="button"
                          >
                            {selectedUnit === unit.id ? t.selectedHouse : `${t.addHouse} +`}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="booking-no-avail">
                  <div className="booking-no-avail-icon">🏠</div>
                  <h3>{t.noAvailability}</h3>
                  <p>{t.noAvailabilityDesc}</p>
                </div>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STEP 3: Personal Info ═══════ */}
          {step === 3 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(2)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep4}
                  disabled={!firstName.trim() || !lastName.trim() || !phone.trim()}
                  type="button"
                >
                  {`${t.next} ›`}
                </button>
              </div>

              <div className="booking-content-card">
                <div className="booking-content-card-title">{t.enterPersonalInfo}</div>

                <div className="booking-alert warning">
                  <span className="booking-alert-icon">⚠</span>
                  {t.fillRequired}
                </div>

                {/* Name Row */}
                <div className="booking-form-row">
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.firstName} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder={t.firstName}
                    />
                  </div>
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.lastName} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder={t.lastName}
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="booking-field" style={{ marginBottom: 16 }}>
                  <label className="booking-field-label">{t.gender} <span className="booking-field-required">*</span></label>
                  <div className="booking-gender-row">
                    {(['female', 'male', 'other'] as const).map(g => (
                      <button
                        key={g}
                        className={`booking-gender-option ${gender === g ? 'active' : ''}`}
                        onClick={() => setGender(g)}
                        type="button"
                      >
                        <div className="booking-gender-radio" />
                        {g === 'female' ? t.genderFemale : g === 'male' ? t.genderMale : t.genderOther}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phone & Email */}
                <div className="booking-form-row">
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.phone} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+420..."
                    />
                  </div>
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.email} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="example@gmail.com"
                    />
                  </div>
                </div>

                <p className="booking-terms">{t.agreeTerms}</p>
              </div>

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STEP 4: Services ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              <div className="booking-nav-bar">
                <button className="booking-btn-back" onClick={() => goToStep(3)} type="button">
                  ‹ {t.back}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="booking-btn-back"
                    onClick={() => {
                      setSaunaAdded(false);
                      setBreakfastAdded(false);
                      submitBooking();
                    }}
                    type="button"
                  >
                    {t.servicesSkip} ›
                  </button>
                  <button
                    className="booking-btn-next"
                    onClick={submitBooking}
                    disabled={submitting || (!saunaAdded && !breakfastAdded)}
                    type="button"
                  >
                    {submitting ? t.processing : `${t.confirmBooking} ›`}
                  </button>
                </div>
              </div>

              {servicesLoading ? (
                <div className="booking-loading"><div className="booking-spinner" /></div>
              ) : (
                <>
                  {/* ─── SAUNA SECTION ─── */}
                  <div className="booking-content-card">
                    <div className="booking-content-card-title">
                      🧖 {t.saunaTitle}
                    </div>
                    <p style={{ color: 'var(--bk-text-secondary)', fontSize: 14, margin: '0 0 20px' }}>
                      {t.saunaDesc}
                    </p>

                    {/* Sauna Date Selector */}
                    <div className="booking-form-row">
                      <div className="booking-field">
                        <label className="booking-field-label">{t.saunaDate} <span className="booking-field-required">*</span></label>
                        <select
                          className="booking-field-input"
                          value={saunaDate || ''}
                          onChange={e => setSaunaDate(e.target.value)}
                          style={{ cursor: 'pointer' }}
                        >
                          {checkIn && checkOut && (() => {
                            const options = [];
                            const start = parseDate(checkIn);
                            const end = parseDate(checkOut);
                            for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                              const ds = fmtDate(d);
                              options.push(
                                <option key={ds} value={ds}>{formatDisplayDate(ds, lang)}</option>
                              );
                            }
                            return options;
                          })()}
                        </select>
                      </div>
                      <div className="booking-field">
                        <label className="booking-field-label">{t.saunaTime} <span className="booking-field-required">*</span></label>
                        <select
                          className="booking-field-input"
                          value={saunaStartHour}
                          onChange={e => setSaunaStartHour(Number(e.target.value))}
                          style={{ cursor: 'pointer' }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 10).map(h => {
                            const isBooked = bookedSlots.some(s => s.date === saunaDate && s.start_time === `${String(h).padStart(2, '0')}:00`);
                            return (
                              <option key={h} value={h} disabled={isBooked}>
                                {String(h).padStart(2, '0')}:00 {isBooked ? `(✖)` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Hours & Broom */}
                    <div className="booking-form-row" style={{ marginTop: 8 }}>
                      <div className="booking-field">
                        <label className="booking-field-label">{t.saunaHours}</label>
                        <div className="booking-guest-btns" style={{ marginTop: 6 }}>
                          <button className="booking-counter-btn" onClick={() => setSaunaHours(h => Math.max(2, h - 1))} disabled={saunaHours <= 2} type="button">−</button>
                          <span className="booking-counter-value">{saunaHours}</span>
                          <button className="booking-counter-btn" onClick={() => setSaunaHours(h => Math.min(6, h + 1))} disabled={saunaHours >= 6} type="button">+</button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--bk-text-muted)', marginTop: 4 }}>{t.saunaMinHours}</div>
                      </div>
                      <div className="booking-field">
                        <label className="booking-field-label">{t.saunaBroom} 🧹</label>
                        <div className="booking-guest-btns" style={{ marginTop: 6 }}>
                          <button className="booking-counter-btn" onClick={() => setSaunaBroom(b => Math.max(0, b - 1))} disabled={saunaBroom <= 0} type="button">−</button>
                          <span className="booking-counter-value">{saunaBroom}</span>
                          <button className="booking-counter-btn" onClick={() => setSaunaBroom(b => Math.min(5, b + 1))} disabled={saunaBroom >= 5} type="button">+</button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--bk-text-muted)', marginTop: 4 }}>{formatPrice(broomPrice)} Kč / шт</div>
                      </div>
                    </div>

                    {/* Sauna Price Summary */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, padding: '16px 0', borderTop: '1px solid var(--bk-border-light)' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>
                          {saunaHours} × {formatPrice(saunaPrice)} {t.saunaPerHour} = {formatPrice(saunaPrice * saunaHours)} Kč
                        </div>
                        {saunaBroom > 0 && (
                          <div style={{ fontSize: 13, color: 'var(--bk-text-secondary)' }}>
                            + {saunaBroom} × {formatPrice(broomPrice)} Kč ({t.saunaBroom}) = {formatPrice(broomPrice * saunaBroom)} Kč
                          </div>
                        )}
                      </div>
                      <button
                        className={`booking-house-add-btn ${saunaAdded ? 'selected' : ''}`}
                        onClick={() => setSaunaAdded(prev => !prev)}
                        type="button"
                      >
                        {saunaAdded ? `✓ ${t.saunaAddToBooking}` : `${t.saunaAddToBooking} +`}
                      </button>
                    </div>

                    {saunaAdded && (
                      <div className="booking-alert success" style={{ marginTop: 8 }}>
                        <span className="booking-alert-icon">✓</span>
                        {saunaDate && `${formatDisplayDate(saunaDate, lang)}`}, {String(saunaStartHour).padStart(2, '0')}:00 — {String(saunaStartHour + saunaHours).padStart(2, '0')}:00 · <strong>{formatPrice(saunaTotal)} Kč</strong>
                      </div>
                    )}
                  </div>

                  {/* ─── BREAKFAST SECTION ─── */}
                  <div className="booking-content-card">
                    <div className="booking-content-card-title">
                      🍳 {t.breakfastTitle}
                    </div>
                    <p style={{ color: 'var(--bk-text-secondary)', fontSize: 14, margin: '0 0 20px' }}>
                      {t.breakfastDesc}
                    </p>

                    {menuItems.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {menuItems.map(item => {
                          const localizedName = lang === 'en' ? item.nameEn : lang === 'cs' ? item.nameCs : lang === 'de' ? item.nameDe : item.name;
                          const qty = breakfastItems[item.id] || 0;
                          return (
                            <div key={item.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: 16, background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-sm)',
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>{localizedName || item.name}</div>
                                {item.description && (
                                  <div style={{ fontSize: 12, color: 'var(--bk-text-muted)', marginTop: 2 }}>
                                    {item.description}
                                  </div>
                                )}
                                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: 'var(--bk-text)' }}>
                                  {formatPrice(item.price)} Kč {t.breakfastPerPerson}
                                </div>
                              </div>
                              <div className="booking-guest-btns">
                                <button className="booking-counter-btn" onClick={() => setBreakfastItems(prev => ({ ...prev, [item.id]: Math.max(0, qty - 1) }))} disabled={qty <= 0} type="button">−</button>
                                <span className="booking-counter-value">{qty}</span>
                                <button className="booking-counter-btn" onClick={() => setBreakfastItems(prev => ({ ...prev, [item.id]: Math.min(20, qty + 1) }))} disabled={qty >= 20} type="button">+</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--bk-text-muted)', fontSize: 13 }}>{t.servicesEmpty}</p>
                    )}

                    {/* Breakfast add button */}
                    {Object.values(breakfastItems).some(v => v > 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '12px 0', borderTop: '1px solid var(--bk-border-light)' }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>
                          {t.serviceTotal}: {formatPrice(
                            menuItems.reduce((sum, item) => sum + (item.price || 0) * (breakfastItems[item.id] || 0), 0)
                          )} Kč
                        </div>
                        <button
                          className={`booking-house-add-btn ${breakfastAdded ? 'selected' : ''}`}
                          onClick={() => setBreakfastAdded(prev => !prev)}
                          type="button"
                        >
                          {breakfastAdded ? `✓ ${t.breakfastAddToBooking}` : `${t.breakfastAddToBooking} +`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Services Total */}
                  {servicesTotal > 0 && (
                    <div className="booking-alert info" style={{ marginTop: 8 }}>
                      <span className="booking-alert-icon">💰</span>
                      {t.serviceTotal}: <strong>{formatPrice(servicesTotal)} Kč</strong>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STEP 5: Success ═══════ */}
          {step === 5 && reservation && (
            <div className="booking-fade-in booking-success">
              <div className="booking-success-icon">✓</div>
              <h2>{t.bookingSuccess}</h2>
              <p>{t.bookingSuccessDesc}</p>
              <p style={{ color: 'var(--bk-accent)', fontWeight: 600, fontSize: 13 }}>
                {t.weWillContact}
              </p>

              <div className="booking-success-id">
                {t.bookingId}: <strong>{reservation.reservationId}</strong>
              </div>

              <div className="booking-success-details">
                <div className="booking-success-detail-row">
                  <span>{t.houseName}</span>
                  <span>{reservation.unitName}</span>
                </div>
                <div className="booking-success-detail-row">
                  <span>{t.checkIn}</span>
                  <span>{formatShortDate(reservation.checkIn, lang)}</span>
                </div>
                <div className="booking-success-detail-row">
                  <span>{t.checkOut}</span>
                  <span>{formatShortDate(reservation.checkOut, lang)}</span>
                </div>
                <div className="booking-success-detail-row">
                  <span>{t.nights}</span>
                  <span>{reservation.nights}</span>
                </div>
                {reservation.promoDiscount > 0 && (
                  <div className="booking-success-detail-row">
                    <span>{t.discount}</span>
                    <span style={{ color: 'var(--bk-accent)' }}>−{formatPrice(reservation.promoDiscount)} Kč</span>
                  </div>
                )}
                <div className="booking-success-detail-row">
                  <span><strong>{t.total}</strong></span>
                  <span><strong>{formatPrice(reservation.totalPrice)} Kč</strong></span>
                </div>
              </div>

              <button className="booking-btn-next" onClick={resetForm} type="button" style={{ marginTop: 16 }}>
                {t.backToStart}
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ═══ Mobile Cart Overlay ═══ */}
      {mobileCartOpen && (
        <div className="booking-mobile-summary-overlay" onClick={() => setMobileCartOpen(false)}>
          <div className="booking-mobile-summary-content" onClick={e => e.stopPropagation()}>
            <button className="booking-mobile-summary-close" onClick={() => setMobileCartOpen(false)} type="button">
              ‹ {t.back}
            </button>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <footer className="booking-footer">
        © {new Date().getFullYear()} {t.brandName} · {t.poweredBy}
      </footer>
    </div>
  );
}
