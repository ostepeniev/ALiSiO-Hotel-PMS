'use client';

import React, { useState, useEffect, useCallback } from 'react';
import StepLanding, { type AccommodationType } from './steps/StepLanding';
import StepGlamping from './steps/StepGlamping';
import StepBuildings from './steps/StepBuildings';
import StepCamping from './steps/StepCamping';
import StepExtras from './steps/StepExtras';
import StepSummary from './steps/StepSummary';
import StepSuccess from './steps/StepSuccess';
import { getNightDates, loadPriceList, type PriceItem } from './lib/pricing';

type Step = 'landing' | 'accommodation' | 'extras' | 'summary' | 'success';

interface BookingState {
  accommodationType: AccommodationType | null;
  accommodationData: Record<string, unknown>;
  extras: { id: string; name: string; quantity: number; price: number }[];
  contact: { name: string; email: string; phone: string } | null;
  total: number;
  deposit: number;
  checkIn: string;
  checkOut: string;
}

const STEP_LABELS: Record<Step, string> = {
  landing: 'Accommodation', accommodation: 'Details', extras: 'Extras', summary: 'Summary', success: 'Done',
};
const STEP_ORDER: Step[] = ['landing', 'accommodation', 'extras', 'summary', 'success'];
const STORAGE_KEY = 'kc_booking_draft';

function getAccommodationLabel(state: BookingState): string {
  if (!state.accommodationType) return '';
  if (state.accommodationType === 'glamping') {
    const unit = state.accommodationData.unit as string;
    return unit === 'tiny' ? 'Tiny House' : 'Barn House';
  }
  if (state.accommodationType === 'buildings') {
    const b = state.accommodationData.building as string;
    const m = state.accommodationData.mode as string;
    const bName = b === 'budova_d' ? 'Budova D' : 'Budova F';
    return `${bName} — ${m === 'shared' ? 'Shared beds' : m === 'non_shared' ? 'Private room' : 'Whole building'}`;
  }
  return 'Camping';
}

function getGuestsLabel(state: BookingState): string {
  const ad = (state.accommodationData.adults as number) || 0;
  const ch = (state.accommodationData.children as number) || 0;
  let s = `${ad} adult${ad !== 1 ? 's' : ''}`;
  if (ch > 0) s += `, ${ch} child${ch !== 1 ? 'ren' : ''}`;
  return s;
}

