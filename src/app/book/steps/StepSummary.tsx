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
  extras: { id: string; name: string; quantity: number; price: number }[];
  onPayOnline: (contact: { name: string; email: string; phone: string }) => void;
  onPayAdmin: (contact: { name: string; email: string; phone: string }) => void;
  submitting: boolean;
}

export default function StepSummary({ accommodationLabel, checkIn, checkOut, nights, guests, total, extras, onPayOnline, onPayAdmin, submitting }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
  const grandTotal = total + extrasTotal;
  const valid = name.trim().length >= 2 && email.includes('@') && email.includes('.');

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Booking summary</h1>
      <p className="kc-subtitle">Review your booking and choose payment method</p>

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
        <div className="kc-summary-row" style={{ fontSize: 18 }}><span><strong>Total</strong></span><strong style={{ color: 'var(--kc-green)' }}>{formatPrice(grandTotal)} Kč</strong></div>
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

      {/* Two payment buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button className="kc-btn kc-btn-primary" disabled={!valid || submitting}
          onClick={() => onPayOnline({ name, email, phone })} type="button">
          {submitting ? <><div className="kc-spinner" /> Processing...</> : `💳 Pay online — ${formatPrice(grandTotal)} Kč`}
        </button>
        <button className="kc-btn kc-btn-secondary" disabled={!valid || submitting}
          onClick={() => onPayAdmin({ name, email, phone })} type="button">
          🏢 Pay via administrator
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--kc-text-muted)', marginTop: 12 }}>
        By booking you agree to the terms of Kemp Carlsbad s.r.o.
      </div>
    </div>
  );
}
