'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';

export default function BookingWidgetSettingsPage() {
  const onMenuClick = useMobileMenu();
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [lang, setLang] = useState('en');
  const [color, setColor] = useState('#e61e4d');
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

  // Build the domain from window location
  const domain = typeof window !== 'undefined' ? window.location.origin : 'https://your-pms-domain.com';

  const embedCode = `<div id="alisio-booking-widget"></div>
<script
  src="${domain}/widget/embed.js"
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
    if (!previewRef.current || !selectedProperty) return;
    const container = previewRef.current;
    container.innerHTML = '';
    
    const widgetDiv = document.createElement('div');
    widgetDiv.id = 'alisio-booking-widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = '/widget/embed.js';
    script.setAttribute('data-property', selectedProperty);
    script.setAttribute('data-lang', lang);
    script.setAttribute('data-color', color);
    script.setAttribute('data-api', '');
    container.appendChild(script);

    setPreviewKey(k => k + 1);

    return () => { container.innerHTML = ''; };
  }, [selectedProperty, lang, color]);

  return (
    <>
      <Header title="Віджет бронювання" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Віджет бронювання</h2>
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

            {/* Property */}
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
                <option value="en">🇬🇧 English</option>
                <option value="uk">🇺🇦 Українська</option>
                <option value="cs">🇨🇿 Čeština</option>
              </select>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Колір кнопки
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
                  fontFamily: "'Fira Code', 'Consolas', monospace',",
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
                minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
