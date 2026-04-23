'use client';

import React from 'react';
import { formatPrice } from '../lib/pricing';

interface Props {
  status: 'success' | 'failed' | 'pending';
  reservationId?: string;
  accommodationLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  deposit: number;
  guestPageToken?: string;
  onReset: () => void;
}

export default function StepSuccess({ status, reservationId, accommodationLabel, checkIn, checkOut, nights, total, deposit, guestPageToken, onReset }: Props) {
  if (status === 'failed') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: 'var(--kc-error-light)', color: 'var(--kc-error)' }}>✗</div>
        <h2>Payment failed</h2>
        <p>Your payment was not completed. Please try again or contact us.</p>
        <button className="kc-btn kc-btn-primary" onClick={onReset} type="button">Try again</button>
        <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-help-link">💬 Contact us via WhatsApp</a>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: '#fff8e1', color: '#8b6914' }}>⏳</div>
        <h2>Processing payment...</h2>
        <p>Please wait while we confirm your payment.</p>
        <div className="kc-spinner" style={{ margin: '16px auto', borderColor: 'rgba(46,107,79,0.2)', borderTopColor: 'var(--kc-green)' }} />
      </div>
    );
  }

  return (
    <div className="kc-fade-in kc-success">
      <div className="kc-success-icon">✓</div>
      <h2>Booking confirmed!</h2>
      <p>Thank you for your reservation. We&apos;ll send a confirmation email shortly.</p>

      {reservationId && (
        <div style={{ background: 'var(--kc-green-light)', borderRadius: 'var(--kc-radius-sm)', padding: '12px 16px', margin: '16px auto', display: 'inline-block' }}>
          <div style={{ fontSize: 12, color: 'var(--kc-text-muted)' }}>Booking ID</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--kc-green)' }}>{reservationId}</div>
        </div>
      )}

      <div className="kc-summary" style={{ textAlign: 'left', marginTop: 20 }}>
        <div className="kc-summary-row"><span>Accommodation</span><strong>{accommodationLabel}</strong></div>
        <div className="kc-summary-row"><span>Check-in</span><strong>{checkIn}</strong></div>
        <div className="kc-summary-row"><span>Check-out</span><strong>{checkOut}</strong></div>
        <div className="kc-summary-row"><span>Nights</span><strong>{nights}</strong></div>
        <div className="kc-summary-divider" />
        <div className="kc-summary-row"><span>Total</span><strong>{formatPrice(total)} Kč</strong></div>
        <div className="kc-summary-row" style={{ color: 'var(--kc-green)' }}><span>Deposit paid</span><strong>{formatPrice(deposit)} Kč</strong></div>
        <div className="kc-summary-row" style={{ color: 'var(--kc-text-muted)' }}><span>Remaining</span><strong>{formatPrice(total - deposit)} Kč</strong></div>
      </div>

      {guestPageToken && (
        <a href={`/guest/${guestPageToken}`} className="kc-btn kc-btn-primary" style={{ textDecoration: 'none', marginTop: 16, display: 'flex' }}>
          Open My Guest Page →
        </a>
      )}

      <button className="kc-btn kc-btn-secondary" onClick={onReset} style={{ marginTop: 8 }} type="button">
        Book another stay
      </button>

      <div className="kc-footer">
        📧 Confirmation sent to your email<br />
        📞 +420 723 565 616
      </div>
    </div>
  );
}