export default function BookingWizard() {
  const [step, setStep] = useState<Step>('landing');
  const [state, setState] = useState<BookingState>({
    accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, deposit: 0, checkIn: '', checkOut: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'pending'>('pending');
  const [reservationId, setReservationId] = useState<string | undefined>();
  const [guestPageToken, setGuestPageToken] = useState<string | undefined>();
  const [showResume, setShowResume] = useState(false);
  const [prices, setPrices] = useState<PriceItem[]>([]);

  // Load price list from API
  useEffect(() => {
    loadPriceList().then(setPrices).catch(() => {});
  }, []);

  // SW registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-book.js').catch(() => {});
    }
  }, []);

  // Restore draft
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accommodationType && parsed.checkIn) {
          setShowResume(true);
          setState(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Save draft on state change
  useEffect(() => {
    if (step !== 'landing' && step !== 'success' && state.accommodationType) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
    }
  }, [state, step]);

  // Check payment return URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment');
    const rid = params.get('reservation_id');
    const token = params.get('token');
    if (status === 'success') {
      setPaymentStatus('success');
      if (rid) setReservationId(rid);
      if (token) setGuestPageToken(token);
      setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, '', '/book');
    } else if (status === 'failed' || status === 'cancel') {
      setPaymentStatus('failed');
      setStep('success');
      window.history.replaceState({}, '', '/book');
    }
  }, []);

  const resetAll = useCallback(() => {
    setState({ accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, deposit: 0, checkIn: '', checkOut: '' });
    setStep('landing');
    setSubmitting(false);
    setPaymentStatus('pending');
    setReservationId(undefined);
    setGuestPageToken(undefined);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  const progressPct = ((STEP_ORDER.indexOf(step)) / (STEP_ORDER.length - 1)) * 100;

  // ─── Submit to API ───────────────────────────────────
  const handleSubmit = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true);
    setState(s => ({ ...s, contact }));

    try {
      // 1. Create booking draft
      const draftRes = await fetch('/api/booking/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accommodation_type: state.accommodationType,
          accommodation_data: state.accommodationData,
          check_in: state.checkIn,
          check_out: state.checkOut,
          extras: state.extras,
          guest_name: contact.name,
          guest_email: contact.email,
          guest_phone: contact.phone,
          total_price: state.total,
          deposit_amount: state.deposit,
        }),
      });
      const draft = await draftRes.json();
      if (!draftRes.ok) throw new Error(draft.error || 'Failed to create draft');

      // 2. Create checkout session
      const extrasTotal = state.extras.reduce((s, e) => s + e.price, 0);
      const depositAmount = state.deposit + Math.round(extrasTotal * 0.3);
      const desc = `Kemp Carlsbad — ${getAccommodationLabel(state)} — ${contact.name}`;

      const checkoutRes = await fetch('/api/booking/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: depositAmount,
          currency: 'CZK',
          description: desc,
          reservation_id: draft.id,
          return_path: `/book?payment=success&reservation_id=${draft.id}`,
        }),
      });
      const checkout = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkout.error || 'Payment system error');

      // 3. Redirect to Teya
      if (checkout.session_url) {
        window.location.href = checkout.session_url;
      } else {
        // Fallback — mark as tentative
        setReservationId(draft.id);
        setPaymentStatus('success');
        setStep('success');
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (err: unknown) {
      console.error('[Booking]', err);
      setPaymentStatus('failed');
      setStep('success');
    } finally {
      setSubmitting(false);
    }
  };

  const nights = state.checkIn && state.checkOut ? getNightDates(state.checkIn, state.checkOut).length : 0;

  return (
    <div className="kc-root">
      {/* Resume modal */}
      {showResume && (
        <div className="kc-resume-overlay" onClick={() => { setShowResume(false); resetAll(); }}>
          <div className="kc-resume-sheet" onClick={e => e.stopPropagation()}>
            <h3>Continue your booking?</h3>
            <p>You have an unfinished booking for {state.checkIn}. Would you like to continue?</p>
            <button className="kc-btn kc-btn-primary" onClick={() => { setShowResume(false); setStep('accommodation'); }} type="button" style={{ marginBottom: 8 }}>Continue booking</button>
            <button className="kc-btn kc-btn-secondary" onClick={() => { setShowResume(false); resetAll(); }} type="button">Start over</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="kc-header">
        <div>
          <div className="kc-header-brand">Kemp Carlsbad</div>
          <div className="kc-header-sub">Book your stay</div>
        </div>
        <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-header-help">💬 Help</a>
      </header>

      <div className="kc-container">
        {/* Progress */}
        {step !== 'success' && (
          <div className="kc-progress">
            <div className="kc-progress-track"><div className="kc-progress-fill" style={{ width: `${progressPct}%` }} /></div>
            <div className="kc-progress-label">Step {STEP_ORDER.indexOf(step) + 1} of {STEP_ORDER.length - 1} · {STEP_LABELS[step]}</div>
          </div>
        )}

        {/* Back */}
        {step !== 'landing' && step !== 'success' && (
          <button className="kc-back" onClick={goBack} type="button">‹ Back</button>
        )}

        {/* Steps */}
        {step === 'landing' && (
          <StepLanding onSelect={(type) => {
            setState(s => ({ ...s, accommodationType: type }));
            setStep('accommodation');
          }} />
        )}

        {step === 'accommodation' && state.accommodationType === 'glamping' && (
          <StepGlamping prices={prices} onNext={(data) => {
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, deposit: data.deposit, checkIn: data.checkIn, checkOut: data.checkOut }));
            setStep('extras');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'buildings' && (
          <StepBuildings prices={prices} onNext={(data) => {
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, deposit: data.deposit, checkIn: data.checkIn, checkOut: data.checkOut }));
            setStep('extras');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'camping' && (
          <StepCamping prices={prices} onNext={(data) => {
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, deposit: data.deposit, checkIn: data.checkIn, checkOut: data.checkOut }));
            setStep('extras');
          }} />
        )}

        {step === 'extras' && (
          <StepExtras
            accommodationType={state.accommodationType || ''}
            onNext={(extras) => { setState(s => ({ ...s, extras })); setStep('summary'); }}
            onSkip={() => { setState(s => ({ ...s, extras: [] })); setStep('summary'); }}
          />
        )}

        {step === 'summary' && (
          <StepSummary
            accommodationType={state.accommodationType || ''}
            accommodationLabel={getAccommodationLabel(state)}
            checkIn={state.checkIn}
            checkOut={state.checkOut}
            nights={nights}
            guests={getGuestsLabel(state)}
            total={state.total}
            deposit={state.deposit}
            extras={state.extras}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}

        {step === 'success' && (
          <StepSuccess
            status={paymentStatus}
            reservationId={reservationId}
            accommodationLabel={getAccommodationLabel(state)}
            checkIn={state.checkIn}
            checkOut={state.checkOut}
            nights={nights}
            total={state.total}
            deposit={state.deposit}
            guestPageToken={guestPageToken}
            onReset={resetAll}
          />
        )}
      </div>

      {/* Footer */}
      {step !== 'success' && (
        <div className="kc-footer">© {new Date().getFullYear()} Kemp Carlsbad s.r.o. · Powered by ALiSiO</div>
      )}
    </div>
  );
}
