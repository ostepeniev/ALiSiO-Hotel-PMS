'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './booking-v3.css';
import { BookingLang, BOOKING_LANG_LABELS, BOOKING_LANG_FLAGS, getBookingTranslations } from './translations';

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_PMS_API_URL || '';

// ─── Types ───
interface UnitResult {
  id: string;
  name: string;
  code: string;
  beds: number;
  unitTypeId: string;
  typeName: string;
  typeCode: string;
  description: string;
  photos: string[];
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
  avgPricePerNight: number;
  totalPrice: number;
  currency: string;
  extraPersonCharge: number;
  petAllowed: boolean;
  petCharge: number;
  amenities: { icon: string; name: string }[];
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  units: UnitResult[];
}

interface ReserveResponse {
  success: boolean;
  reservationId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  currency: string;
}

// ─── Helpers ───
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatDisplayDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatFullDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('cs-CZ').format(n).replace(',', ' ');
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

interface DesignConfig {
  theme?: string;
  primary_color?: string;
  button_style?: string;
  show_shadow?: boolean;
}

export default function BookingV3({ siteId, siteSlug, thankYouUrl, design, isPreview }: { siteId?: string, siteSlug?: string, thankYouUrl?: string, design?: DesignConfig, isPreview?: boolean }) {
  // ─── State ───
  const [isMounted, setIsMounted] = useState(false);
  const [lang, setLang] = useState<BookingLang>('uk');
  const t = useMemo(() => getBookingTranslations(lang), [lang]);
  const [step, setStep] = useState(1);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [busyDates, setBusyDates] = useState<Set<string>>(new Set());
  const [socialProof, setSocialProof] = useState<{ viewers: number, lastBooking?: string } | null>(null);
  const [waitlistStatus, setWaitlistStatus] = useState<'none' | 'submitting' | 'success'>('none');
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);

  // Pre-select unit from query param
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);

      const payStatus = params.get('payment_status');
      const resId = params.get('res_id');
      if (payStatus === 'success' && resId) {
        fetch(`${API_BASE}/api/booking/reserve/${resId}`)
          .then(r => r.json())
          .then(data => {
            if (data.reservationId) {
              setReservation(data);
              setStep(6);
            }
          })
          .catch(err => console.error('Fetch res error:', err));
      }

      const uId = params.get('unitId');
      if (uId) {
        // Store pre-selected unit for matching after availability loads
        (window as any)._preselectedUnit = uId;
      }

      const l = params.get('lang');
      if (l && ['uk', 'en', 'cs', 'de'].includes(l)) {
        setLang(l as BookingLang);
      }

      // Auto-fill dates from URL
      const urlIn = params.get('checkin') || params.get('check_in');
      const urlOut = params.get('checkout') || params.get('check_out');
      const urlAdults = params.get('adults');
      const urlKids = params.get('kids');

      if (urlIn) setCheckIn(urlIn);
      if (urlOut) setCheckOut(urlOut);
      if (urlAdults) setAdults(parseInt(urlAdults, 10) || 2);
      if (urlKids) setKids(parseInt(urlKids, 10) || 0);

      // Pre-fill from localStorage
      const savedGuest = localStorage.getItem('alisio_guest_data');
      if (savedGuest) {
        try {
          const g = JSON.parse(savedGuest);
          setFirstName(g.firstName || '');
          setLastName(g.lastName || '');
          setEmail(g.email || '');
          setPhone(g.phone || '');
        } catch (e) { /* ignore */ }
      }

      // Simulation: Social Proof
      const v = Math.floor(Math.random() * 6) + 3;
      const hours = Math.floor(Math.random() * 12) + 1;
      setSocialProof({
        viewers: v,
        lastBooking: hours < 5 ? `${hours} ${hours === 1 ? 'годину' : 'години'} тому` : 'сьогодні вранці'
      });
    }
  }, []);

  // Fetch busy dates when month changes
  useEffect(() => {
    if (!isMounted) return;
    const fetchBusyDates = async () => {
      try {
        const date = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const res = await fetch(`${API_BASE}/api/widget/calendar?month=${monthStr}${siteId ? `&siteId=${siteId}` : ''}${siteSlug ? `&siteSlug=${siteSlug}` : ''}`);
        const data = await res.json();
        if (data.days) {
          const busy = new Set<string>();
          data.days.forEach((d: any) => {
            if (d.status === 'booked') busy.add(d.date);
          });
          setBusyDates(busy);
        }
      } catch (e) { console.error('Fetch busy dates error:', e); }
    };
    fetchBusyDates();
  }, [calMonthOffset, isMounted, siteId, siteSlug]);

  // Auto-fetch availability when unitId is pre-selected via URL
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (!isMounted || autoFetchedRef.current) return;
    const pre = typeof window !== 'undefined' ? (window as any)._preselectedUnit : null;
    if (!pre) return;

    autoFetchedRef.current = true;

    // Read dates directly from URL (state may not be updated yet due to React batching)
    const urlParams = new URLSearchParams(window.location.search);
    const urlIn = urlParams.get('checkin') || urlParams.get('check_in');
    const urlOut = urlParams.get('checkout') || urlParams.get('check_out');

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ci = urlIn || fmt(now);
    const co = urlOut || fmt(tomorrow);

    // Set state as well so the calendar shows the right dates
    setCheckIn(ci);
    setCheckOut(co);

    fetchAvailability(ci, co).then((data) => {
      if (data?.units) {
        const matched = data.units.find((u: any) => u.id === pre || u.code === pre);
        if (matched) {
          setSelectedUnitId(matched.id);
          setStep(2);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86400000);
  }, [checkIn, checkOut]);

  const selectedUnit = useMemo(() => {
    if (!availability || !selectedUnitId) return null;
    return availability.units.find(u => u.id === selectedUnitId) || null;
  }, [availability, selectedUnitId]);

  const totalWithDiscount = useMemo(() => {
    if (!selectedUnit) return 0;
    // Simple logic for now, similar to page.tsx
    const extraGuests = Math.max(0, adults - selectedUnit.baseOccupancy);
    const extraCharge = extraGuests * (selectedUnit.extraPersonCharge || 0) * nights;
    return selectedUnit.totalPrice + extraCharge;
  }, [selectedUnit, adults, nights]);

  // ─── Actions ───
  const fetchAvailability = useCallback(async (ci: string, co: string) => {
    if (isPreview) {
      setLoadingAvail(true);
      await new Promise(r => setTimeout(r, 800));
      const mockData: AvailabilityResponse = {
        checkIn: ci,
        checkOut: co,
        nights: Math.round((parseDate(co).getTime() - parseDate(ci).getTime()) / 86400000),
        units: [
          {
            id: 'mock-1', name: 'Premium Glamping Tent', code: 'P1', beds: 2, unitTypeId: 't1', typeName: 'Tent', typeCode: 'T',
            description: 'Beautiful tent with view', photos: [], maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseOccupancy: 2,
            avgPricePerNight: 2500, totalPrice: 2500 * 2, currency: 'Kč', extraPersonCharge: 500, petAllowed: true, petCharge: 200,
            amenities: [{ icon: 'wifi', name: 'Wi-Fi' }, { icon: 'coffee', name: 'Coffee' }]
          },
          {
            id: 'mock-2', name: 'Eco Wood Cabin', code: 'C1', beds: 4, unitTypeId: 't2', typeName: 'Cabin', typeCode: 'C',
            description: 'Cozy cabin in woods', photos: [], maxAdults: 4, maxChildren: 2, maxOccupancy: 6, baseOccupancy: 2,
            avgPricePerNight: 3200, totalPrice: 3200 * 2, currency: 'Kč', extraPersonCharge: 600, petAllowed: false, petCharge: 0,
            amenities: [{ icon: 'fireplace', name: 'Fireplace' }]
          }
        ]
      };
      setAvailability(mockData);
      setLoadingAvail(false);
      return mockData;
    }

    setLoadingAvail(true);
    try {
      const params = new URLSearchParams({ checkIn: ci, checkOut: co });
      if (siteId) params.set('siteId', siteId);
      if (siteSlug) params.set('siteSlug', siteSlug);
      const res = await fetch(`${API_BASE}/api/booking/availability?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAvailability(data);
        if (data.units?.length === 0) {
          findNextAvailable(co);
        } else {
          // Robust pre-selection check
          const pre = (window as any)._preselectedUnit;
          if (pre && !selectedUnitId) {
            const matched = data.units.find((u: any) => u.id === pre || u.code === pre);
            if (matched) {
              setSelectedUnitId(matched.id);
              setStep(2);
            }
          }
        }
        return data;
      }
    } catch (e) { 
      console.error(e); 
      setLoadingAvail(false);
    }
    setLoadingAvail(false);
    return null;
  }, [siteId]);

  const findNextAvailable = async (co: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/widget/calendar?month=${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}${siteId ? `&siteId=${siteId}` : ''}${siteSlug ? `&siteSlug=${siteSlug}` : ''}`);
      const data = await res.json();
      if (data.days) {
        const next = data.days.find((d: any) => d.status === 'available' && d.date > co);
        if (next) setNextAvailable(next.date);
      }
    } catch (e) { console.error(e); }
  };

  const joinWaitlist = async () => {
    if (!email || !checkIn || !checkOut) return;
    setWaitlistStatus('submitting');
    try {
      await fetch(`${API_BASE}/api/booking/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, checkIn, checkOut, email, phone, name: `${firstName} ${lastName}` })
      });
      setWaitlistStatus('success');
    } catch (e) { console.error(e); }
  };

  const handleDayClick = (dateStr: string) => {
    const clickedDate = parseDate(dateStr);
    if (clickedDate < today) return;

    if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) {
      setCheckIn(dateStr);
      setCheckOut(null);
      setSelectingCheckOut(true);
    } else {
      if (clickedDate <= parseDate(checkIn!)) {
        setCheckIn(dateStr);
        setCheckOut(null);
      } else {
        setCheckOut(dateStr);
        setSelectingCheckOut(false);
        // setCalOpen(false); // Removed to keep calendar open for refinement
        fetchAvailability(checkIn!, dateStr);
      }
    }
  };

  const goToStep = (s: number) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Notify parent of resize if in iframe
    if (typeof window !== 'undefined' && window.parent !== window) {
      setTimeout(() => {
        window.parent.postMessage({ source: 'alisio-widget', event: 'resize', height: document.body.scrollHeight }, '*');
      }, 100);
    }
  };

  const submitBooking = async () => {
    if (!checkIn || !checkOut || !selectedUnitId || !firstName || !lastName || !phone) return;

    if (isPreview) {
      setSubmitting(true);
      await new Promise(r => setTimeout(r, 1000));
      setReservation({
        success: true,
        reservationId: 'MOCK-123',
        unitName: selectedUnit?.name || 'Mock House',
        checkIn, checkOut, nights,
        totalPrice: totalWithDiscount,
        currency: 'Kč'
      });
      setSubmitting(false);
      goToStep(4);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: selectedUnitId,
          checkIn,
          checkOut,
          adults,
          children: kids,
          firstName,
          lastName,
          email,
          phone,
          siteId: siteId || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
        goToStep(4);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to book');
      }
    } catch (e) { setError('Connection error'); }
    setSubmitting(false);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('alisio_guest_data', JSON.stringify({ firstName, lastName, email, phone }));
    }
  };

  const startPayment = async () => {
    if (!reservation) return;
    if (isPreview) {
      setSubmitting(true);
      await new Promise(r => setTimeout(r, 1000));
      setSubmitting(false);
      goToStep(6);
      return;
    }
    if (!siteSlug) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation.reservationId,
          site_slug: siteSlug,
          return_path: window.location.href.split('?')[0] + `?res_id=${reservation.reservationId}&payment_status=success`
        }),
      });
      const data = await res.json();
      if (data.session_url) {
        window.location.href = data.session_url;
      } else {
        setError(data.error || 'Payment failed to start');
      }
    } catch (e) {
      console.error(e);
      setError('Payment gateway error');
    }
    setSubmitting(false);
  };

  // ─── Render ───
  // Dynamic styles based on design config
  const dynamicStyles = useMemo(() => {
    if (!design) return {};
    const styles: any = {};
    if (design.primary_color) {
      styles['--moss'] = design.primary_color;
      // Also derive some variations
      styles['--moss-dark'] = design.primary_color; // Simplified
      styles['--accent-primary'] = design.primary_color;
    }
    if (design.button_style) {
      const isSharp = design.button_style.includes('sharp');
      const isPill = design.button_style.includes('pill');
      styles['--radius'] = isSharp ? '2px' : isPill ? '24px' : '12px';
      styles['--radius-lg'] = isSharp ? '4px' : isPill ? '32px' : '16px';
    }
    if (design.show_shadow !== undefined) {
      styles['--shadow'] = design.show_shadow ? '0 8px 32px rgba(0,0,0,0.12)' : 'none';
    }
    return styles;
  }, [design]);

  return (
    <div className={`v3-body ${design?.theme?.toLowerCase() || ''}`} style={dynamicStyles}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="v3-wrap">
        {/* TOP BAR */}
        <div className="v3-topbar">
          <button className="v3-back-btn" onClick={() => step > 1 && goToStep(step - 1)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="v3-topbar-center">
            {/* Brand removed as requested */}
          </div>
          <div className="v3-topbar-right">
            {/* Lang removed as requested */}
          </div>
        </div>

        {/* PROGRESS */}
        {step < 6 && (
          <div className="v3-progress">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`v3-progress-step ${step >= s ? 'active' : ''}`} />
            ))}
          </div>
        )}

        {/* STEP 1: DATES + GUESTS */}
        <div className={`v3-step ${step === 1 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.selectDates}</h1>
          <p className="v3-step-sub">{selectedUnit ? `${t.youSelected} ${selectedUnit.name}. ${t.checkDetailsBelow}` : t.checkDetailsBelow}</p>

          {selectedUnit && (
            <div className="v3-house-lock">
              <div className="v3-house-lock-thumb" style={selectedUnit.photos?.length ? {} : { background: 'linear-gradient(135deg,#6B8A5F,#2F4F2B)' }}>
                {selectedUnit.photos?.length > 0 ? (
                  <img src={selectedUnit.photos[0]} alt={selectedUnit.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                ) : (
                  <svg viewBox="0 0 54 54">
                    <polygon points="12,30 27,16 42,30 42,44 12,44" fill="#C9844A" />
                    <polygon points="8,30 27,14 46,30" fill="#8B5A2B" />
                    <rect x="23" y="34" width="8" height="10" fill="#1F3220" />
                  </svg>
                )}
              </div>
              <div className="v3-house-lock-info">
                <div className="v3-house-lock-label">{t.accommodation}</div>
                <div className="v3-house-lock-name">{selectedUnit.name}</div>
                <div className="v3-house-lock-feat">
                  {selectedUnit.baseOccupancy} {t.guestsShort} · {selectedUnit.typeName}
                </div>
              </div>
            </div>
          )}

          <div className="v3-dates" onClick={() => setCalOpen(!calOpen)}>
            <div className={`v3-date-cell ${calOpen && !selectingCheckOut ? 'active' : ''}`}>
              <div className="v3-date-cell-label">{t.checkIn}</div>
              <div className="v3-date-cell-value">{checkIn ? formatDisplayDate(checkIn, lang) : '—'}</div>
              <div className="v3-date-cell-sub">{t.from} 15:00</div>
            </div>
            <div className="v3-date-div"></div>
            <div className={`v3-date-cell ${calOpen && selectingCheckOut ? 'active' : ''}`}>
              <div className="v3-date-cell-label">{t.checkOut}</div>
              <div className="v3-date-cell-value">{checkOut ? formatDisplayDate(checkOut, lang) : '—'}</div>
              <div className="v3-date-cell-sub">
                {nights > 0 ? `${nights} ${t.nightsShort}` : ''} · {t.to} 11:00
              </div>
            </div>
          </div>

          <div className={`v3-cal-wrap ${calOpen ? 'open' : ''}`}>
            <div className="v3-cal-head">
              <div className="v3-cal-month">
                {new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { month: 'long', year: 'numeric' })}
              </div>
              <div className="v3-cal-nav">
                <button className="v3-cal-btn" onClick={(e) => { e.stopPropagation(); setCalMonthOffset(o => o - 1); }}>‹</button>
                <button className="v3-cal-btn" onClick={(e) => { e.stopPropagation(); setCalMonthOffset(o => o + 1); }}>›</button>
              </div>
            </div>
            <div className="v3-cal-weekdays">
              {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'].map(d => <div key={d} className="v3-cal-weekday">{d}</div>)}
            </div>
            <div className="v3-cal-days">
              {(() => {
                const year = today.getFullYear();
                const month = today.getMonth() + calMonthOffset;
                const daysInM = getDaysInMonth(year, month);
                const first = getFirstDayOfMonth(year, month);
                const cells = [];
                for (let i = 0; i < first; i++) cells.push(<div key={`e-${i}`} className="v3-cal-day muted" />);
                for (let d = 1; d <= daysInM; d++) {
                  const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isPast = parseDate(ds) < today;
                  const isBusy = busyDates.has(ds);

                  let cls = 'v3-cal-day';
                  if (isPast || isBusy) cls += ' muted';
                  if (isBusy) cls += ' busy';
                  if (ds === checkIn) cls += ' start';
                  if (ds === checkOut) cls += ' end';
                  if (checkIn && checkOut && ds > checkIn && ds < checkOut) cls += ' in-range';

                  cells.push(
                    <div key={d} className={cls} onClick={(e) => {
                      e.stopPropagation();
                      if (!isPast && !isBusy) handleDayClick(ds);
                    }}>
                      <span>{d}</span>
                    </div>
                  );
                }
                return cells;
              })()}
            </div>
          </div>

          <div className="v3-guests">
            <div>
              <div className="v3-guests-label">{t.adults}</div>
              <div className="v3-guests-sub">18+</div>
            </div>
            <div className="v3-stepper">
              <button className="v3-stepper-btn" onClick={() => setAdults(Math.max(1, adults - 1))}>−</button>
              <span className="v3-stepper-val">{adults}</span>
              <button className="v3-stepper-btn" onClick={() => setAdults(adults + 1)}>+</button>
            </div>
          </div>

          <div className="v3-guests">
            <div>
              <div className="v3-guests-label">{t.children}</div>
              <div className="v3-guests-sub">0-17</div>
            </div>
            <div className="v3-stepper">
              <button className="v3-stepper-btn" onClick={() => setKids(Math.max(0, kids - 1))}>−</button>
              <span className="v3-stepper-val">{kids}</span>
              <button className="v3-stepper-btn" onClick={() => setKids(kids + 1)}>+</button>
            </div>
          </div>

          <div className="v3-promo-section">
            <button className="v3-promo-toggle" onClick={() => setShowPromo(!showPromo)}>
              {showPromo ? '−' : '+'} {t.promoCode} / {t.certificateCode}
            </button>
            {showPromo && (
              <div className="v3-promo-field">
                <input
                  className="v3-field-input"
                  placeholder={t.promoCode}
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value)}
                />
                <button className="v3-promo-apply">{t.apply}</button>
              </div>
            )}
          </div>
        </div>

        {/* STEP 2: HOUSE LIST / DETAILS */}
        <div className={`v3-step ${step === 2 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{selectedUnitId ? (t.yourSelection || 'Ваш вибір') : t.selectAccommodation}</h1>
          <p className="v3-step-sub">{selectedUnitId ? (t.reviewSelection || 'Перевірте деталі та продовжуйте бронювання') : t.availableForDates}</p>

          {loadingAvail && !selectedUnitId ? (
            <div className="v3-house-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="v3-house-lock skeleton">
                  <div className="v3-house-lock-thumb skeleton-anim" />
                  <div className="v3-house-lock-info">
                    <div style={{ height: 8, width: '40%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} className="skeleton-anim" />
                    <div style={{ height: 12, width: '70%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} className="skeleton-anim" />
                    <div style={{ height: 8, width: '30%', background: 'var(--line)', borderRadius: 4 }} className="skeleton-anim" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="v3-house-list">
              {availability?.units.length === 0 ? (
                <div className="v3-no-avail">
                  <div className="v3-no-avail-icon">📭</div>
                  <h3>{t.noUnitsFound}</h3>
                  <p>{t.noAvailabilityDesc}</p>

                  {nextAvailable && (
                    <div className="v3-flex-dates">
                      <div className="v3-flex-dates-label">💡 Спробуйте ці дати:</div>
                      <button className="v3-flex-dates-btn" onClick={() => {
                        setCheckIn(nextAvailable);
                        setCheckOut(null);
                        setSelectingCheckOut(true);
                        setStep(1);
                        setCalOpen(true);
                      }}>
                        Вільні місця з {formatDisplayDate(nextAvailable, lang)}
                      </button>
                    </div>
                  )}

                  <div className="v3-waitlist">
                    <div className="v3-waitlist-title">Список очікування</div>
                    <p>Ми повідомимо вас, якщо ці дати звільняться.</p>
                    {waitlistStatus === 'success' ? (
                      <div className="v3-waitlist-done">✅ Ви підписалися!</div>
                    ) : (
                      <div className="v3-waitlist-form">
                        <input className="v3-waitlist-input" placeholder="Ваш email" value={email} onChange={e => setEmail(e.target.value)} />
                        <button className="v3-waitlist-btn" onClick={joinWaitlist} disabled={waitlistStatus === 'submitting'}>
                          {waitlistStatus === 'submitting' ? '...' : 'Підписатися'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                (loadingAvail && selectedUnitId) ? null :
                availability?.units
                  .filter(u => !selectedUnitId || selectedUnitId === u.id)
                  .map(u => {
                  const isSelected = selectedUnitId === u.id;
                  return (
                    <div
                      key={u.id}
                      className={`v3-house-lock select ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedUnitId(u.id)}
                    >
                      <div className="v3-house-lock-thumb" style={u.photos?.length ? {} : { background: 'linear-gradient(135deg,#6B8A5F,#2F4F2B)' }}>
                        {u.photos?.length > 0 ? (
                          <img src={u.photos[0]} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                        ) : (
                          <svg viewBox="0 0 54 54">
                            <polygon points="12,30 27,16 42,30 42,44 12,44" fill={isSelected ? '#fff' : '#C9844A'} />
                            <polygon points="8,30 27,14 46,30" fill={isSelected ? '#fff' : '#8B5A2B'} />
                          </svg>
                        )}
                      </div>
                      <div className="v3-house-lock-info">
                        <div className="v3-house-lock-label">
                          {isSelected ? `${t.youSelected || 'Ви обрали'} · ${nights} ${t.nightsShort}` : u.typeName}
                        </div>
                        <div className="v3-house-lock-name">{u.name}</div>
                        <div className="v3-house-lock-feat">
                          до {u.maxOccupancy} {t.guestsShort} · <strong>{formatPrice(u.totalPrice)} Kč</strong>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="v3-house-lock-check">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {selectedUnitId && availability && availability.units.length > 1 && (
                <button className="v3-change-unit-btn" onClick={() => setSelectedUnitId(null)}>
                  ↺ Обрати інший варіант
                </button>
              )}
              {availability && availability.units.length > 0 && socialProof && (
                <div className="v3-social-badges">
                  <div className="v3-badge viewers">
                    <span className="v3-badge-dot pulse"></span>
                    {socialProof.viewers} людей дивляться зараз
                  </div>
                  <div className="v3-badge last-book">
                    ⏱ Остання бронь: {socialProof.lastBooking}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedUnit && (
            <div className="v3-house-detail-fade">
              <div className="v3-gallery">
                <div className="v3-gallery-main" onClick={() => {
                  if (selectedUnit.photos?.length > 1) {
                    setCurrentImgIndex(prev => (prev + 1) % selectedUnit.photos.length);
                  }
                }}>
                  {selectedUnit.photos && selectedUnit.photos.length > 0 ? (
                    <img 
                      src={selectedUnit.photos[currentImgIndex % selectedUnit.photos.length]} 
                      alt={selectedUnit.name} 
                      className="v3-gallery-img"
                    />
                  ) : (
                    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                      <defs>
                        <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#A4B996" stopOpacity=".6" />
                          <stop offset="100%" stopColor="#2F4F2B" />
                        </linearGradient>
                      </defs>
                      <rect width="400" height="300" fill="url(#sky2)" />
                      <path d="M0,300 L0,180 L30,150 L25,125 L40,100 L55,125 L50,150 L80,170 L75,140 L90,115 L105,140 L110,170 L140,190 L160,300 Z" fill="#1F3220" opacity=".85" />
                      <path d="M260,300 L260,170 L290,145 L285,120 L300,95 L315,120 L310,145 L340,165 L350,300 Z" fill="#1F3220" opacity=".85" />
                      <g transform="translate(150,120)">
                        <polygon points="-10,40 50,0 110,40 110,100 -10,100" fill="#C9844A" />
                        <polygon points="-15,40 50,-5 115,40" fill="#8B5A2B" />
                        <rect x="20" y="55" width="20" height="30" fill="#F6F1E8" opacity=".9" />
                        <rect x="65" y="55" width="20" height="30" fill="#F6F1E8" opacity=".9" />
                        <rect x="42" y="70" width="18" height="30" fill="#5A3A1A" />
                        <circle cx="50" cy="0" r="3" fill="#FFD580" />
                        <line x1="50" y1="-5" x2="50" y2="-18" stroke="#5A3A1A" strokeWidth="1.5" />
                      </g>
                      <ellipse cx="200" cy="270" rx="250" ry="10" fill="#F6F1E8" opacity=".3" />
                    </svg>
                  )}
                  {selectedUnit.photos?.length > 1 && (
                    <div className="v3-gallery-nav">
                      <button className="v3-gallery-arrow left" onClick={(e) => { e.stopPropagation(); setCurrentImgIndex(prev => (prev - 1 + selectedUnit.photos.length) % selectedUnit.photos.length); }}>‹</button>
                      <button className="v3-gallery-arrow right" onClick={(e) => { e.stopPropagation(); setCurrentImgIndex(prev => (prev + 1) % selectedUnit.photos.length); }}>›</button>
                    </div>
                  )}
                </div>
                {selectedUnit.photos?.length > 1 && (
                  <div className="v3-gallery-dots">
                    {selectedUnit.photos.map((_, i) => (
                      <div key={i} className={`v3-gallery-dot ${i === currentImgIndex ? 'active' : ''}`} onClick={() => setCurrentImgIndex(i)} />
                    ))}
                  </div>
                )}
                {selectedUnit.photos?.length > 0 && (
                  <div className="v3-gallery-count">{(currentImgIndex % selectedUnit.photos.length) + 1} / {selectedUnit.photos.length}</div>
                )}
              </div>
              <h1 className="v3-house-detail-name">{selectedUnit.name}</h1>
              <div className="v3-house-detail-meta">{selectedUnit.typeName} · до {selectedUnit.maxOccupancy} {t.guestsShort}</div>
              <div className="v3-amenities">
                {(selectedUnit.amenities && selectedUnit.amenities.length > 0) ? selectedUnit.amenities.map((a, i) => (
                  <div key={i} className="v3-amenity">
                    <span className="v3-amenity-icon">{a.icon || '✓'}</span>
                    {a.name}
                  </div>
                )) : (
                  <>
                    <div className="v3-amenity"><span className="v3-amenity-icon">🛁</span>Джакузі на терасі</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">🔥</span>Камін дров'яний</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">☕</span>Кухня повна</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">📶</span>Wi-Fi 100 Mbps</div>
                  </>
                )}
              </div>
              <div className="v3-house-desc">{selectedUnit.description}</div>
            </div>
          )}
        </div>

        {/* STEP 3: CONTACTS */}
        <div className={`v3-step ${step === 3 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.guestInfoTitle}</h1>
          <p className="v3-step-sub">{t.confirmationEmailNote}</p>

          <div className="v3-field">
            <label className="v3-field-label">{t.firstName} & {t.lastName}</label>
            <div className="v3-field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input className="v3-field-input" placeholder={t.firstName} value={firstName} onChange={e => setFirstName(e.target.value)} />
              <input className="v3-field-input" placeholder={t.lastName} value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="v3-field">
            <label className="v3-field-label">{t.email}</label>
            <input className="v3-field-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="v3-field">
            <label className="v3-field-label">{t.phone}</label>
            <input className="v3-field-input" type="tel" placeholder="+420..." value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>

        {/* STEP 4: SERVICES */}
        <div className={`v3-step ${step === 4 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.addToStayTitle || 'Додати до відпочинку?'}</h1>
          <p className="v3-step-sub">{t.everythingOptional || 'Все опційне. Можна пропустити і додати пізніше.'}</p>

          <div className="v3-service-card" onClick={(e) => e.currentTarget.classList.toggle('selected')}>
            <div className="v3-service-body">
              <div className="v3-service-visual">🥐</div>
              <div className="v3-service-info">
                <div className="v3-service-name">Сніданок у будинок</div>
                <div className="v3-service-reason">Привозимо о 9:00 — свіже пекарське, кава, фреш.</div>
                <div className="v3-service-price-row">
                  <span className="v3-service-price">+ 600 Kč</span>
                  <div className="v3-service-toggle"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="v3-service-card" onClick={(e) => e.currentTarget.classList.toggle('selected')}>
            <div className="v3-service-body">
              <div className="v3-service-visual s2">🧖</div>
              <div className="v3-service-info">
                <div className="v3-service-name">Фінська сауна на 2 години</div>
                <div className="v3-service-reason">Приватна сауна з видом на ліс.</div>
                <div className="v3-service-price-row">
                  <span className="v3-service-price">+ 800 Kč</span>
                  <div className="v3-service-toggle"></div>
                </div>
              </div>
            </div>
          </div>

          <button className="v3-skip-link" onClick={() => goToStep(5)}>{t.skipLink || 'Пропустити — не треба нічого'}</button>
        </div>

        {/* STEP 5: PAYMENT (Breakdown) */}
        <div className={`v3-step ${step === 5 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.paymentTitle}</h1>
          <p className="v3-step-sub">{t.securePaymentNote}</p>

          <div className="v3-breakdown">
            <div className="v3-breakdown-row">
              <span>{selectedUnit?.name} · {nights} {t.nightsShort}</span>
              <span className="v3-breakdown-val">{formatPrice(selectedUnit?.totalPrice || 0)} Kč</span>
            </div>
            {totalWithDiscount > (selectedUnit?.totalPrice || 0) && (
              <div className="v3-breakdown-row">
                <span>{t.additionalServices}</span>
                <span className="v3-breakdown-val">{formatPrice(totalWithDiscount - (selectedUnit?.totalPrice || 0))} Kč</span>
              </div>
            )}
            <div className="v3-breakdown-row total">
              <span>{t.total}</span>
              <span className="v3-breakdown-val">{formatPrice(totalWithDiscount)} Kč</span>
            </div>
          </div>

          <div className="v3-pay-method selected">
            <div className="v3-pay-method-radio"></div>
            <div className="v3-pay-method-info">
              <div className="v3-pay-method-name">Teya Payment Gateway</div>
              <div className="v3-pay-method-sub">Visa · Mastercard · Apple Pay</div>
            </div>
          </div>

          <div className="v3-trust-block">
            <div className="v3-trust-block-line"><span>{t.securePaymentNote}</span></div>
          </div>
        </div>

        {/* STEP 6: SUCCESS */}
        <div className={`v3-step ${step === 6 || !!reservation ? 'visible' : ''} success`}>
          <div className="v3-success-icon">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none"><path d="M7 15L12 20L23 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="v3-success-title">{t.bookedSuccess}</h1>
          <p className="v3-success-sub">{t.supportContactNote}</p>

          <div className="v3-success-details">
            <div className="v3-success-row"><span>{t.bookingNumber}</span><strong>#{reservation?.reservationId.slice(-4).toUpperCase()}</strong></div>
            <div className="v3-success-row"><span>{t.accommodation}</span><strong>{reservation?.unitName}</strong></div>
            <div className="v3-success-row"><span>{t.checkIn}</span><strong>{reservation ? formatFullDate(reservation.checkIn, lang) : ''}</strong></div>
            <div className="v3-success-row"><span>{t.checkOut}</span><strong>{reservation ? formatFullDate(reservation.checkOut, lang) : ''}</strong></div>
          </div>
        </div>

        {/* STICKY CTA */}
        {step < 6 && !reservation && (
          <div className="v3-cta-bar">
            <div className="v3-cta-inner">
              <div className="v3-cta-summary">
                <div className="v3-cta-summary-line1">
                  {nights > 0 ? `${nights} ${t.nightsShort.toUpperCase()}` : ''} · {adults + kids} {t.guestsShort.toUpperCase()}
                </div>
                <div className="v3-cta-summary-line2">{formatPrice(totalWithDiscount)} Kč</div>
              </div>
              <button
                className={`v3-cta-btn ${((step === 1 && (!checkIn || !checkOut)) || (step === 2 && !selectedUnitId) || (step === 3 && (!firstName || !lastName || !phone || !email))) ? 'disabled' : ''}`}
                disabled={(step === 1 && (!checkIn || !checkOut)) || (step === 2 && !selectedUnitId) || (step === 3 && (!firstName || !lastName || !phone || !email))}
                onClick={() => {
                  if (step === 1) {
                    if (checkIn && checkOut) goToStep(2);
                  }
                  else if (step === 2) goToStep(3);
                  else if (step === 3) submitBooking();
                  else if (step === 4) goToStep(5);
                  else if (step === 5) startPayment();
                }}
              >
                <span>
                  {step === 5 ? t.payNow :
                    (step === 1 ? t.selectDates :
                      (step === 3 ? (submitting ? t.processing : t.next) : t.next))}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
