/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import './guest-page.css';
import {
  type Lang, LANG_LABELS, LANG_FLAGS,
  getTranslations, detectLanguage, getBrandName,
  formatDateLocalized, formatPriceLocalized,
} from './translations';
import {
  translateContent, translateAmenity, translateFaq,
  translateRule, translateUsefulInfo,
} from './content-translations';

// ─── Types ──────────────────────────────────────
interface GuestData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: string;
  nationality: string;
  documentType: string;
  documentNumber: string;
}

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// Helper: auto-link URLs in text
function linkifyText(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  if (parts.length <= 1) return text;
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      try {
        const url = new URL(part);
        const label = url.hostname.replace('www.', '');
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="gp-auto-link">🔗 {label}</a>;
      } catch {
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="gp-auto-link">🔗 Link</a>;
      }
    }
    return <span key={i}>{part}</span>;
  });
}

// Helper: compute days until date
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const ALL_LANGS: Lang[] = ['en', 'de', 'cs', 'uk', 'pl', 'nl', 'fr'];

export default function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regGuests, setRegGuests] = useState<GuestData[]>([{ firstName: '', lastName: '', dateOfBirth: '', address: '', nationality: '', documentType: '', documentNumber: '' }]);
  const [regLoading, setRegLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [orderingService, setOrderingService] = useState<string | null>(null);
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, number>>({});
  const [showMap, setShowMap] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Resolve async params
  useEffect(() => { params.then(p => setToken(p.token)); }, [params]);

  // Load dark mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gp-dark-mode');
    if (saved === 'true') setDarkMode(true);
  }, []);

  // Toggle dark mode class
  useEffect(() => {
    const root = document.querySelector('.guest-page-root');
    if (root) {
      root.classList.toggle('gp-dark', darkMode);
    }
    localStorage.setItem('gp-dark-mode', String(darkMode));
  }, [darkMode]);

  // Fetch data
  useEffect(() => {
    if (!token) return;
    fetch(`/api/guest/${token}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => {
        setData(d);
        setLoading(false);
        if (d.expired) return; // No more processing for expired tokens
        // Auto-detect language
        const guestCountry = d.registeredGuests?.[0]?.address || null;
        const guestPhone = d.reservation?.guest_phone || null;
        const detectedLang = detectLanguage(guestPhone, guestCountry);
        setLang(detectedLang);
        // Pre-fill registration
        if (d.registeredGuests?.length > 0) {
          setRegGuests(d.registeredGuests.map((g: any) => ({ firstName: g.first_name, lastName: g.last_name, dateOfBirth: g.date_of_birth || '', address: g.address || '', nationality: g.nationality || '', documentType: g.document_type || '', documentNumber: g.document_number || '' })));
        } else {
          const total = (d.reservation?.adults || 1) + (d.reservation?.children || 0);
          setRegGuests(Array.from({ length: total }, () => ({ firstName: '', lastName: '', dateOfBirth: '', address: '', nationality: '', documentType: '', documentNumber: '' })));
        }
      })
      .catch(() => { setError('notFound'); setLoading(false); });
  }, [token]);

  // Photos (real photos only)
  const allPhotos = data && !data.expired ? [
    ...(data.photos?.unitType || []).map((p: any) => p.url),
    ...(data.photos?.property || []).map((p: any) => p.url),
  ] : [];

  // Config
  const catType = data?.reservation?.category_type || 'resort';
  const brandName = data?.expired ? data.brandName : getBrandName(catType);
  const cfg = data?.guestPageConfig;

  const t = getTranslations(lang);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Phase helpers
  const phase = data?.phase || 'pre_arrival';
  const isRegistered = data?.registeredGuests?.length > 0;
  const isPaid = ['paid', 'prepaid'].includes(data?.reservation?.payment_status || '');
  const isCheckedIn = data?.reservation?.status === 'checked_in';
  const canAccessCheckIn = isRegistered && isPaid;
  const daysLeft = data?.reservation?.check_in ? daysUntil(data.reservation.check_in) : 0;

  // Registration handler
  const handleRegister = async () => {
    setRegLoading(true);
    try {
      const res = await fetch(`/api/guest/${token}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests: regGuests }),
      });
      if (!res.ok) throw new Error('Error');
      const result = await res.json();
      setData((prev: any) => ({ ...prev, registeredGuests: result.registeredGuests }));
      setShowRegModal(false);
      showToast(t.regSaved);
    } catch { showToast(t.regError, 'error'); }
    setRegLoading(false);
  };

  const getServiceQty = (serviceId: string) => serviceQuantities[serviceId] || 1;
  const setServiceQty = (serviceId: string, qty: number) => setServiceQuantities(prev => ({ ...prev, [serviceId]: Math.max(1, Math.min(20, qty)) }));

  const handleOrderService = async (serviceId: string) => {
    setOrderingService(serviceId);
    const quantity = getServiceQty(serviceId);
    try {
      const res = await fetch(`/api/guest/${token}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ services: [{ serviceId, quantity }] }) });
      if (!res.ok) throw new Error('Error');
      const result = await res.json();
      setData((prev: any) => ({ ...prev, orderedServices: result.orderedServices }));
      showToast(t.serviceOrdered);
    } catch { showToast(t.orderError, 'error'); }
    setOrderingService(null);
  };

  // ─── LOADING ────────────────────────────────────
  if (loading) return (
    <div className="gp-loading"><div className="gp-spinner" /><p>{t.loading}</p></div>
  );

  // ─── ERROR ──────────────────────────────────────
  if (error || !data) return (
    <div className="gp-error"><div className="gp-error-icon">🔍</div><h2>{t.notFound}</h2><p>{t.notFoundDesc}</p></div>
  );

  // ─── EXPIRED / POST-STAY PAGE ───────────────────
  if (data.expired) {
    return <PostStayPage data={data} lang={lang} setLang={setLang} showLangMenu={showLangMenu} setShowLangMenu={setShowLangMenu} darkMode={darkMode} setDarkMode={setDarkMode} />;
  }

  // ─── ACTIVE BOOKING PAGE ────────────────────────
  const r = data.reservation;
  const payPercent = r.total_price > 0 ? Math.min(100, Math.round(((data.payments?.totalPaid || 0) / r.total_price) * 100)) : 0;

  const amenities = parseJSON<any[]>(cfg?.amenities, []);
  const faqItems = parseJSON<any[]>(cfg?.faq_items, []);
  const rules = parseJSON<any[]>(cfg?.rules, []);
  const usefulInfoList = parseJSON<any[]>(cfg?.useful_info, []);
  const restaurant = cfg ? { name: cfg.restaurant_name, hours: cfg.restaurant_hours, menuUrl: cfg.restaurant_menu_url } : null;

  return (
    <>
      {/* ═══ HEADER ═══ */}
      <header className="gp-header-bar">
        <div className="gp-header-inner">
          <div className="gp-header-brand">
            <div className="gp-header-logo">{brandName}</div>
            <span className={`gp-header-cat-badge ${catType}`}>{catType}</span>
          </div>
          <div className="gp-header-right">
            {cfg?.wifi_password && (
              <div className="gp-header-wifi" onClick={() => { navigator.clipboard.writeText(cfg.wifi_password); showToast(t.copied); }}>
                <span className="gp-header-wifi-label">{t.wifi}:</span>
                <span className="gp-header-wifi-pass">{cfg.wifi_password}</span>
              </div>
            )}
            {/* Dark mode toggle */}
            <button className="gp-dark-toggle" onClick={() => setDarkMode(!darkMode)} title={darkMode ? t.lightMode : t.darkMode}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            {/* Language switcher */}
            <div className="gp-lang-switch">
              <button className="gp-lang-btn" onClick={() => setShowLangMenu(!showLangMenu)}>
                {LANG_FLAGS[lang]} {lang.toUpperCase()}
              </button>
              {showLangMenu && (
                <div className="gp-lang-dropdown">
                  {ALL_LANGS.map(l => (
                    <button key={l} className={`gp-lang-option ${l === lang ? 'active' : ''}`} onClick={() => { setLang(l); setShowLangMenu(false); }}>
                      {LANG_FLAGS[l]} {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="gp-container">
      {/* ═══ HERO CARD ═══ */}
      <section className="gp-hero-card">
          <div className="gp-hero-photo">
            {allPhotos.length > 0 ? (
              <>
                <img src={allPhotos[photoIdx]} alt={r.unit_type_name} onClick={() => { setLightboxIndex(photoIdx); setLightboxOpen(true); }} />
                {allPhotos.length > 1 && (
                  <>
                    <button className="gp-photo-nav prev" onClick={() => setPhotoIdx(i => (i - 1 + allPhotos.length) % allPhotos.length)}>‹</button>
                    <button className="gp-photo-nav next" onClick={() => setPhotoIdx(i => (i + 1) % allPhotos.length)}>›</button>
                    <div className="gp-photo-dots">
                      {allPhotos.slice(0, 5).map((_: any, i: number) => (
                        <span key={i} className={`gp-photo-dot ${i === photoIdx ? 'active' : ''}`} onClick={() => setPhotoIdx(i)} />
                      ))}
                      {allPhotos.length > 5 && <span className="gp-photo-dot-more">+{allPhotos.length - 5}</span>}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="gp-no-photo">
                <span className="gp-no-photo-icon">🏠</span>
                <span className="gp-no-photo-text">{r.unit_type_name}</span>
              </div>
            )}
          </div>
          <div className="gp-hero-info">
            {/* Welcome greeting */}
            <div className="gp-welcome-greeting">
              {phase === 'checked_in' ? t.enjoyStay
                : phase === 'post_checkout' ? t.thankYou(r.first_name)
                : t.welcome(r.first_name)}
            </div>
            <div className="gp-hero-name">{r.unit_type_name}</div>
            <div className="gp-hero-unit">{r.unit_name} • {r.building_name || r.category_name}</div>
            {r.unit_type_description && <div className="gp-hero-desc">{translateContent(r.unit_type_description, lang)}</div>}
            <div className="gp-hero-meta">
              <div className="gp-meta-row"><span className="gp-meta-label">{t.checkIn}</span><span className="gp-meta-value">{formatDateLocalized(r.check_in, lang)} • {r.check_in_time}</span></div>
              <div className="gp-meta-row"><span className="gp-meta-label">{t.checkOut}</span><span className="gp-meta-value">{formatDateLocalized(r.check_out, lang)} • {r.check_out_time}</span></div>
              <div className="gp-meta-row"><span className="gp-meta-label">{t.nights}</span><span className="gp-meta-value">{r.nights}</span></div>
              <div className="gp-meta-row"><span className="gp-meta-label">{t.guests}</span><span className="gp-meta-value">{r.adults} {t.adultsShort}{r.children > 0 ? ` + ${r.children} ${t.childrenShort}` : ''}</span></div>
              <div className="gp-meta-row"><span className="gp-meta-label">{t.price}</span><span className="gp-meta-value gp-price">{formatPriceLocalized(r.total_price, r.currency)}</span></div>
            </div>
            {/* Payment bar */}
            <div className="gp-pay-bar">
              <div className="gp-pay-labels">
                <span>{t.payment}: <span className="gp-pay-ok">{formatPriceLocalized(data.payments?.totalPaid || 0, r.currency)}</span></span>
                <span>{t.remaining}: {formatPriceLocalized(data.payments?.remaining || 0, r.currency)}</span>
              </div>
              <div className="gp-pay-track"><div className="gp-pay-fill" style={{ width: `${payPercent}%` }} /></div>
            </div>
            {/* Navigation button */}
            {cfg?.maps_url && (
              <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer" className="gp-nav-btn">
                {t.howToGetThere}
              </a>
            )}
          </div>
        </section>

        {/* ═══ COUNTDOWN (pre-arrival) ═══ */}
        {phase === 'pre_arrival' && daysLeft > 0 && (
          <div className="gp-countdown">
            <span className="gp-countdown-num">{daysLeft}</span>
            <span className="gp-countdown-text">{t.arrivesIn(daysLeft)}</span>
          </div>
        )}

        {/* ═══ PROGRESS STEPPER ═══ */}
        <div className="gp-stepper">
          <div className={`gp-step ${isRegistered ? 'done' : 'active'}`}>
            <div className="gp-step-circle">{isRegistered ? '✓' : '1'}</div>
            <div className="gp-step-label">{t.stepRegistration}</div>
          </div>
          <div className="gp-step-line" />
          <div className={`gp-step ${isPaid ? 'done' : isRegistered ? 'active' : ''}`}>
            <div className="gp-step-circle">{isPaid ? '✓' : '2'}</div>
            <div className="gp-step-label">{t.stepPayment}</div>
          </div>
          <div className="gp-step-line" />
          <div className={`gp-step ${isCheckedIn ? 'done' : canAccessCheckIn ? 'active' : ''}`}>
            <div className="gp-step-circle">{isCheckedIn ? '✓' : '3'}</div>
            <div className="gp-step-label">{t.stepCheckIn}</div>
          </div>
        </div>

        {/* Registration CTA or edit */}
        <div className="gp-reg-actions">
          {!isRegistered ? (
            <button className="gp-reg-btn" onClick={() => setShowRegModal(true)}>{t.completeReg}</button>
          ) : (
            <button className="gp-reg-btn complete" onClick={() => setShowRegModal(true)}>{t.editReg}</button>
          )}
        </div>

        {/* ═══ CHECK-IN ACCESS (gated) ═══ */}
        {canAccessCheckIn && cfg?.lock_code && (
          <div className="gp-access-card">
            <div className="gp-access-icon">🔑</div>
            <div className="gp-access-info">
              <div className="gp-access-label">{t.lockCode}</div>
              <div className="gp-access-code">{cfg.lock_code}</div>
            </div>
            {cfg?.check_in_instructions && (
              <div className="gp-access-instructions">{translateContent(cfg.check_in_instructions, lang)}</div>
            )}
          </div>
        )}
        {!canAccessCheckIn && (
          <div className="gp-access-locked">
            <span>🔒</span> {t.completeSteps}
          </div>
        )}

        {/* ═══ AMENITIES ═══ */}
        {amenities.length > 0 && (
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.amenities}</h2>
          <div className="gp-amenities-inline">
            {amenities.map((am: any, i: number) => {
              const ta = translateAmenity(am, lang);
              return <span key={i} className="gp-amenity-tag">{ta.icon} {ta.name}</span>;
            })}
          </div>
        </section>
        )}

        {/* ═══ SERVICES ═══ */}
        {data.services?.length > 0 && (
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.services}</h2>
          <div className="gp-services-grid">
              {/* Restaurant card */}
              {restaurant?.hours && (
                <div className="gp-service-card gp-restaurant-service">
                  <div className="gp-service-icon">🍽️</div>
                  <div className="gp-service-name">{translateContent(restaurant.name || 'Ресторан', lang)}</div>
                  <div className="gp-service-desc">{translateContent(restaurant.hours, lang)}</div>
                  {restaurant.menuUrl && (
                    <a href={restaurant.menuUrl} target="_blank" rel="noopener noreferrer" className="gp-menu-link-sm">{t.menu}</a>
                  )}
                </div>
              )}
              {data.services?.map((svc: any) => {
                const isOrdered = data.orderedServices?.some((o: any) => o.service_id === svc.id);
                const qty = getServiceQty(svc.id);
                return (
                  <div key={svc.id} className="gp-service-card">
                    <div className="gp-service-icon">{svc.icon}</div>
                    <div className="gp-service-name">{svc.name_en && lang !== 'uk' ? svc.name_en : translateContent(svc.name, lang)}</div>
                    <div className="gp-service-desc">{translateContent(svc.description, lang)}</div>
                    <div className="gp-service-bottom">
                      <div>
                        <span className="gp-service-price">{formatPriceLocalized(svc.price * qty, svc.currency)}</span>
                        <div className="gp-service-price-unit">{translateContent(svc.unit_label, lang)}</div>
                      </div>
                      <div className="gp-service-actions">
                        {!isOrdered && (
                          <div className="gp-qty-selector">
                            <button className="gp-qty-btn" onClick={() => setServiceQty(svc.id, qty - 1)} disabled={qty <= 1}>−</button>
                            <span className="gp-qty-value">{qty}</span>
                            <button className="gp-qty-btn" onClick={() => setServiceQty(svc.id, qty + 1)} disabled={qty >= 20}>+</button>
                          </div>
                        )}
                        <button className={`gp-service-order-btn ${isOrdered ? 'ordered' : ''}`}
                          onClick={() => !isOrdered && handleOrderService(svc.id)}
                          disabled={isOrdered || orderingService === svc.id}>
                          {orderingService === svc.id ? '...' : isOrdered ? t.ordered : t.order}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
        )}

        {/* ═══ TERRITORY MAP ═══ */}
        {cfg?.territory_map_url && (
        <section className="gp-section-compact">
          <div className="gp-map-row">
            <h2 className="gp-section-title-compact" style={{ marginBottom: 0 }}>{t.territoryMap}</h2>
            <button className="gp-map-expand-btn" onClick={() => setShowMap(true)} title={t.openMap}>🔍</button>
          </div>
          <div className="gp-map-compact" onClick={() => setShowMap(true)}>
            <img src={cfg.territory_map_url} alt={t.territoryMap} />
          </div>
        </section>
        )}

        {/* ═══ USEFUL INFO ═══ */}
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.usefulInfo}</h2>
          <div className="gp-useful-grid">
            {cfg?.wifi_password && (
              <div className="gp-useful-card gp-wifi-useful">
                <div className="gp-useful-icon">📶</div>
                <div className="gp-useful-title">{t.wifiNetwork}: <strong>{cfg.wifi_network || 'ALiSiO_Guest'}</strong></div>
                <div className="gp-useful-desc">{t.wifiPassword}: <span className="gp-wifi-pass-text">{cfg.wifi_password}</span></div>
                <button className="gp-wifi-copy-sm" onClick={() => { navigator.clipboard.writeText(cfg.wifi_password); showToast(t.copied); }}>{t.copyPassword}</button>
              </div>
            )}
            {usefulInfoList.map((info: any, i: number) => {
              const ti = translateUsefulInfo(info, lang);
              return (
              <div key={i} className="gp-useful-card">
                <div className="gp-useful-icon">{ti.icon}</div>
                <div className="gp-useful-title">{ti.title}</div>
                <div className="gp-useful-desc">{linkifyText(ti.desc)}</div>
              </div>);
            })}
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        {faqItems.length > 0 && (
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.faq}</h2>
          <div className="gp-faq-list">
            {faqItems.map((item: any, i: number) => {
              const tf = translateFaq(item, lang);
              return (
              <div key={i} className="gp-faq-item">
                <button className="gp-faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {tf.q}
                  <span className={`gp-faq-arrow ${openFaq === i ? 'open' : ''}`}>▾</span>
                </button>
                {openFaq === i && <div className="gp-faq-answer">{tf.a}</div>}
              </div>);
            })}
          </div>
        </section>
        )}

        {/* ═══ RULES ═══ */}
        {rules.length > 0 && (
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.rules}</h2>
          <div className="gp-rules-card">
            <ul className="gp-rules-list">
              {rules.map((rule: any, i: number) => {
                const tr = translateRule(rule, lang);
                return <li key={i}><span className="rule-icon">{tr.icon}</span> {tr.text}</li>;
              })}
            </ul>
          </div>
        </section>
        )}

      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="gp-footer">
        <div className="gp-footer-logo">{brandName}</div>
        <div>{t.footerLocation}</div>
      </footer>

      {/* ═══ REGISTRATION MODAL ═══ */}
      {showRegModal && (
        <div className="gp-modal-overlay" onClick={() => setShowRegModal(false)}>
          <div className="gp-modal" onClick={e => e.stopPropagation()}>
            <div className="gp-modal-header">
              <div className="gp-modal-title">{t.regTitle}</div>
              <button className="gp-modal-close" onClick={() => setShowRegModal(false)}>✕</button>
            </div>
            <div className="gp-modal-body">
              <p style={{ fontSize: '13px', color: 'var(--gp-text-secondary)', marginBottom: '12px' }}>
                {t.regInstructions((data?.reservation?.adults || 1) + (data?.reservation?.children || 0))}
              </p>
              {regGuests.map((guest, idx) => (
                <div key={idx} className="gp-person-card">
                  <div className="gp-person-header">
                    <div className="gp-person-title">{t.guestN(idx + 1)}</div>
                    {regGuests.length > 1 && (
                      <button className="gp-person-remove" onClick={() => setRegGuests(g => g.filter((_, i) => i !== idx))}>✕</button>
                    )}
                  </div>
                  <div className="gp-form-row">
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.firstName}</label>
                      <input className="gp-form-input" value={guest.firstName} placeholder={t.firstName.replace(' *', '')}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, firstName: e.target.value } : p))} />
                    </div>
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.lastName}</label>
                      <input className="gp-form-input" value={guest.lastName} placeholder={t.lastName.replace(' *', '')}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, lastName: e.target.value } : p))} />
                    </div>
                  </div>
                  <div className="gp-form-row">
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.dateOfBirth}</label>
                      <input type="date" className="gp-form-input" value={guest.dateOfBirth}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, dateOfBirth: e.target.value } : p))} />
                    </div>
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.nationality}</label>
                      <input className="gp-form-input" value={guest.nationality} placeholder={t.nationality.replace(' *', '')}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, nationality: e.target.value } : p))} />
                    </div>
                  </div>
                  <div className="gp-form-row">
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.documentType}</label>
                      <select className="gp-form-input" value={guest.documentType}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, documentType: e.target.value } : p))}>
                        <option value="">{t.selectDocument}</option>
                        <option value="passport">{t.passport}</option>
                        <option value="id_card">{t.idCard}</option>
                        <option value="driving_license">{t.drivingLicense}</option>
                      </select>
                    </div>
                    <div className="gp-form-group">
                      <label className="gp-form-label">{t.documentNumber}</label>
                      <input className="gp-form-input" value={guest.documentNumber} placeholder={t.documentNumber}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, documentNumber: e.target.value } : p))} />
                    </div>
                  </div>
                  <div className="gp-form-row">
                    <div className="gp-form-group" style={{ flex: 1 }}>
                      <label className="gp-form-label">{t.residence}</label>
                      <input className="gp-form-input" value={guest.address} placeholder={t.residence}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, address: e.target.value } : p))} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="gp-btn-secondary" style={{ width: '100%' }}
                onClick={() => setRegGuests(g => [...g, { firstName: '', lastName: '', dateOfBirth: '', address: '', nationality: '', documentType: '', documentNumber: '' }])}>
                {t.addGuest}
              </button>
            </div>
            <div className="gp-modal-footer">
              <button className="gp-btn-secondary" onClick={() => setShowRegModal(false)}>{t.cancel}</button>
              <button className="gp-btn-primary" onClick={handleRegister} disabled={regLoading}>
                {regLoading ? t.saving : t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LIGHTBOX ═══ */}
      {lightboxOpen && allPhotos.length > 0 && (
        <div className="gp-lightbox" onClick={() => setLightboxOpen(false)}>
          <button className="gp-lightbox-close" onClick={() => setLightboxOpen(false)}>✕</button>
          <img className="gp-lightbox-img" src={allPhotos[lightboxIndex]} alt="" onClick={e => e.stopPropagation()} />
          {allPhotos.length > 1 && (
            <>
              <button className="gp-lightbox-nav prev" onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + allPhotos.length) % allPhotos.length); }}>‹</button>
              <button className="gp-lightbox-nav next" onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % allPhotos.length); }}>›</button>
              <div className="gp-lightbox-counter">{lightboxIndex + 1} / {allPhotos.length}</div>
            </>
          )}
        </div>
      )}

      {/* ═══ MAP POPUP ═══ */}
      {showMap && cfg?.territory_map_url && (
        <div className="gp-lightbox" onClick={() => setShowMap(false)}>
          <button className="gp-lightbox-close" onClick={() => setShowMap(false)}>✕</button>
          <img className="gp-lightbox-img" src={cfg.territory_map_url} alt={t.territoryMap} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && <div className={`gp-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

// ════════════════════════════════════════════════════════════
// POST-STAY RE-ENGAGEMENT PAGE
// ════════════════════════════════════════════════════════════
function PostStayPage({ data, lang, setLang, showLangMenu, setShowLangMenu, darkMode, setDarkMode }: {
  data: any; lang: Lang; setLang: (l: Lang) => void; showLangMenu: boolean; setShowLangMenu: (v: boolean) => void; darkMode: boolean; setDarkMode: (v: boolean) => void;
}) {
  const t = getTranslations(lang);
  const brandName = data.brandName || 'ALiSiO Resort';
  const guestName = data.guestName || '';
  const unitTypes = data.unitTypes || [];

  // Category type icons
  const catIcons: Record<string, string> = { glamping: '🏕️', resort: '🏨', camping: '⛺' };

  return (
    <>
      {/* Header */}
      <header className="gp-header-bar">
        <div className="gp-header-inner">
          <div className="gp-header-brand">
            <div className="gp-header-logo">{brandName}</div>
          </div>
          <div className="gp-header-right">
            <button className="gp-dark-toggle" onClick={() => setDarkMode(!darkMode)} title={darkMode ? t.lightMode : t.darkMode}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <div className="gp-lang-switch">
              <button className="gp-lang-btn" onClick={() => setShowLangMenu(!showLangMenu)}>
                {LANG_FLAGS[lang]} {lang.toUpperCase()}
              </button>
              {showLangMenu && (
                <div className="gp-lang-dropdown">
                  {ALL_LANGS.map(l => (
                    <button key={l} className={`gp-lang-option ${l === lang ? 'active' : ''}`} onClick={() => { setLang(l); setShowLangMenu(false); }}>
                      {LANG_FLAGS[l]} {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="gp-container gp-post-stay">
        {/* Thank you hero */}
        <section className="gp-ps-hero">
          <div className="gp-ps-hero-emoji">🌟</div>
          <h1 className="gp-ps-hero-title">{t.thankYou(guestName)}</h1>
          <p className="gp-ps-hero-subtitle">{t.thankYouStay}</p>
          <p className="gp-ps-hero-comeback">{t.comeBack}</p>
        </section>

        {/* Early booking promo */}
        <section className="gp-ps-promo">
          <div className="gp-ps-promo-badge">🎁 -30%</div>
          <h2 className="gp-ps-promo-title">{t.earlyBooking}</h2>
          <p className="gp-ps-promo-desc">{t.earlyBookingDesc}</p>
          <div className="gp-ps-promo-conditions">
            <span>✓ 30% {t.discount}</span>
            <span>✓ Min. 2 {t.nights.replace('🌙 ', '')}</span>
          </div>
        </section>

        {/* Unit types showcase */}
        <section className="gp-ps-units">
          <h2 className="gp-ps-section-title">{t.ourAccommodations}</h2>
          <div className="gp-ps-units-grid">
            {unitTypes.map((ut: any) => (
              <div key={ut.id} className="gp-ps-unit-card">
                <div className="gp-ps-unit-icon">{catIcons[ut.category_type] || '🏠'}</div>
                <div className="gp-ps-unit-info">
                  <div className="gp-ps-unit-name">{ut.name}</div>
                  <div className="gp-ps-unit-meta">
                    {ut.category_name} • {ut.max_adults} {t.adultsShort}
                    {ut.max_children > 0 ? ` + ${ut.max_children} ${t.childrenShort}` : ''}
                  </div>
                  {ut.description && <div className="gp-ps-unit-desc">{translateContent(ut.description, lang)}</div>}
                </div>
                <button className="gp-ps-unit-btn">{t.selectAccommodation}</button>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="gp-ps-contact">
          <div className="gp-ps-contact-row">
            {data.propertyEmail && (
              <a href={`mailto:${data.propertyEmail}`} className="gp-ps-contact-btn">📧 {data.propertyEmail}</a>
            )}
            {data.propertyPhone && (
              <a href={`tel:${data.propertyPhone}`} className="gp-ps-contact-btn">📞 {data.propertyPhone}</a>
            )}
          </div>
        </section>
      </div>

      <footer className="gp-footer">
        <div className="gp-footer-logo">{brandName}</div>
        <div>{t.footerLocation}</div>
      </footer>
    </>
  );
}
