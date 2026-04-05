/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './guest-page.css';
import {
  type Lang, LANG_LABELS,
  getTranslations, detectLanguage, getBrandName,
  formatDateLocalized, formatPriceLocalized,
} from './translations';
import {
  translateContent, translateAmenity,
  translateRule, translateUsefulInfo,
} from './content-translations';

// ─── Helpers ────────────────────────────────────
function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOfStay(checkIn: string): number {
  const start = new Date(checkIn + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

type Phase = 'before' | 'checkin_day' | 'during' | 'checkout';

const ALL_LANGS: Lang[] = ['en', 'de', 'cs', 'uk', 'pl', 'nl', 'fr'];

// ═════════════════════════════════════════════════
// BOTTOM SHEET
// ═════════════════════════════════════════════════
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="gp-sheet-overlay" onClick={onClose} />
      <div className="gp-sheet">
        <div className="gp-sheet-handle" />
        <div className="gp-sheet-header">
          <h3 className="gp-sheet-title">{title}</h3>
          <button className="gp-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="gp-sheet-body">{children}</div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════
// STORY BUBBLE
// ═════════════════════════════════════════════════
function StoryBubble({ emoji, label, active, onClick }: {
  emoji: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button className="gp-story-btn" onClick={onClick}>
      <div className={`gp-story-ring ${active ? 'active' : ''}`}>
        <div className="gp-story-inner">{emoji}</div>
      </div>
      <span className="gp-story-label">{label}</span>
    </button>
  );
}

// ═════════════════════════════════════════════════
// LIST ROW
// ═════════════════════════════════════════════════
function ListRow({ icon, label, value, valueClass, onClick, chevron = true, last = false }: {
  icon: string; label: string; value?: string; valueClass?: string;
  onClick?: (() => void) | null; chevron?: boolean; last?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`gp-list-row ${onClick ? 'clickable' : ''} ${last ? 'last' : ''}`} onClick={onClick || undefined}>
      <span className="gp-list-row-icon">{icon}</span>
      <span className="gp-list-row-label">{label}</span>
      {value && <span className={`gp-list-row-value ${valueClass || ''}`}>{value}</span>}
      {chevron && onClick && <span className="gp-list-row-chevron">›</span>}
    </Tag>
  );
}

// ═════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════
export default function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [tab, setTab] = useState<'home' | 'services' | 'explore'>('home');
  const [sheet, setSheet] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [orderingService, setOrderingService] = useState<string | null>(null);

  // Registration state
  const [showReg, setShowReg] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regData, setRegData] = useState({
    fullName: '', email: '', phone: '', dateOfBirth: '',
    documentType: '', documentNumber: '', nationality: '',
  });
  const [regLoading, setRegLoading] = useState(false);

  // Chat state
  const [chatMsgs, setChatMsgs] = useState<{ from: 'host' | 'guest'; text: string; time: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Resolve async params
  useEffect(() => { params.then(p => setToken(p.token)); }, [params]);

  // Fetch data
  useEffect(() => {
    if (!token) return;
    fetch(`/api/guest/${token}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => {
        setData(d);
        setLoading(false);
        if (d.expired) return;
        const guestCountry = d.registeredGuests?.[0]?.address || null;
        const guestPhone = d.reservation?.guest_phone || null;
        const detectedLang = detectLanguage(guestPhone, guestCountry);
        setLang(detectedLang);
        // Init chat welcome
        const guestName = d.reservation?.first_name || 'Guest';
        setChatMsgs([{ from: 'host', text: getTranslations(detectedLang).chatWelcome(guestName), time: '14:00' }]);
        // Pre-fill reg
        if (d.registeredGuests?.length > 0) {
          const g = d.registeredGuests[0];
          setRegData({
            fullName: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
            email: g.email || '', phone: g.phone || '',
            dateOfBirth: g.date_of_birth || '',
            documentType: g.document_type || '', documentNumber: g.document_number || '',
            nationality: g.nationality || '',
          });
        }
      })
      .catch(() => { setError('notFound'); setLoading(false); });
  }, [token]);

  const t = getTranslations(lang);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Phase/Stage logic ─────────────────────────
  const r = data?.reservation;
  const cfg = data?.guestPageConfig;
  const isRegistered = (data?.registeredGuests?.length || 0) > 0;
  const catType = r?.category_type || 'resort';
  const brandName = data?.expired ? data.brandName : getBrandName(catType);

  const phase: Phase = (() => {
    if (!r) return 'before';
    const now = new Date();
    const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
    const checkIn = new Date(r.check_in + 'T00:00:00');
    const checkOut = new Date(r.check_out + 'T00:00:00');
    if (today.getTime() === checkOut.getTime()) return 'checkout';
    if (today.getTime() === checkIn.getTime()) return 'checkin_day';
    if (today > checkIn && today < checkOut) return 'during';
    return 'before';
  })();

  // ─── Service ordering ──────────────────────────
  const handleOrderService = async (serviceId: string) => {
    setOrderingService(serviceId);
    try {
      const res = await fetch(`/api/guest/${token}/services`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [{ serviceId, quantity: 1 }] }),
      });
      if (!res.ok) throw new Error('Error');
      const result = await res.json();
      setData((prev: any) => ({ ...prev, orderedServices: result.orderedServices }));
      setSheet(null); setSelectedService(null);
      showToast(t.serviceOrdered);
    } catch { showToast(t.orderError, 'error'); }
    setOrderingService(null);
  };

  // ─── Registration submit ──────────────────────
  const handleRegSubmit = async () => {
    setRegLoading(true);
    try {
      const nameParts = regData.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const guests = [{
        firstName, lastName,
        dateOfBirth: regData.dateOfBirth, address: '',
        nationality: regData.nationality,
        documentType: regData.documentType,
        documentNumber: regData.documentNumber,
      }];
      const res = await fetch(`/api/guest/${token}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests }),
      });
      if (!res.ok) throw new Error('Error');
      const result = await res.json();
      setData((prev: any) => ({ ...prev, registeredGuests: result.registeredGuests }));
      setShowReg(false); setRegStep(1);
      showToast(t.regSaved);
    } catch { showToast(t.regError, 'error'); }
    setRegLoading(false);
  };

  // ─── Chat ──────────────────────────────────────
  const sendChat = () => {
    if (!chatInput.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setChatMsgs(prev => [...prev, { from: 'guest', text: chatInput, time }]);
    setChatInput('');
    // Auto-reply simulation
    setTimeout(() => {
      setChatMsgs(prev => [...prev, { from: 'host', text: 'Got it! We\'ll take care of it right away 👍', time }]);
    }, 1500);
  };

  useEffect(() => {
    if (sheet === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, sheet]);

  // ─── LOADING / ERROR ──────────────────────────
  if (loading) return (
    <div className="gp-root"><div className="gp-loading"><div className="gp-spinner" /><span>{t.loading}</span></div></div>
  );
  if (error || !data) return (
    <div className="gp-root"><div className="gp-error"><div className="gp-error-icon">🔍</div><h2>{t.notFound}</h2><p>{t.notFoundDesc}</p></div></div>
  );

  // ─── POST-STAY (expired) ──────────────────────
  if (data.expired) {
    return <PostStayPage data={data} lang={lang} setLang={setLang} />;
  }

  // ─── Data derivatives ─────────────────────────
  const amenities = parseJSON<any[]>(cfg?.amenities, []);
  const rules = parseJSON<any[]>(cfg?.rules, []);
  const usefulInfoList = parseJSON<any[]>(cfg?.useful_info, []);
  const guestName = `${r.first_name || ''} ${(r.last_name || '').charAt(0)}.`.trim();
  const dLeft = daysUntil(r.check_in);
  const currentDay = dayOfStay(r.check_in);
  const unitName = r.unit_type_name || r.unit_name || 'Your cabin';

  // Stage message
  const stageMsg = (() => {
    if (phase === 'before') return t.daysToGo(Math.max(1, dLeft));
    if (phase === 'checkin_day') return t.todayIsTheDay;
    if (phase === 'during') return t.enjoyDay(currentDay);
    return t.checkoutToday;
  })();

  // ═════════════════════════════════════════════════
  return (
    <div className="gp-root">

      {/* ════ HOME TAB ════ */}
      {tab === 'home' && (
        <div className="gp-tab-content">

          {/* ── WALLET CARD ── */}
          <div className="gp-wallet">
            <div className="gp-wallet-texture" />
            <div className="gp-wallet-content">
              <div className="gp-wallet-top">
                <div>
                  <div className="gp-wallet-brand">{brandName}</div>
                  <div className="gp-wallet-title">{unitName}</div>
                </div>
                <div className="gp-wallet-langs">
                  {ALL_LANGS.map(l => (
                    <button key={l} className={`gp-lang-pill ${l === lang ? 'active' : ''}`}
                      onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
                  ))}
                </div>
              </div>

              <div className="gp-wallet-dates">
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.checkIn}</div>
                  <div className="gp-wallet-date-value">{formatDateLocalized(r.check_in, lang)} · {r.check_in_time || '15:00'}</div>
                </div>
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.nights}</div>
                  <div className="gp-wallet-date-value">{r.nights}</div>
                </div>
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.checkOut}</div>
                  <div className="gp-wallet-date-value">{formatDateLocalized(r.check_out, lang)} · {r.check_out_time || '11:00'}</div>
                </div>
              </div>

              <div className="gp-wallet-bottom">
                <div className="gp-wallet-status">{stageMsg}</div>
                <div className="gp-wallet-guest">{guestName}</div>
              </div>
            </div>
          </div>

          {/* ── STORIES ROW ── */}
          <div className="gp-stories">
            <StoryBubble emoji="📍" label={t.directions} active onClick={() => setSheet('directions')} />
            <StoryBubble emoji="🔑" label={t.entry} active onClick={() => setSheet('entry')} />
            <StoryBubble emoji="📶" label={t.wifi} active onClick={() => setSheet('wifi')} />
            <StoryBubble emoji="🅿️" label={t.parking} active onClick={() => setSheet('directions')} />
            {cfg?.restaurant_name && (
              <StoryBubble emoji="🍽" label={t.restaurant} active={false} onClick={() => setSheet('restaurant')} />
            )}
            {usefulInfoList.some((u: any) => u.icon === '🥾' || (u.title || '').includes('маршрут')) && (
              <StoryBubble emoji="🥾" label={t.hiking} active={false} onClick={() => setSheet('hiking')} />
            )}
          </div>

          {/* ── ACTION CARD (pre-arrival, not registered) ── */}
          {phase === 'before' && !isRegistered && (
            <div className="gp-action-card">
              <div className="gp-action-card-top">
                <div className="gp-action-badge">!</div>
                <div>
                  <div className="gp-action-title">{t.completeReg}</div>
                  <div className="gp-action-desc">{t.regMinutes}</div>
                </div>
              </div>
              <button className="gp-btn gp-btn-primary" onClick={() => setShowReg(true)}>{t.startReg}</button>
            </div>
          )}

          {/* ── WEATHER (during/checkin) ── */}
          {(phase === 'during' || phase === 'checkin_day') && (
            <div className="gp-weather">
              <span className="gp-weather-icon">⛅</span>
              <div>
                <div className="gp-weather-title">14°C · Partly cloudy</div>
                <div className="gp-weather-desc">{t.greatDay}</div>
              </div>
            </div>
          )}

          {/* ── STAGE-BASED ACTIONS ── */}
          <div className="gp-section">
            <div className="gp-section-title">
              {phase === 'checkout' ? t.beforeYouLeave : phase === 'before' ? t.gettingReady : t.yourStay}
            </div>
            <div className="gp-list-card">
              {phase === 'before' && <>
                <ListRow icon="✅" label={t.bookingConfirmed} chevron={false} />
                <ListRow icon={isRegistered ? '✅' : '⚠️'} label={t.guestReg}
                  value={isRegistered ? t.done : t.required}
                  valueClass={isRegistered ? '' : 'required'}
                  onClick={isRegistered ? null : () => setShowReg(true)} />
                <ListRow icon="🔒" label={t.entryInstructions}
                  value={formatDateLocalized(r.check_in, lang)} chevron={false} last />
              </>}
              {phase === 'checkin_day' && <>
                <ListRow icon="✅" label={t.regComplete} chevron={false} />
                <ListRow icon="🔑" label={t.entryInstructions} onClick={() => setSheet('entry')} />
                <ListRow icon="📍" label={t.howToGetHere} onClick={() => setSheet('directions')} last />
              </>}
              {phase === 'during' && <>
                {data.services?.slice(0, 3).map((svc: any, i: number) => (
                  <ListRow key={svc.id} icon={svc.icon || '✨'} label={svc.name_en && lang !== 'uk' ? svc.name_en : translateContent(svc.name, lang)}
                    onClick={() => { setSelectedService(svc); setSheet('service'); }}
                    last={i === Math.min(2, (data.services?.length || 1) - 1)} />
                ))}
              </>}
              {phase === 'checkout' && <>
                <ListRow icon="☐" label={t.closeWindows} chevron={false} />
                <ListRow icon="☐" label={t.keyInLockbox} chevron={false} />
                <ListRow icon="⏰" label={t.lateCheckout}
                  value="400 Kč"
                  onClick={() => {
                    const lateService = data.services?.find((s: any) => s.name?.includes('check-out') || s.name?.includes('Check-out'));
                    if (lateService) { setSelectedService(lateService); setSheet('service'); }
                  }} last />
              </>}
            </div>
          </div>

          {/* ── GOOD TO KNOW ── */}
          <div className="gp-section">
            <div className="gp-section-title">{t.goodToKnow}</div>
            <div className="gp-list-card gp-list-card-padded">
              <ListRow icon="🕐" label={t.checkInTime} value={r.check_in_time || '15:00'} chevron={false} />
              <ListRow icon="🕚" label={t.checkOutTime} value={r.check_out_time || '11:00'} chevron={false} />
              {cfg?.wifi_password && (
                <ListRow icon="📶" label={t.wifiLabel} value={t.tapToCopy}
                  onClick={() => { navigator.clipboard?.writeText(cfg.wifi_password); setSheet('wifi'); }} />
              )}
              <ListRow icon="🐕" label={t.pets} value={t.petsWelcome} chevron={false} />
              {r.property_phone && (
                <ListRow icon="📞" label={t.support} value={r.property_phone} chevron={false} last />
              )}
            </div>
          </div>

          {/* ── YOUR CABIN (amenities) ── */}
          {amenities.length > 0 && (
            <div className="gp-section">
              <div className="gp-section-title">{t.yourCabin}</div>
              <div className="gp-list-card" style={{ padding: 16 }}>
                <div className="gp-amenity-grid">
                  {amenities.map((am: any, i: number) => {
                    const ta = translateAmenity(am, lang);
                    return <span key={i} className="gp-amenity-chip">{ta.icon} {ta.name}</span>;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── HOUSE RULES ── */}
          {rules.length > 0 && (
            <div className="gp-section">
              <div className="gp-rules-compact">
                <div className="gp-rules-title">{t.houseRules}</div>
                <div className="gp-rules-text">
                  {rules.map((rule: any, i: number) => {
                    const tr = translateRule(rule, lang);
                    return <span key={i}>{tr.icon} {tr.text}{i < rules.length - 1 ? ' · ' : ''}</span>;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── CHECKOUT FEEDBACK ── */}
          {phase === 'checkout' && (
            <div className="gp-section">
              <div className="gp-feedback">
                <div className="gp-feedback-title">{t.feedbackTitle}</div>
                <div className="gp-feedback-desc">{t.feedbackQuestion}</div>
                <textarea className="gp-feedback-textarea" placeholder={t.feedbackPlaceholder} />
                <button className="gp-btn gp-btn-primary" style={{ marginTop: 8, fontSize: 14, padding: '10px 20px', width: 'auto' }}>
                  {t.send}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ SERVICES TAB ════ */}
      {tab === 'services' && (
        <div className="gp-tab-pad">
          <div className="gp-tab-title">{t.servicesTitle}</div>
          <div className="gp-tab-subtitle">{t.servicesSubtitle}</div>

          {data.services?.map((svc: any) => {
            const isOrdered = data.orderedServices?.some((o: any) => o.service_id === svc.id);
            return (
              <button key={svc.id} className="gp-service-card"
                onClick={() => { setSelectedService(svc); setSheet('service'); }}>
                <div className="gp-service-emoji">{svc.icon || '✨'}</div>
                <div className="gp-service-info">
                  <div className="gp-service-name">
                    {svc.name_en && lang !== 'uk' ? svc.name_en : translateContent(svc.name, lang)}
                    {isOrdered && ' ✅'}
                  </div>
                  <div className="gp-service-desc">{translateContent(svc.description || '', lang)}</div>
                </div>
                <div className="gp-service-price-col">
                  <div className="gp-service-price">{formatPriceLocalized(svc.price, svc.currency)}</div>
                  {svc.unit_label && <div className="gp-service-per">/{translateContent(svc.unit_label, lang)}</div>}
                </div>
              </button>
            );
          })}

          {/* Restaurant */}
          {cfg?.restaurant_name && (
            <div className="gp-restaurant">
              <div className="gp-restaurant-title">🍽 {translateContent(cfg.restaurant_name, lang)}</div>
              {cfg.restaurant_hours && (
                <div className="gp-restaurant-hours">{translateContent(cfg.restaurant_hours, lang)}</div>
              )}
              {cfg.restaurant_menu_url && (
                <a href={cfg.restaurant_menu_url} target="_blank" rel="noopener noreferrer">
                  <button className="gp-btn-small" style={{ marginTop: 10 }}>{t.viewMenu}</button>
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════ EXPLORE TAB ════ */}
      {tab === 'explore' && (
        <div className="gp-tab-pad">
          <div className="gp-tab-title">{t.exploreTitle}</div>
          <div className="gp-tab-subtitle">{t.exploreSubtitle}</div>

          {usefulInfoList.map((info: any, i: number) => {
            const ti = translateUsefulInfo(info, lang);
            return (
              <div key={i} className="gp-explore-card">
                <div className="gp-explore-title">{ti.icon} {ti.title}</div>
                <div className="gp-explore-desc">{ti.desc}</div>
                {info.url && (
                  <a href={info.url} target="_blank" rel="noopener noreferrer">
                    <button className="gp-explore-cta">{t.navigate} →</button>
                  </a>
                )}
              </div>
            );
          })}

          {/* Static explore items from config */}
          {cfg?.maps_url && (
            <div className="gp-explore-card">
              <div className="gp-explore-title">📍 {t.howToGetHere}</div>
              <div className="gp-explore-desc">{r.property_address || 'Loketská, Radošov, Karlovy Vary'}</div>
              <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer">
                <button className="gp-explore-cta">{t.navigate} →</button>
              </a>
            </div>
          )}
        </div>
      )}

      {/* ════ BOTTOM SHEETS ════ */}

      {/* Directions */}
      <BottomSheet open={sheet === 'directions'} onClose={() => setSheet(null)} title={t.howToGetHereTitle}>
        <div className="gp-sheet-map-placeholder">🗺 Map — Google Maps embed</div>
        <div className="gp-sheet-info">
          <strong>{t.address}:</strong> {r.property_address || 'Loketská, Radošov, Karlovy Vary'}<br />
          <strong>{t.parkingInfo}:</strong> Free, directly by the entrance
        </div>
        <div className="gp-sheet-tip green">{t.videoGuide}</div>
        {cfg?.maps_url && (
          <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="gp-btn gp-btn-primary">{t.openGoogleMaps}</button>
          </a>
        )}
      </BottomSheet>

      {/* Wi-Fi */}
      <BottomSheet open={sheet === 'wifi'} onClose={() => setSheet(null)} title={t.wifiTitle}>
        <div className="gp-wifi-center">
          <div className="gp-wifi-emoji">📶</div>
          <div className="gp-wifi-label">{t.network}</div>
          <div className="gp-wifi-value">{cfg?.wifi_network || 'ALiSiO_Guest'}</div>
          <div className="gp-wifi-spacer" />
          <div className="gp-wifi-label">{t.password}</div>
          <div className="gp-wifi-value mono">{cfg?.wifi_password || ''}</div>
          <button className="gp-btn gp-btn-primary" style={{ marginTop: 20, width: 'auto', padding: '12px 32px' }}
            onClick={() => { navigator.clipboard?.writeText(cfg?.wifi_password || ''); showToast(t.copied); }}>
            {t.copyPassword}
          </button>
        </div>
      </BottomSheet>

      {/* Entry */}
      <BottomSheet open={sheet === 'entry'} onClose={() => setSheet(null)} title={t.entryTitle}>
        <div className="gp-entry-photo">📷 Photo of entrance / lockbox</div>
        <div className="gp-entry-steps">
          <strong>1.</strong> {t.entryStep1}<br />
          <strong>2.</strong> {t.entryStep2}<br />
          <strong>3.</strong> {t.entryStep3Code} <span className="gp-entry-code">{cfg?.lock_code || '4971#'}</span><br />
          <strong>4.</strong> {t.entryStep4}
        </div>
        {cfg?.check_in_instructions && (
          <div style={{ fontSize: 14, color: 'var(--gp-sub)', marginTop: 12 }}>{translateContent(cfg.check_in_instructions, lang)}</div>
        )}
        <div className="gp-sheet-tip orange" style={{ marginTop: 16 }}>{t.lateArrival}</div>
      </BottomSheet>

      {/* Restaurant */}
      <BottomSheet open={sheet === 'restaurant'} onClose={() => setSheet(null)} title={translateContent(cfg?.restaurant_name || 'Restaurant', lang)}>
        {cfg?.restaurant_hours && (
          <div style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
            {translateContent(cfg.restaurant_hours, lang)}
          </div>
        )}
        <div className="gp-sheet-tip green">
          💡 {t.servicesSubtitle}
        </div>
      </BottomSheet>

      {/* Service detail */}
      <BottomSheet open={sheet === 'service' && !!selectedService} onClose={() => { setSheet(null); setSelectedService(null); }}
        title={selectedService ? (selectedService.name_en && lang !== 'uk' ? selectedService.name_en : translateContent(selectedService.name || '', lang)) : ''}>
        {selectedService && (
          <>
            <div className="gp-service-detail">
              <div className="gp-service-detail-emoji">{selectedService.icon || '✨'}</div>
              <div className="gp-service-detail-price">{formatPriceLocalized(selectedService.price, selectedService.currency)}</div>
              {selectedService.unit_label && (
                <div className="gp-service-detail-per">{t.per} {translateContent(selectedService.unit_label, lang)}</div>
              )}
            </div>
            <div className="gp-service-detail-desc">{translateContent(selectedService.description || '', lang)}</div>
            {!data.orderedServices?.some((o: any) => o.service_id === selectedService.id) ? (
              <button className="gp-btn gp-btn-primary" onClick={() => handleOrderService(selectedService.id)}
                disabled={orderingService === selectedService.id}>
                {orderingService === selectedService.id ? '...' : t.addToStay}
              </button>
            ) : (
              <button className="gp-btn" style={{ background: 'var(--gp-green)', color: '#FFF' }} disabled>✅ {t.done}</button>
            )}
          </>
        )}
      </BottomSheet>

      {/* Chat */}
      <BottomSheet open={sheet === 'chat'} onClose={() => setSheet(null)} title={t.chatTitle}>
        <div className="gp-chat-messages">
          {chatMsgs.map((m, i) => (
            <div key={i} className={`gp-chat-msg ${m.from}`}>
              <div className="gp-chat-bubble">{m.text}</div>
              <div className="gp-chat-time">{m.time}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="gp-chat-input-row">
          <input className="gp-chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder={t.typePlaceholder} />
          <button className="gp-chat-send" onClick={sendChat}>↑</button>
        </div>
      </BottomSheet>

      {/* ════ REGISTRATION OVERLAY ════ */}
      {showReg && (
        <div className="gp-reg-overlay">
          <div className="gp-reg-header">
            <button className="gp-reg-back" onClick={() => {
              if (regStep === 1) setShowReg(false);
              else setRegStep(s => s - 1);
            }}>{regStep === 1 ? '✕' : t.back}</button>
            <span className="gp-reg-step">{t.stepOf(regStep, 3)}</span>
            <div style={{ width: 48 }} />
          </div>
          <div className="gp-reg-progress">
            <div className="gp-reg-progress-fill" style={{ width: `${(regStep / 3) * 100}%` }} />
          </div>

          <div className="gp-reg-body">
            {/* Step 1: Guest Details */}
            {regStep === 1 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{t.step1Title}</h2>
                <div className="gp-field">
                  <div className="gp-field-label">{t.fullName} *</div>
                  <input className="gp-field-input" value={regData.fullName} autoComplete="name"
                    onChange={e => setRegData(d => ({ ...d, fullName: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.email} *</div>
                  <input className="gp-field-input" type="email" value={regData.email} autoComplete="email"
                    onChange={e => setRegData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.phone}</div>
                  <input className="gp-field-input" type="tel" value={regData.phone} autoComplete="tel"
                    onChange={e => setRegData(d => ({ ...d, phone: e.target.value }))} />
                  <div className="gp-field-hint">{t.phoneHint}</div>
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.dateOfBirth} *</div>
                  <input className="gp-field-input" type="date" value={regData.dateOfBirth} autoComplete="bday"
                    onChange={e => setRegData(d => ({ ...d, dateOfBirth: e.target.value }))} />
                </div>
              </>
            )}

            {/* Step 2: ID Document */}
            {regStep === 2 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t.step2Title}</h2>
                <p style={{ fontSize: 14, color: 'var(--gp-sub)', marginBottom: 16 }}>{t.step2Why}</p>
                <div className="gp-security-notice">{t.securityNotice}</div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.documentType} *</div>
                  <select className="gp-field-input" value={regData.documentType}
                    onChange={e => setRegData(d => ({ ...d, documentType: e.target.value }))}>
                    <option value="">{t.selectDoc}</option>
                    <option value="passport">{t.passportDoc}</option>
                    <option value="id_card">{t.idCardDoc}</option>
                    <option value="driving_license">{t.drivingLicenseDoc}</option>
                  </select>
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.documentNumber} *</div>
                  <input className="gp-field-input" value={regData.documentNumber}
                    onChange={e => setRegData(d => ({ ...d, documentNumber: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.nationality} *</div>
                  <input className="gp-field-input" value={regData.nationality} autoComplete="country-name"
                    onChange={e => setRegData(d => ({ ...d, nationality: e.target.value }))} />
                </div>
              </>
            )}

            {/* Step 3: Confirm */}
            {regStep === 3 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{t.step3Title}</h2>
                <div className="gp-confirm-table">
                  {[
                    [t.fullName, regData.fullName],
                    [t.email, regData.email],
                    [t.phone, regData.phone || '—'],
                    [t.dateOfBirth, regData.dateOfBirth],
                    [t.documentType, regData.documentType],
                    [t.documentNumber, regData.documentNumber],
                    [t.nationality, regData.nationality],
                  ].map(([label, value], i) => (
                    <div key={i} className="gp-confirm-row">
                      <span className="gp-confirm-label">{label}</span>
                      <span className="gp-confirm-value">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="gp-confirm-success">{t.confirmNotice}</div>
              </>
            )}
          </div>

          <div className="gp-reg-footer">
            {regStep < 3 ? (
              <button className="gp-btn gp-btn-primary" onClick={() => setRegStep(s => s + 1)}>
                {t.continue_}
              </button>
            ) : (
              <button className="gp-btn gp-btn-primary" onClick={handleRegSubmit} disabled={regLoading}>
                {regLoading ? '...' : t.confirmReg}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════ BOTTOM TAB BAR ════ */}
      <div className="gp-tab-bar">
        {([
          { id: 'home' as const, icon: '🏠', label: t.home },
          { id: 'services' as const, icon: '✨', label: t.services },
          { id: 'explore' as const, icon: '🗺', label: t.explore },
          { id: 'chat' as const, icon: '💬', label: t.chat },
        ] as const).map(item => (
          <button key={item.id} className={`gp-tab-btn ${item.id !== 'chat' && tab === item.id ? 'active' : ''}`}
            onClick={() => item.id === 'chat' ? setSheet('chat') : setTab(item.id as 'home' | 'services' | 'explore')}>
            <span className="gp-tab-icon">{item.icon}</span>
            <span className="gp-tab-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ════ TOAST ════ */}
      {toast && <div className={`gp-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════
// POST-STAY PAGE (token expired)
// ════════════════════════════════════════════════════
function PostStayPage({ data, lang, setLang }: {
  data: any; lang: Lang; setLang: (l: Lang) => void;
}) {
  const t = getTranslations(lang);
  const brandName = data.brandName || 'ALiSiO Resort';
  const guestName = data.guestName || '';
  const unitTypes = data.unitTypes || [];
  const catIcons: Record<string, string> = { glamping: '🏕️', resort: '🏨', camping: '⛺' };

  return (
    <div className="gp-root">
      {/* Language switcher */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', gap: 4 }}>
        {ALL_LANGS.map(l => (
          <button key={l} className={`gp-lang-pill ${l === lang ? 'active' : ''}`}
            style={{ background: l === lang ? 'var(--gp-tint)' : 'var(--gp-sep)', color: l === lang ? '#FFF' : 'var(--gp-sub)' }}
            onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
        ))}
      </div>

      {/* Hero */}
      <div className="gp-ps-hero">
        <div className="gp-ps-hero-emoji">🌟</div>
        <h1 className="gp-ps-hero-title">{t.thankYou(guestName)}</h1>
        <p className="gp-ps-hero-subtitle">{t.thankYouStay}</p>
        <p className="gp-ps-hero-comeback">{t.comeBack}</p>
      </div>

      {/* Early booking promo */}
      <div className="gp-ps-promo">
        <div className="gp-ps-promo-badge">🎁 -30%</div>
        <h2 className="gp-ps-promo-title">{t.earlyBooking}</h2>
        <p className="gp-ps-promo-desc">{t.earlyBookingDesc}</p>
        <div className="gp-ps-promo-conditions">
          <span>✓ 30% {t.discount}</span>
          <span>✓ Min. 2 {t.nights.toLowerCase()}</span>
        </div>
      </div>

      {/* Unit types */}
      {unitTypes.length > 0 && (
        <div className="gp-ps-units">
          <h2 className="gp-ps-section-title">{t.ourAccommodations}</h2>
          <div className="gp-ps-units-grid">
            {unitTypes.map((ut: any) => (
              <div key={ut.id} className="gp-ps-unit-card">
                <div className="gp-ps-unit-icon">{catIcons[ut.category_type] || '🏠'}</div>
                <div className="gp-ps-unit-info">
                  <div className="gp-ps-unit-name">{ut.name}</div>
                  <div className="gp-ps-unit-meta">{ut.category_name} · {ut.max_adults} {t.adultsShort}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="gp-ps-contact">
        <div className="gp-ps-contact-row">
          {data.propertyEmail && <a href={`mailto:${data.propertyEmail}`} className="gp-ps-contact-btn">📧 {data.propertyEmail}</a>}
          {data.propertyPhone && <a href={`tel:${data.propertyPhone}`} className="gp-ps-contact-btn">📞 {data.propertyPhone}</a>}
        </div>
      </div>

      <footer className="gp-footer">
        <div className="gp-footer-logo">{brandName}</div>
        <div>{t.footerLocation}</div>
      </footer>
    </div>
  );
}
