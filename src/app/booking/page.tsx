'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './booking.css';
import { BookingLang, BOOKING_LANG_LABELS, BOOKING_LANG_FLAGS, getBookingTranslations } from './translations';

// API base URL — configurable for subdomain deployment
// Set NEXT_PUBLIC_PMS_API_URL in .env to point to the main PMS server
// e.g. NEXT_PUBLIC_PMS_API_URL=https://pms.alisio.cz
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
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { day: 'numeric', month: 'short' });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('cs-CZ').format(n);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  // Week starts Monday (0=Mon..6=Sun)
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

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

  // Step 4 — Success
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);

  // ─── Calendar Months ──────
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
    const ci = parseDate(checkIn);
    const co = parseDate(checkOut);
    return Math.round((co.getTime() - ci.getTime()) / 86400000);
  }, [checkIn, checkOut]);

  const selectedUnitData = useMemo(() => {
    if (!availability || !selectedUnit) return null;
    return availability.units.find(u => u.id === selectedUnit) || null;
  }, [availability, selectedUnit]);

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
    return Math.max(0, total);
  }, [selectedUnitData, availability]);

  // ─── Calendar Day Click ──────
  const handleDayClick = useCallback((dateStr: string) => {
    const clickedDate = parseDate(dateStr);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    if (clickedDate < todayStart) return;

    if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) {
      // Start new selection
      setCheckIn(dateStr);
      setCheckOut(null);
      setSelectingCheckOut(true);
      setAvailability(null);
      setSelectedUnit(null);
    } else {
      // Set check-out
      if (clickedDate <= parseDate(checkIn!)) {
        // If before check-in, restart
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
    // Will be validated when availability is fetched
  }, [promoInput, t]);

  // ─── Go to Step 2 ──────
  const goToStep2 = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    await fetchAvailability();
    setStep(2);
  }, [checkIn, checkOut, fetchAvailability]);

  // ─── Go to Step 3 ──────
  const goToStep3 = useCallback(() => {
    if (!selectedUnit) return;
    setStep(3);
  }, [selectedUnit]);

  // ─── Submit Booking ──────
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
          promoCode: promoApplied || undefined,
          certificateCode: certInput || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();
      setReservation(data);
      setStep(4);
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [checkIn, checkOut, selectedUnit, adults, children, firstName, lastName, email, phone, promoApplied, certInput, t]);

  // ─── Reset ──────
  const resetForm = useCallback(() => {
    setStep(1);
    setCheckIn(null);
    setCheckOut(null);
    setSelectingCheckOut(false);
    setAdults(2);
    setChildren(0);
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
  }, []);

  // ─── Render Calendar Month ──────
  const renderMonth = (year: number, month: number) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const todayStr = fmtDate(today);

    const cells = [];
    // Empty cells before first day
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
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let rangeClass = '';
      if (checkIn && dateStr === checkIn) rangeClass = 'range-start';
      if (checkOut && dateStr === checkOut) rangeClass += ' range-end';
      if (checkIn && checkOut && dateStr > checkIn && dateStr < checkOut) rangeClass = 'in-range';
      // Preview range during selection
      if (checkIn && !checkOut && selectingCheckOut && dateStr > checkIn) {
        // Light highlight to guide user
      }

      cells.push(
        <button
          key={d}
          className={`booking-cal-day ${isPast ? 'past' : ''} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${rangeClass}`}
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

  // ─── Render ──────
  return (
    <div className="booking-page">
      {/* Header */}
      <header className="booking-header">
        <div className="booking-logo">
          <div className="booking-logo-icon">Q</div>
          <span>QA Glamping</span>
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
      </header>

      {/* Steps Indicator */}
      {step < 4 && (
        <div className="booking-steps">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`booking-step-item ${step === s ? 'active' : ''} ${step > s ? 'completed' : ''}`}
            >
              <div className="booking-step-circle">
                {step > s ? '✓' : s}
              </div>
              <div className="booking-step-label">
                {s === 1 ? t.step1Title : s === 2 ? t.step2Title : t.step3Title}
              </div>
              {s < 3 && <div className="booking-step-line" />}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="booking-container">
        {/* ═══════ STEP 1: Dates ═══════ */}
        {step === 1 && (
          <div className="booking-fade-in">
            <h1 className="booking-title">{t.step1Title}</h1>
            <p className="booking-subtitle">{t.step1Desc}</p>

            {/* Date Selection Summary */}
            <div className="booking-dates-summary">
              <div className={`booking-date-box ${!checkIn && !selectingCheckOut ? 'active' : ''}`}>
                <div className="booking-date-label">{t.checkIn}</div>
                <div className={`booking-date-value ${!checkIn ? 'placeholder' : ''}`}>
                  {checkIn ? formatDisplayDate(checkIn, lang) : t.selectCheckIn}
                </div>
              </div>
              <div className={`booking-date-box ${checkIn && selectingCheckOut ? 'active' : ''}`}>
                <div className="booking-date-label">{t.checkOut}</div>
                <div className={`booking-date-value ${!checkOut ? 'placeholder' : ''}`}>
                  {checkOut ? formatDisplayDate(checkOut, lang) : t.selectCheckOut}
                </div>
              </div>
              {nights > 0 && (
                <div className="booking-nights-box">
                  <span className="booking-nights-value">{nights}</span>
                  <span className="booking-nights-label">{t.nightsWord(nights)}</span>
                </div>
              )}
            </div>

            {/* Calendar Navigation */}
            <div className="booking-cal-top-nav">
              <button
                className="booking-cal-top-nav-btn"
                onClick={() => setCalMonthOffset(o => Math.max(0, o - 1))}
                disabled={calMonthOffset === 0}
                type="button"
              >
                ← {t.back}
              </button>
              <span className="booking-cal-top-nav-label">
                {t.monthNames[calMonths[0].month]} — {t.monthNames[calMonths[1].month]} {calMonths[1].year}
              </span>
              <button
                className="booking-cal-top-nav-btn"
                onClick={() => setCalMonthOffset(o => o + 1)}
                type="button"
              >
                {t.next} →
              </button>
            </div>

            {/* Calendar */}
            <div className="booking-calendars">
              {calMonths.map(({ year, month }) => (
                <div key={`${year}-${month}`} className="booking-cal-month">
                  <div className="booking-cal-header">
                    <span className="booking-cal-title">
                      {t.monthNames[month]} {year}
                    </span>
                  </div>

                  <div className="booking-cal-weekdays">
                    {/* Monday-first week */}
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

            {/* Scroll Forward Button */}
            <button
              className="booking-cal-forward-btn"
              onClick={() => setCalMonthOffset(o => o + 1)}
              type="button"
            >
              ↓ {t.monthNames[calMonths[1].month === 11 ? 0 : calMonths[1].month + 1]} {calMonths[1].month === 11 ? calMonths[1].year + 1 : calMonths[1].year}
            </button>

            {/* Guests */}
            <div className="booking-guests-row">
              <div className="booking-guest-control">
                <span className="booking-guest-label">{t.adults}</span>
                <div className="booking-guest-btns">
                  <button
                    className="booking-counter-btn"
                    onClick={() => setAdults(a => Math.max(1, a - 1))}
                    disabled={adults <= 1}
                    type="button"
                  >
                    −
                  </button>
                  <span className="booking-counter-value">{adults}</span>
                  <button
                    className="booking-counter-btn"
                    onClick={() => setAdults(a => Math.min(10, a + 1))}
                    disabled={adults >= 10}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="booking-guest-control">
                <span className="booking-guest-label">{t.children}</span>
                <div className="booking-guest-btns">
                  <button
                    className="booking-counter-btn"
                    onClick={() => setChildren(c => Math.max(0, c - 1))}
                    disabled={children <= 0}
                    type="button"
                  >
                    −
                  </button>
                  <span className="booking-counter-value">{children}</span>
                  <button
                    className="booking-counter-btn"
                    onClick={() => setChildren(c => Math.min(6, c + 1))}
                    disabled={children >= 6}
                    type="button"
                  >
                    +
                  </button>
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
                  onChange={e => {
                    setPromoInput(e.target.value);
                    setPromoMessage(null);
                  }}
                />
                <button className="booking-code-btn" onClick={applyPromo} type="button">
                  {t.apply}
                </button>
              </div>
              <div className="booking-code-input-group">
                <input
                  className="booking-code-input"
                  placeholder={t.certificateCode}
                  value={certInput}
                  onChange={e => setCertInput(e.target.value)}
                />
                <button
                  className="booking-code-btn"
                  onClick={() => { /* Certificate validation stub */ }}
                  type="button"
                >
                  {t.apply}
                </button>
              </div>
            </div>

            {promoMessage && (
              <div className={`booking-promo-message ${promoMessage.type}`}>
                {promoMessage.type === 'success' ? '✓' : '✗'} {promoMessage.text}
              </div>
            )}

            {/* Actions */}
            <div className="booking-actions" style={{ justifyContent: 'flex-end' }}>
              <button
                className="booking-btn-primary"
                onClick={goToStep2}
                disabled={!checkIn || !checkOut || nights < 1}
                type="button"
              >
                {t.next} →
              </button>
            </div>
          </div>
        )}

        {/* ═══════ STEP 2: Houses ═══════ */}
        {step === 2 && (
          <div className="booking-fade-in">
            <h1 className="booking-title">{t.step2Title}</h1>
            <p className="booking-subtitle">
              {checkIn && checkOut &&
                `${formatDisplayDate(checkIn, lang)} → ${formatDisplayDate(checkOut, lang)} · ${nights} ${t.nightsWord(nights)}`
              }
            </p>

            {loadingAvail ? (
              <div className="booking-loading">
                <div className="booking-spinner" />
              </div>
            ) : availability && availability.units.length > 0 ? (
              <div className="booking-houses">
                {availability.units.map(unit => (
                    <div
                      key={unit.id}
                      className={`booking-house-card ${selectedUnit === unit.id ? 'selected' : ''}`}
                    >
                      <div className="booking-house-image">🏕️</div>
                      <div className="booking-house-info">
                        <div className="booking-house-name">{unit.name}</div>
                        <div className="booking-house-desc">
                          {unit.description || unit.typeName || `Glamping house for up to ${unit.maxOccupancy} guests`}
                        </div>
                        <div className="booking-house-meta">
                          <span>👥 {t.maxGuests}: {unit.maxOccupancy}</span>
                          {unit.bedsDouble > 0 && <span>🛏️ {unit.bedsDouble} {t.bedsDouble}</span>}
                          {unit.bedsSingle > 0 && <span>🛏️ {unit.bedsSingle} {t.bedsSingle}</span>}
                        </div>
                      </div>
                      <div className="booking-house-pricing">
                        <div>
                          <div className="booking-house-price-per-night">
                            <strong>{formatPrice(unit.avgPricePerNight)}</strong> CZK{t.perNight}
                          </div>
                          <div className="booking-house-total">
                            {t.totalFor} {nights} {t.nightsWord(nights)}: <strong>{formatPrice(unit.totalPrice)} CZK</strong>
                          </div>
                          {!unit.hasPricing && (
                            <div className="booking-house-stub">⚠ {t.stubPricing}</div>
                          )}
                        </div>
                        <button
                          className={`booking-house-select-btn ${selectedUnit === unit.id ? 'selected' : ''}`}
                          onClick={() => setSelectedUnit(unit.id)}
                          type="button"
                        >
                          {selectedUnit === unit.id ? t.selected : t.select}
                        </button>
                      </div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <div className="booking-no-avail">
                <div className="booking-no-avail-icon">🏠</div>
                <h3>{t.noAvailability}</h3>
                <p>{t.noAvailabilityDesc}</p>
              </div>
            )}

            {error && (
              <div className="booking-promo-message error" style={{ marginTop: 16 }}>
                ✗ {error}
              </div>
            )}

            {/* Actions */}
            <div className="booking-actions">
              <button className="booking-btn-secondary" onClick={() => setStep(1)} type="button">
                ← {t.back}
              </button>
              <button
                className="booking-btn-primary"
                onClick={goToStep3}
                disabled={!selectedUnit}
                type="button"
              >
                {t.next} →
              </button>
            </div>
          </div>
        )}

        {/* ═══════ STEP 3: Guest Info ═══════ */}
        {step === 3 && (
          <div className="booking-fade-in">
            <h1 className="booking-title">{t.step3Title}</h1>
            <p className="booking-subtitle">{t.step3Desc}</p>

            <div className="booking-form-grid">
              {/* Form Fields */}
              <div className="booking-form-fields">
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>{t.guestInfo}</h3>

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

                <div className="booking-field">
                  <label className="booking-field-label">{t.email}</label>
                  <input
                    className="booking-field-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t.email}
                  />
                </div>

                <div className="booking-field">
                  <label className="booking-field-label">
                    {t.phone} <span className="booking-field-required">*</span>
                  </label>
                  <input
                    className="booking-field-input"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+380..."
                  />
                </div>

                <p style={{ fontSize: 11, color: 'var(--bk-text-muted)', margin: '4px 0 0' }}>
                  {t.agreeTerms}
                </p>
              </div>

              {/* Summary Sidebar */}
              <div className="booking-summary">
                <h3 className="booking-summary-title">{t.bookingSummary}</h3>

                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.house}</span>
                  <span className="booking-summary-value">{selectedUnitData?.name || '—'}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.checkIn}</span>
                  <span className="booking-summary-value">{checkIn ? formatDisplayDate(checkIn, lang) : '—'}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.checkOut}</span>
                  <span className="booking-summary-value">{checkOut ? formatDisplayDate(checkOut, lang) : '—'}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.nights}</span>
                  <span className="booking-summary-value">{nights}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.adults}</span>
                  <span className="booking-summary-value">{adults}</span>
                </div>
                {children > 0 && (
                  <div className="booking-summary-row">
                    <span className="booking-summary-label">{t.children}</span>
                    <span className="booking-summary-value">{children}</span>
                  </div>
                )}
                <div className="booking-summary-row">
                  <span className="booking-summary-label">{t.price}</span>
                  <span className="booking-summary-value">{formatPrice(selectedUnitData?.totalPrice || 0)} CZK</span>
                </div>
                {promoApplied && availability?.promoDiscount && (
                  <div className="booking-summary-row">
                    <span className="booking-summary-label booking-summary-discount">{t.discount}</span>
                    <span className="booking-summary-value booking-summary-discount">
                      −{availability.promoDiscount.discountType === 'percentage'
                        ? `${availability.promoDiscount.discountValue}%`
                        : formatPrice(availability.promoDiscount.discountValue) + ' CZK'
                      }
                    </span>
                  </div>
                )}

                <div className="booking-summary-total">
                  <span className="booking-summary-total-label">{t.total}</span>
                  <span className="booking-summary-total-value">{formatPrice(totalWithDiscount)} CZK</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="booking-promo-message error" style={{ marginTop: 16 }}>
                ✗ {error}
              </div>
            )}

            {/* Actions */}
            <div className="booking-actions">
              <button className="booking-btn-secondary" onClick={() => setStep(2)} type="button">
                ← {t.back}
              </button>
              <button
                className="booking-btn-primary"
                onClick={submitBooking}
                disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
                type="button"
              >
                {submitting ? t.processing : t.confirmBooking}
              </button>
            </div>
          </div>
        )}

        {/* ═══════ STEP 4: Success ═══════ */}
        {step === 4 && reservation && (
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
                <span>{t.house}</span>
                <span>{reservation.unitName}</span>
              </div>
              <div className="booking-success-detail-row">
                <span>{t.checkIn}</span>
                <span>{formatDisplayDate(reservation.checkIn, lang)}</span>
              </div>
              <div className="booking-success-detail-row">
                <span>{t.checkOut}</span>
                <span>{formatDisplayDate(reservation.checkOut, lang)}</span>
              </div>
              <div className="booking-success-detail-row">
                <span>{t.nights}</span>
                <span>{reservation.nights}</span>
              </div>
              {reservation.promoDiscount > 0 && (
                <div className="booking-success-detail-row">
                  <span>{t.discount}</span>
                  <span style={{ color: 'var(--bk-accent)' }}>−{formatPrice(reservation.promoDiscount)} CZK</span>
                </div>
              )}
              <div className="booking-success-detail-row">
                <span><strong>{t.total}</strong></span>
                <span><strong>{formatPrice(reservation.totalPrice)} CZK</strong></span>
              </div>
            </div>

            <button className="booking-btn-primary" onClick={resetForm} type="button">
              {t.backToStart}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="booking-footer">
        © {new Date().getFullYear()} {t.brandName} · {t.poweredBy}
      </footer>
    </div>
  );
}
