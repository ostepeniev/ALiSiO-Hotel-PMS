'use client';

import React, { useState, useRef } from 'react';
import { formatPrice } from '../lib/pricing';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  status: 'success' | 'failed' | 'pending' | 'admin_pending';
  reservationId?: string;
  accommodationLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  adults: number;
  guestPageToken?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  onReset: () => void;
  onAdminConfirm?: () => void;
}

export default function StepSuccess({ status, reservationId, accommodationLabel, checkIn, checkOut, nights, total, adults, guestPageToken, paymentUrl, qrCodeUrl, onReset, onAdminConfirm }: Props) {
  const totalGuests = Math.max(1, adults || 1);
  const [regStep, setRegStep] = useState<'none' | 'photo' | 'done'>('none');
  const [currentGuest, setCurrentGuest] = useState(0); // 0-indexed
  // Per-guest photos: guestPhotos[guestIndex] = string[]
  const [guestPhotos, setGuestPhotos] = useState<string[][]>(() => Array.from({ length: totalGuests }, () => []));
  const [uploading, setUploading] = useState(false);
  const [ocrNames, setOcrNames] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setGuestPhotos(prev => {
            const updated = [...prev];
            updated[currentGuest] = [...(updated[currentGuest] || []), reader.result as string];
            return updated;
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (guestIdx: number, photoIdx: number) => {
    setGuestPhotos(prev => {
      const updated = [...prev];
      updated[guestIdx] = updated[guestIdx].filter((_, j) => j !== photoIdx);
      return updated;
    });
  };

  const submitAllPhotos = async () => {
    if (!reservationId) return;
    // Check all guests have at least 1 photo
    const allHavePhotos = guestPhotos.every(photos => photos.length > 0);
    if (!allHavePhotos) return;

    setUploading(true);
    try {
      // Upload all photos
      const uploadedUrls: string[] = [];
      for (const photos of guestPhotos) {
        for (const photo of photos) {
          const blob = await fetch(photo).then(r => r.blob());
          const formData = new FormData();
          formData.append('file', blob, `doc_${Date.now()}_${Math.random().toString(36).slice(2,6)}.jpg`);
          formData.append('folder', `guest_docs/${reservationId}`);
          const uploadRes = await fetch('/api/file-upload', { method: 'POST', body: formData });
          const uploadData = await uploadRes.json();
          if (uploadData.url) uploadedUrls.push(uploadData.url);
        }
      }

      // OCR + register
      if (uploadedUrls.length > 0) {
        const regRes = await fetch('/api/booking/register-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation_id: reservationId, document_urls: uploadedUrls }),
        });
        const regData = await regRes.json();
        if (regData.ocr_results) {
          setOcrNames(regData.ocr_results.map((r: any) => `${r.firstName} ${r.lastName}`.trim()).filter(Boolean));
        }
      }

      setRegStep('done');
    } catch (err) {
      console.error('[Registration]', err);
    } finally {
      setUploading(false);
    }
  };

  // ─── Failed ────────────────────────────────────────
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

  // ─── Processing ────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: '#fff8e1', color: '#8b6914' }}>⏳</div>
        <h2>Processing payment...</h2>
        <p>Please wait while we confirm your payment.</p>
        <div className="kc-spinner" style={{ margin: '16px auto', borderColor: 'rgba(46,107,79,0.2)', borderTopColor: 'var(--kc-green)' }} />

        {/* QR code if available */}
        {qrCodeUrl && (
          <div style={{ margin: '20px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Scan to pay</div>
            <img src={qrCodeUrl} alt="Payment QR" style={{ width: 200, height: 200, borderRadius: 12, border: '2px solid var(--kc-border)' }} />
          </div>
        )}

        {/* Direct payment link */}
        {paymentUrl && (
          <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="kc-btn kc-btn-primary" style={{ textDecoration: 'none', display: 'flex', marginTop: 12 }}>
            💳 Open payment page →
          </a>
        )}
      </div>
    );
  }

  // ─── Admin pending ─────────────────────────────────
  if (status === 'admin_pending') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: '#fff8e1', color: '#8b6914' }}>🏢</div>
        <h2>Waiting for administrator</h2>
        <p>Please pay at the reception. The administrator will confirm your payment.</p>

        <div className="kc-summary" style={{ textAlign: 'left', marginTop: 20 }}>
          {reservationId && <div className="kc-summary-row"><span>Booking ID</span><strong>{reservationId}</strong></div>}
          <div className="kc-summary-row"><span>Total to pay</span><strong style={{ color: 'var(--kc-green)' }}>{formatPrice(total)} Kč</strong></div>
        </div>

        {onAdminConfirm && (
          <button className="kc-btn kc-btn-primary" onClick={onAdminConfirm} type="button" style={{ marginTop: 16 }}>
            ✅ Administrator: Confirm payment received
          </button>
        )}

        <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-help-link">💬 Contact administrator</a>
      </div>
    );
  }

  // ─── Success ───────────────────────────────────────
  const allGuestsHavePhotos = guestPhotos.every(photos => photos.length > 0);
  const guestsWithPhotos = guestPhotos.filter(p => p.length > 0).length;

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
        <div className="kc-summary-row" style={{ color: 'var(--kc-green)' }}><span>Paid</span><strong>{formatPrice(total)} Kč</strong></div>
      </div>

      {/* ─── Guest Registration (per adult) ───────────── */}
      {regStep === 'none' && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, textAlign: 'left' }}>Guest registration</div>
          <p style={{ fontSize: 14, color: 'var(--kc-text-secondary)', textAlign: 'left', marginBottom: 12 }}>
            Upload a photo of ID or passport for each guest ({totalGuests} {totalGuests === 1 ? 'adult' : 'adults'}).
          </p>
          <button className="kc-btn kc-btn-primary" onClick={() => setRegStep('photo')} type="button">
            📷 Register {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'} via photo
          </button>
        </div>
      )}

      {regStep === 'photo' && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, textAlign: 'left' }}>
            📷 Guest registration ({guestsWithPhotos}/{totalGuests})
          </div>
          <div style={{ fontSize: 13, color: 'var(--kc-text-secondary)', marginBottom: 16, textAlign: 'left' }}>
            Upload document photo for each adult guest
          </div>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple
            onChange={handleFileSelect} style={{ display: 'none' }} />

          {/* Guest tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {Array.from({ length: totalGuests }, (_, i) => (
              <button key={i} type="button"
                onClick={() => setCurrentGuest(i)}
                style={{
                  flex: 1, minWidth: 80, padding: '8px 4px', borderRadius: 8,
                  border: currentGuest === i ? '2px solid var(--kc-green)' : '2px solid var(--kc-border)',
                  background: guestPhotos[i]?.length > 0 ? 'var(--kc-green-light)' : (currentGuest === i ? '#fff' : 'var(--kc-card-bg)'),
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: currentGuest === i ? 'var(--kc-green)' : 'var(--kc-text-secondary)',
                }}>
                {guestPhotos[i]?.length > 0 ? '✅' : '👤'} Guest {i + 1}
              </button>
            ))}
          </div>

          {/* Current guest's photos */}
          <div style={{ padding: '12px', background: 'var(--kc-card-bg)', borderRadius: 'var(--kc-radius-sm)', border: '1px solid var(--kc-border)', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              👤 Guest {currentGuest + 1} {guestPhotos[currentGuest]?.length > 0 ? '✅' : '— needs document'}
            </div>

            {/* Photo previews */}
            {guestPhotos[currentGuest]?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {guestPhotos[currentGuest].map((src, i) => (
                  <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--kc-green)' }}>
                    <img src={src} alt={`Doc ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removePhoto(currentGuest, i)} type="button"
                      style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="kc-btn kc-btn-secondary" style={{ flex: 1 }}
                onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }} type="button">
                🖼️ Gallery
              </button>
              <button className="kc-btn kc-btn-secondary" style={{ flex: 1 }}
                onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); } }} type="button">
                📸 Camera
              </button>
            </div>
          </div>

          {/* Next guest or submit */}
          {currentGuest < totalGuests - 1 && guestPhotos[currentGuest]?.length > 0 && (
            <button className="kc-btn kc-btn-primary" onClick={() => setCurrentGuest(currentGuest + 1)} type="button" style={{ marginBottom: 8 }}>
              Next guest → Guest {currentGuest + 2}
            </button>
          )}

          {allGuestsHavePhotos && (
            <button className="kc-btn kc-btn-primary" onClick={submitAllPhotos} disabled={uploading} type="button">
              {uploading ? <><div className="kc-spinner" /> Processing...</> : `✅ Register all ${totalGuests} guests`}
            </button>
          )}

          <button className="kc-btn kc-btn-ghost" onClick={() => setRegStep('none')} type="button">Skip registration</button>
        </div>
      )}

      {regStep === 'done' && (
        <div className="kc-alert info" style={{ marginTop: 20 }}>
          <span className="kc-alert-icon">✅</span>
          <div>
            Documents uploaded &amp; processed! Registration is complete.
            {ocrNames.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Registered: <strong>{ocrNames.join(', ')}</strong>
              </div>
            )}
          </div>
        </div>
      )}

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
