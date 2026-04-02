/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
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
}

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

const PLACEHOLDER_PHOTOS = [
  '/api/placeholder/800/600?text=Room+Interior',
  '/api/placeholder/800/600?text=Room+View',
  '/api/placeholder/800/600?text=Bathroom',
];

const ALL_LANGS: Lang[] = ['en', 'de', 'cs', 'uk', 'pl', 'nl', 'fr'];

// ─── Main Component ─────────────────────────────
export default function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regGuests, setRegGuests] = useState<GuestData[]>([{ firstName: '', lastName: '', dateOfBirth: '', address: '' }]);
  const [regLoading, setRegLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [orderingService, setOrderingService] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  const t = getTranslations(lang);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => { params.then(p => setToken(p.token)); }, [params]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/guest/${token}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => {
        setData(d);
        setLoading(false);
        // Auto-detect language
        const guestCountry = d.registeredGuests?.[0]?.address || null;
        const guestPhone = d.reservation?.guest_phone || null;
        const detectedLang = detectLanguage(guestPhone, guestCountry);
        setLang(detectedLang);
        // Pre-fill registration
        if (d.registeredGuests?.length > 0) {
          setRegGuests(d.registeredGuests.map((g: any) => ({ firstName: g.first_name, lastName: g.last_name, dateOfBirth: g.date_of_birth || '', address: g.address || '' })));
        } else {
          const total = (d.reservation?.adults || 1) + (d.reservation?.children || 0);
          setRegGuests(Array.from({ length: total }, () => ({ firstName: '', lastName: '', dateOfBirth: '', address: '' })));
        }
      })
      .catch(() => { setError('notFound'); setLoading(false); });
  }, [token]);

  // Photos
  const allPhotos = data ? [
    ...(data.photos?.unitType || []).map((p: any) => p.url),
    ...(data.photos?.property || []).map((p: any) => p.url),
    ...((!data.photos?.unitType?.length && !data.photos?.property?.length) ? PLACEHOLDER_PHOTOS : []),
  ] : [];

  // Config
  const catType = data?.reservation?.category_type || 'resort';
  const brandName = getBrandName(catType);
  const cfg = data?.guestPageConfig;
  const amenities = parseJSON<{ icon: string; name: string }[]>(cfg?.amenities, []);
  const faqItems = parseJSON<{ q: string; a: string }[]>(cfg?.faq_items, []);
  const rulesList = parseJSON<{ icon: string; text: string }[]>(cfg?.rules, []);
  const usefulInfoList = parseJSON<{ icon: string; title: string; desc: string }[]>(cfg?.useful_info, []);
  const wifiNetwork = cfg?.wifi_network || 'ALiSiO_Guest';
  const wifiPasswordStr = cfg?.wifi_password || 'ALiSiO2026!';
  const restaurantName = cfg?.restaurant_name || 'Ресторан';
  const restaurantHours = cfg?.restaurant_hours || '';
  const restaurantMenuUrl = cfg?.restaurant_menu_url || null;

  const isRegistered = data?.registeredGuests?.length > 0;
  const totalGuests = (data?.reservation?.adults || 0) + (data?.reservation?.children || 0);

  // Payment status translation
  const paymentStatusLabel = (s: string) => {
    const map: Record<string, string> = { unpaid: t.unpaid, payment_requested: t.paymentRequested, prepaid: t.prepaid, paid: t.paidFull };
    return map[s] || s;
  };

  const handleRegister = async () => {
    setRegLoading(true);
    try {
      const res = await fetch(`/api/guest/${token}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests: regGuests }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }
      const result = await res.json();
      setData((prev: any) => ({ ...prev, registeredGuests: result.registeredGuests }));
      setShowRegModal(false);
      showToast(t.regSaved);
    } catch (e: any) { showToast(e.message || t.regError, 'error'); }
    setRegLoading(false);
  };

  const handleOrderService = async (serviceId: string) => {
    setOrderingService(serviceId);
    try {
      const res = await fetch(`/api/guest/${token}/services`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ services: [{ serviceId, quantity: 1 }] }) });
      if (!res.ok) throw new Error('Error');
      const result = await res.json();
      setData((prev: any) => ({ ...prev, orderedServices: result.orderedServices }));
      showToast(t.serviceOrdered);
    } catch { showToast(t.orderError, 'error'); }
    setOrderingService(null);
  };

  const copyWifi = () => { navigator.clipboard.writeText(wifiPasswordStr).then(() => showToast(t.copied)).catch(() => {}); };

  // Loading / Error states
  if (loading) return (<div className="gp-loading"><div className="gp-spinner" /><p style={{ color: 'var(--gp-text-secondary)' }}>{getTranslations('en').loading}</p></div>);
  if (error || !data) return (<div className="gp-error"><div className="gp-error-icon">🔍</div><h2>{getTranslations('en').notFound}</h2><p>{getTranslations('en').notFoundDesc}</p></div>);

  const r = data.reservation;

  return (
    <>
      {/* ═══ HEADER BAR ═══ */}
      <header className="gp-header-bar">
        <div className="gp-header-inner">
          <div className="gp-header-brand">
            <span className="gp-header-logo">{brandName}</span>
            <span className={`gp-header-cat-badge ${catType}`}>{r.category_icon} {r.category_name}</span>
          </div>
          <div className="gp-header-right">
            <div className="gp-header-wifi" onClick={copyWifi} title={t.copyPassword}>
              <span className="gp-header-wifi-label">📶 {wifiNetwork}</span>
              <span className="gp-header-wifi-pass">{wifiPasswordStr}</span>
            </div>
            {/* Language switcher */}
            <div className="gp-lang-switch">
              <button className="gp-lang-btn" onClick={() => setShowLangMenu(!showLangMenu)}>
                {LANG_FLAGS[lang]} {lang.toUpperCase()}
              </button>
              {showLangMenu && (
                <div className="gp-lang-dropdown">
                  {ALL_LANGS.map(l => (
                    <button key={l} className={`gp-lang-option ${l === lang ? 'active' : ''}`}
                      onClick={() => { setLang(l); setShowLangMenu(false); }}>
                      {LANG_FLAGS[l]} {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ═══ HERO: Photo + Booking Info ═══ */}
      <div className="gp-container">
        <section className="gp-hero-card">
          <div className="gp-hero-photo">
            {allPhotos.length > 0 && (
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
            )}
          </div>
          <div className="gp-hero-info">
            <h1 className="gp-hero-name">{r.unit_type_name}</h1>
            <div className="gp-hero-unit">{r.unit_name} · {brandName}</div>
            {r.unit_type_description && <p className="gp-hero-desc">{r.unit_type_description}</p>}
            <div className="gp-hero-meta">
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.checkIn}</span>
                <span className="gp-meta-value">{formatDateLocalized(r.check_in, lang)}</span>
              </div>
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.checkOut}</span>
                <span className="gp-meta-value">{formatDateLocalized(r.check_out, lang)}</span>
              </div>
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.nights}</span>
                <span className="gp-meta-value">{r.nights}</span>
              </div>
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.guests}</span>
                <span className="gp-meta-value">{r.adults} {t.adultsShort}{r.children > 0 ? ` + ${r.children} ${t.childrenShort}` : ''}</span>
              </div>
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.price}</span>
                <span className="gp-meta-value gp-price">{formatPriceLocalized(r.total_price, r.currency)}</span>
              </div>
              <div className="gp-meta-row">
                <span className="gp-meta-label">{t.payment}</span>
                <span className="gp-meta-value">{paymentStatusLabel(r.payment_status)}</span>
              </div>
            </div>
            <div className="gp-pay-bar">
              <div className="gp-pay-labels">
                <span>{t.paid}: <strong className="gp-pay-ok">{formatPriceLocalized(data.payments.totalPaid, r.currency)}</strong></span>
                <span>{t.remaining}: {formatPriceLocalized(data.payments.remaining, r.currency)}</span>
              </div>
              <div className="gp-pay-track">
                <div className="gp-pay-fill" style={{ width: `${Math.min(100, r.total_price > 0 ? (data.payments.totalPaid / r.total_price) * 100 : 0)}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ REGISTRATION BAR ═══ */}
        <div className="gp-registration">
          <div className="gp-registration-status">
            <div className={`gp-reg-dot ${isRegistered ? 'complete' : 'incomplete'}`} />
            <span className={`gp-reg-text ${isRegistered ? 'complete' : 'incomplete'}`}>
              {isRegistered ? `${t.regComplete} (${data.registeredGuests.length}/${totalGuests})` : t.regIncomplete}
            </span>
          </div>
          <button className={`gp-reg-btn ${isRegistered ? 'complete' : ''}`} onClick={() => setShowRegModal(true)}>
            {isRegistered ? t.editReg : t.completeReg}
          </button>
        </div>

        {/* ═══ AMENITIES ═══ */}
        {amenities.length > 0 && (
          <section className="gp-section-compact">
            <h2 className="gp-section-title-compact">{t.amenities}</h2>
            <div className="gp-amenities-inline">
              {amenities.map((a: any, i: number) => {
                const ta = translateAmenity(a, lang);
                return <span key={i} className="gp-amenity-tag">{ta.icon} {ta.name}</span>;
              })}
            </div>
          </section>
        )}

        {/* ═══ SERVICES + RESTAURANT ═══ */}
        {(data.services?.length > 0 || restaurantName) && (
          <section className="gp-section-compact">
            <h2 className="gp-section-title-compact">{t.services}</h2>
            <div className="gp-services-grid">
              <div className="gp-service-card gp-restaurant-service">
                <div className="gp-service-icon">🍽️</div>
                <div className="gp-service-name">{translateContent(restaurantName, lang)}</div>
                <div className="gp-service-desc" style={{ whiteSpace: 'pre-line' }}>{translateContent(restaurantHours, lang)}</div>
                {restaurantMenuUrl && (
                  <a href={restaurantMenuUrl} className="gp-menu-link-sm" target="_blank" rel="noopener noreferrer">{t.menu}</a>
                )}
              </div>
              {data.services?.map((svc: any) => {
                const isOrdered = data.orderedServices?.some((o: any) => o.service_id === svc.id);
                return (
                  <div key={svc.id} className="gp-service-card">
                    <div className="gp-service-icon">{svc.icon}</div>
                    <div className="gp-service-name">{translateContent(svc.name, lang)}</div>
                    <div className="gp-service-desc">{translateContent(svc.description, lang)}</div>
                    <div className="gp-service-bottom">
                      <div>
                        <span className="gp-service-price">{formatPriceLocalized(svc.price, svc.currency)}</span>
                        <div className="gp-service-price-unit">{translateContent(svc.unit_label, lang)}</div>
                      </div>
                      <button className={`gp-service-order-btn ${isOrdered ? 'ordered' : ''}`}
                        onClick={() => !isOrdered && handleOrderService(svc.id)}
                        disabled={isOrdered || orderingService === svc.id}>
                        {orderingService === svc.id ? '...' : isOrdered ? t.ordered : t.order}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══ TERRITORY MAP ═══ */}
        <section className="gp-section-compact">
          <div className="gp-map-row">
            <h2 className="gp-section-title-compact" style={{ marginBottom: 0 }}>{t.territoryMap}</h2>
            <button className="gp-map-expand-btn" onClick={() => setShowMap(true)} title={t.openMap}>🔍</button>
          </div>
          <div className="gp-map-compact" onClick={() => setShowMap(true)}>
            <img src="/api/placeholder/800/300?text=Territory+Map" alt={t.territoryMap} />
          </div>
        </section>

        {/* ═══ USEFUL INFO ═══ */}
        <section className="gp-section-compact">
          <h2 className="gp-section-title-compact">{t.usefulInfo}</h2>
          <div className="gp-useful-grid">
            <div className="gp-useful-card gp-wifi-useful">
              <div className="gp-useful-icon">📶</div>
              <div className="gp-useful-title">{t.wifi}</div>
              <div className="gp-useful-desc">
                {t.wifiNetwork}: <strong>{wifiNetwork}</strong><br />
                {t.wifiPassword}: <strong className="gp-wifi-pass-text">{wifiPasswordStr}</strong>
              </div>
              <button className="gp-wifi-copy-sm" onClick={copyWifi}>{t.copyPassword}</button>
            </div>
            {usefulInfoList.map((info: any, i: number) => {
              const ti = translateUsefulInfo(info, lang);
              return (
              <div key={i} className="gp-useful-card">
                <div className="gp-useful-icon">{ti.icon}</div>
                <div className="gp-useful-title">{ti.title}</div>
                <div className="gp-useful-desc">{ti.desc}</div>
              </div>);
            })}
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        {faqItems.length > 0 && (
          <section className="gp-section-compact">
            <h2 className="gp-section-title-compact">{t.faq}</h2>
            <div className="gp-faq-list">
              {faqItems.map((faq: any, i: number) => {
                const tf = translateFaq(faq, lang);
                return (
                <div key={i} className="gp-faq-item">
                  <button className="gp-faq-question" onClick={() => setOpenFaqs(prev => {
                    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n;
                  })}>
                    {tf.q}
                    <span className={`gp-faq-arrow ${openFaqs.has(i) ? 'open' : ''}`}>▾</span>
                  </button>
                  {openFaqs.has(i) && <div className="gp-faq-answer">{tf.a}</div>}
                </div>);
              })}
            </div>
          </section>
        )}

        {/* ═══ RULES ═══ */}
        {rulesList.length > 0 && (
          <section className="gp-section-compact">
            <h2 className="gp-section-title-compact">{t.rules}</h2>
            <div className="gp-rules-card">
              <ul className="gp-rules-list">
                {rulesList.map((rule: any, i: number) => {
                  const tr = translateRule(rule, lang);
                  return <li key={i}><span className="rule-icon">{tr.icon}</span>{tr.text}</li>;
                })}
              </ul>
            </div>
          </section>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="gp-footer">
        <div className="gp-footer-logo">{brandName}</div>
        <p>{t.footerLocation} · info@alisio.cz</p>
      </footer>

      {/* ═══ REGISTRATION MODAL ═══ */}
      {showRegModal && (
        <div className="gp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRegModal(false); }}>
          <div className="gp-modal">
            <div className="gp-modal-header">
              <div className="gp-modal-title">{t.regTitle}</div>
              <button className="gp-modal-close" onClick={() => setShowRegModal(false)}>✕</button>
            </div>
            <div className="gp-modal-body">
              <p style={{ fontSize: 13, color: 'var(--gp-text-secondary)', marginBottom: 20 }}>
                {t.regInstructions(totalGuests)}
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
                      <label className="gp-form-label">{t.residence}</label>
                      <input className="gp-form-input" value={guest.address} placeholder={t.residence}
                        onChange={(e) => setRegGuests(g => g.map((p, i) => i === idx ? { ...p, address: e.target.value } : p))} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="gp-btn-secondary" style={{ width: '100%' }}
                onClick={() => setRegGuests(g => [...g, { firstName: '', lastName: '', dateOfBirth: '', address: '' }])}>
                {t.addGuest}
              </button>
            </div>
            <div className="gp-modal-footer">
              <button className="gp-btn-secondary" onClick={() => setShowRegModal(false)}>{t.cancel}</button>
              <button className="gp-btn-primary" onClick={handleRegister} disabled={regLoading || regGuests.some(g => !g.firstName || !g.lastName)}>
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
          <button className="gp-lightbox-nav prev" onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + allPhotos.length) % allPhotos.length); }}>‹</button>
          <img className="gp-lightbox-img" src={allPhotos[lightboxIndex]} alt={`Photo ${lightboxIndex + 1}`} onClick={e => e.stopPropagation()} />
          <button className="gp-lightbox-nav next" onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % allPhotos.length); }}>›</button>
          <div className="gp-lightbox-counter">{lightboxIndex + 1} / {allPhotos.length}</div>
        </div>
      )}

      {/* ═══ MAP POPUP ═══ */}
      {showMap && (
        <div className="gp-lightbox" onClick={() => setShowMap(false)}>
          <button className="gp-lightbox-close" onClick={() => setShowMap(false)}>✕</button>
          <img className="gp-lightbox-img" src="/api/placeholder/1200/800?text=Territory+Map+Full" alt={t.territoryMap} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && <div className={`gp-toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
