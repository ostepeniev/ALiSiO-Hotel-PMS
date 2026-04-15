'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';

type WidgetType = 'booking' | 'sauna' | 'tub' | 'breakfast';

const WIDGET_OPTIONS: { value: WidgetType; label: string; icon: string; desc: string }[] = [
  { value: 'booking', label: 'Повне бронювання', icon: '🏠', desc: 'Календар → вибір будинку → гостьова → сервіси → підтвердження' },
  { value: 'sauna', label: 'Бронювання сауни', icon: '🔥', desc: 'Вибір дати, часу, тривалості + вінік' },
  { value: 'tub', label: 'Бронювання купелі', icon: '🛁', desc: 'Вибір дати, часу, тривалості' },
  { value: 'breakfast', label: 'Замовлення сніданку', icon: '🍳', desc: 'Меню з лічильниками + замовлення' },
];

export default function BookingWidgetSettingsPage() {
  const onMenuClick = useMobileMenu();
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [widgetType, setWidgetType] = useState<WidgetType>('booking');
  const [lang, setLang] = useState('uk');
  const [color, setColor] = useState('#1a1a2e');
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(data => {
        const list = data.properties || data || [];
        setProperties(list);
        if (list.length > 0 && !selectedProperty) setSelectedProperty(list[0].id);
      })
      .catch(() => {});
  }, []);

  const domain = typeof window !== 'undefined' ? window.location.origin : 'https://your-pms-domain.com';

  const isService = widgetType !== 'booking';
  const scriptFile = isService ? 'service-embed.js' : 'embed.js';
  const containerId = isService ? 'alisio-service-widget' : 'alisio-booking-widget';

  const embedCode = isService
    ? `<div id="${containerId}"></div>
<script
  src="${domain}/widget/${scriptFile}"
  data-service="${widgetType}"
  data-lang="${lang}"
  data-color="${color}"
></script>`
    : `<div id="${containerId}"></div>
<script
  src="${domain}/widget/${scriptFile}"
  data-property="${selectedProperty}"
  data-lang="${lang}"
  data-color="${color}"
></script>`;

  function copyCode() {
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Live preview
  useEffect(() => {
    if (!previewRef.current) return;
    const container = previewRef.current;
    container.innerHTML = '';
    
    const widgetId = `asw-preview-${Date.now()}`;
    const widgetDiv = document.createElement('div');
    widgetDiv.id = widgetId;
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = `/widget/${scriptFile}`;
    script.setAttribute('data-container', widgetId);
    if (!isService) {
      script.setAttribute('data-property', selectedProperty);
    } else {
      script.setAttribute('data-service', widgetType);
    }
    script.setAttribute('data-lang', lang);
    script.setAttribute('data-color', color);
    container.appendChild(script);

    setPreviewKey(k => k + 1);

    return () => { container.innerHTML = ''; };
  }, [selectedProperty, lang, color, widgetType]);

  return (
    <>
      <Header title="Віджети бронювання" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Віджети бронювання</h2>
            <div className="page-subtitle">
              Згенеруйте код для вставки на будь-який зовнішній сайт
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Left: Configuration */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              ⚙️ Налаштування
            </h3>

            {/* Widget Type Switcher */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Тип віджета
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {WIDGET_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWidgetType(opt.value)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: widgetType === opt.value ? `2px solid ${color}` : '2px solid var(--border-primary)',
                      background: widgetType === opt.value ? `${color}10` : 'var(--bg-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Property (only for booking widget) */}
            {!isService && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Об&apos;єкт
                </label>
                <select
                  value={selectedProperty}
                  onChange={e => setSelectedProperty(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-primary)', fontSize: 14,
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  }}
                >
                  {properties.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Language */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Мова за замовчуванням
              </label>
              <select
                value={lang}
                onChange={e => setLang(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-primary)', fontSize: 14,
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              >
                <option value="uk">🇺🇦 Українська</option>
                <option value="en">🇬🇧 English</option>
                <option value="cs">🇨🇿 Čeština</option>
                <option value="de">🇩🇪 Deutsch</option>
              </select>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Колір акценту
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: 40, height: 40, border: 'none', cursor: 'pointer', borderRadius: 8 }}
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-primary)', fontSize: 14,
                    background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            {/* Embed Code */}
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              📋 Код для вставки
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Скопіюйте цей код та вставте його на ваш сайт у потрібне місце
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 8,
                  fontSize: 12, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                }}
              >
                {embedCode}
              </pre>
              <button
                onClick={copyCode}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: copied ? '#22c55e' : '#45475a', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background .2s',
                }}
              >
                {copied ? '✓ Скопійовано!' : '📋 Копіювати'}
              </button>
            </div>

            {/* Multi-instance tip */}
            {isService && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af',
              }}>
                💡 <strong>Кілька віджетів на одній сторінці:</strong> додайте <code>data-container=&quot;my-custom-id&quot;</code> та замініть <code>id</code> контейнера на відповідний.
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              👁️ Попередній перегляд
            </h3>
            <div
              ref={previewRef}
              key={previewKey}
              style={{
                background: '#f5f5f5', borderRadius: 12, padding: 24,
                minHeight: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
