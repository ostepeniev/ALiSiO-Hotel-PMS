'use client';

import React, { useState } from 'react';
import { formatPrice } from '../lib/pricing';

interface Props {
  accommodationType: string;
  accommodationLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: string;
  total: number;
  deposit: number;
  extras: { id: string; name: string; quantity: number; price: number }[];
  onSubmit: (contact: { name: string; email: string; phone: string }) => void;
  submitting: boolean;
}

export default function StepSummary({ accommodationType, accommodationLabel, checkIn, checkOut, nights, guests, total, deposit, extras, onSubmit, submitting }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
  const grandTotal = total + extrasTotal;
  const grandDeposit = deposit + Math.round(extrasTotal * 0.3);
  const remaining = grandTotal - grandDeposit;
  const valid = name.trim().length >= 2 && email.includes('@') && email.includes('.');

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Booking summary</h1>
      <p className="kc-subtitle">Review your booking and enter contact details</p>

      <div className="kc-summary">
        <div className="kc-summary-title">🏕️ {accommodationLabel}</div>
        <div className="kc-summary-row"><span>Check-in</span><strong>{checkIn}</strong></div>
        <div className="kc-summary-row"><span>Check-out</span><strong>{checkOut}</strong></div>
        <div className="kc-summary-row"><span>Nights</span><strong>{nights}</strong></div>
        <div className="kc-summary-row"><span>Guests</span><strong>{guests}</strong></div>
        <div className="kc-summary-divider" />
        <div className="kc-summary-row"><span>Accommodation</span><strong>{formatPrice(total)} Kč</strong></div>
        {extras.map(e => (
          <div key={e.id} className="kc-summary-row"><span>{e.name} ×{e.quantity}</span><strong>{formatPrice(e.price)} Kč</strong></div>
        ))}
        <div className="kc-summary-divider" />
        <div className="kc-summary-row" style={{ fontSize: 17 }}><span><strong>Total</strong></span><strong>{formatPrice(grandTotal)} Kč</strong></div>
      </div>

      <div className="kc-breakdown">
        <div className="kc-breakdown-deposit"><span>💳 Deposit — pay now</span><span>{formatPrice(grandDeposit)} Kč</span></div>
        <div className="kc-breakdown-remaining"><span>Remaining — at check-in</span><span>{formatPrice(remaining)} Kč</span></div>
      </div>

      {/* Contact form */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Contact details</div>
        <div className="kc-input-group">
          <label className="kc-input-label">Full name *</label>
          <input className="kc-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jan Novák" />
        </div>
        <div className="kc-input-group">
          <label className="kc-input-label">Email *</label>
          <input className="kc-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@email.cz" />
        </div>
        <div className="kc-input-group">
          <label className="kc-input-label">Phone (optional)</label>
          <input className="kc-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420 ..." />
        </div>
      </div>

      <button className="kc-btn kc-btn-primary" disabled={!valid || submitting}
        onClick={() => onSubmit({ name, email, phone })} type="button">
        {submitting ? <><div className="kc-spinner" /> Processing...</> : `Book & Pay ${formatPrice(grandDeposit)} Kč →`}
      </button>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--kc-text-muted)', marginTop: 12 }}>
        By booking you agree to the terms of Kemp Carlsbad s.r.o.
      </div>
    </div>
  );
}
