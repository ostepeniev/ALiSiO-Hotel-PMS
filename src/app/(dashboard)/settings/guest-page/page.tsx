/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { Save, Check, Plus, Trash2, ChevronDown, ChevronRight, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ConfigItem {
  unit_type_id: string;
  unit_type_name: string;
  unit_type_code: string;
  category_type: string;
  category_name: string;
  category_icon: string;
  amenities: string;
  check_in_instructions: string;
  external_amenities: string | null;
  faq_items: string;
  rules: string;
  wifi_network: string;
  wifi_password: string;
  restaurant_name: string;
  restaurant_hours: string;
  restaurant_menu_url: string | null;
  useful_info: string;
}

interface AmenityItem { icon: string; name: string; }
interface FaqItem { q: string; a: string; }
interface RuleItem { icon: string; text: string; }
interface UsefulItem { icon: string; title: string; desc: string; }

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export default function GuestPageSettingsPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['amenities', 'instructions']));
  const onMenuClick = useMobileMenu();

  // Form state
  const [amenities, setAmenities] = useState<AmenityItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [wifiNetwork, setWifiNetwork] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantHours, setRestaurantHours] = useState('');
  const [restaurantMenuUrl, setRestaurantMenuUrl] = useState('');
  const [usefulInfo, setUsefulInfo] = useState<UsefulItem[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Fetch all configs
  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guest-page-config');
      const data = await res.json();
      if (Array.isArray(data)) {
        setConfigs(data);
        if (!selected && data.length > 0) {
          setSelected(data[0].unit_type_id);
          loadConfig(data[0]);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // Load config into form
  const loadConfig = (cfg: ConfigItem) => {
    setAmenities(parseJSON<AmenityItem[]>(cfg.amenities, []));
    setInstructions(cfg.check_in_instructions || '');
    setFaqItems(parseJSON<FaqItem[]>(cfg.faq_items, []));
    setRules(parseJSON<RuleItem[]>(cfg.rules, []));
    setWifiNetwork(cfg.wifi_network || '');
    setWifiPassword(cfg.wifi_password || '');
    setRestaurantName(cfg.restaurant_name || '');
    setRestaurantHours(cfg.restaurant_hours || '');
    setRestaurantMenuUrl(cfg.restaurant_menu_url || '');
    setUsefulInfo(parseJSON<UsefulItem[]>(cfg.useful_info, []));
  };

  // Select config
  const handleSelect = (utId: string) => {
    setSelected(utId);
    const cfg = configs.find(c => c.unit_type_id === utId);
    if (cfg) loadConfig(cfg);
  };

  // Save
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/guest-page-config/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amenities,
          check_in_instructions: instructions,
          faq_items: faqItems,
          rules,
          wifi_network: wifiNetwork,
          wifi_password: wifiPassword,
          restaurant_name: restaurantName,
          restaurant_hours: restaurantHours,
          restaurant_menu_url: restaurantMenuUrl || null,
          useful_info: usefulInfo,
        }),
      });
      if (res.ok) {
        showToast('Збережено!');
        fetchConfigs();
      } else {
        showToast('Помилка збереження');
      }
    } catch { showToast('Помилка мережі'); }
    setSaving(false);
  };

  const selectedConfig = configs.find(c => c.unit_type_id === selected);
  const catColors: Record<string, string> = { glamping: '#a78bfa', resort: '#60a5fa', camping: '#34d399' };

  const SectionHeader = ({ id, title, icon }: { id: string; title: string; icon: string }) => (
    <button onClick={() => toggleSection(id)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0',
      background: 'none', border: 'none', borderBottom: '1px solid var(--border-primary)',
      color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>{title}</span>
      {openSections.has(id) ? <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />}
    </button>
  );

  return (
    <>
      <Header title="Гостьова сторінка" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: 'var(--accent-success)', color: '#fff',
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
          }}>
            <Check size={16} /> {toast}
          </div>
        )}

        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link href="/settings" style={{ color: 'var(--text-tertiary)', display: 'flex' }}><ArrowLeft size={18} /></Link>
              <h2 className="page-title">Налаштування гостьової сторінки</h2>
            </div>
            <div className="page-subtitle">Контент для кожного типу проживання</div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selected}>
            {saving ? <Loader2 size={16} className="animate-pulse" /> : <Save size={16} />} Зберегти
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
            <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
            {/* Left — Unit type selector */}
            <div className="card" style={{ padding: 0, position: 'sticky', top: 80 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                Тип проживання
              </div>
              {configs.map(cfg => {
                const active = cfg.unit_type_id === selected;
                const catColor = catColors[cfg.category_type] || '#6c7086';
                return (
                  <div key={cfg.unit_type_id} onClick={() => handleSelect(cfg.unit_type_id)} style={{
                    padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    borderBottom: '1px solid var(--border-primary)',
                    background: active ? 'rgba(79,110,247,0.08)' : 'transparent',
                    borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                  }}>
                    <span style={{ fontSize: 16 }}>{cfg.category_icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.unit_type_name}</div>
                      <div style={{ fontSize: 11, color: catColor, fontWeight: 600 }}>{cfg.category_name}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right — Editor */}
            <div className="card" style={{ padding: 20 }}>
              {selectedConfig && (
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{selectedConfig.category_icon}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedConfig.unit_type_name}</div>
                    <div style={{ fontSize: 12, color: catColors[selectedConfig.category_type], fontWeight: 600 }}>{selectedConfig.category_name}</div>
                  </div>
                </div>
              )}

              {/* === Amenities === */}
              <SectionHeader id="amenities" title="Зручності" icon="✨" />
              {openSections.has('amenities') && (
                <div style={{ padding: '16px 0' }}>
                  {amenities.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                        value={a.icon} onChange={e => setAmenities(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                      <input className="form-input" style={{ flex: 1 }} value={a.name} placeholder="Назва"
                        onChange={e => setAmenities(prev => prev.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))} />
                      <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                        onClick={() => setAmenities(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => setAmenities(prev => [...prev, { icon: '✅', name: '' }])}>
                    <Plus size={14} /> Додати зручність
                  </button>
                </div>
              )}

              {/* === Check-in Instructions === */}
              <SectionHeader id="instructions" title="Інструкція по заїзду" icon="🚪" />
              {openSections.has('instructions') && (
                <div style={{ padding: '16px 0' }}>
                  <textarea className="form-input" rows={4} value={instructions} placeholder="Інструкція для гостя при заїзді..."
                    onChange={e => setInstructions(e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              )}

              {/* === FAQ === */}
              <SectionHeader id="faq" title="FAQ" icon="❓" />
              {openSections.has('faq') && (
                <div style={{ padding: '16px 0' }}>
                  {faqItems.map((f, i) => (
                    <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>Питання {i + 1}</span>
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                          onClick={() => setFaqItems(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={12} /></button>
                      </div>
                      <input className="form-input" value={f.q} placeholder="Питання" style={{ marginBottom: 8, fontWeight: 600 }}
                        onChange={e => setFaqItems(prev => prev.map((p, idx) => idx === i ? { ...p, q: e.target.value } : p))} />
                      <textarea className="form-input" rows={2} value={f.a} placeholder="Відповідь" style={{ resize: 'vertical' }}
                        onChange={e => setFaqItems(prev => prev.map((p, idx) => idx === i ? { ...p, a: e.target.value } : p))} />
                    </div>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => setFaqItems(prev => [...prev, { q: '', a: '' }])}>
                    <Plus size={14} /> Додати питання
                  </button>
                </div>
              )}

              {/* === Rules === */}
              <SectionHeader id="rules" title="Правила перебування" icon="📜" />
              {openSections.has('rules') && (
                <div style={{ padding: '16px 0' }}>
                  {rules.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                        value={r.icon} onChange={e => setRules(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                      <input className="form-input" style={{ flex: 1 }} value={r.text} placeholder="Правило"
                        onChange={e => setRules(prev => prev.map((p, idx) => idx === i ? { ...p, text: e.target.value } : p))} />
                      <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                        onClick={() => setRules(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => setRules(prev => [...prev, { icon: '📌', text: '' }])}>
                    <Plus size={14} /> Додати правило
                  </button>
                </div>
              )}

              {/* === WiFi === */}
              <SectionHeader id="wifi" title="Wi-Fi" icon="📶" />
              {openSections.has('wifi') && (
                <div style={{ padding: '16px 0' }}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Мережа</label>
                      <input className="form-input" value={wifiNetwork} onChange={e => setWifiNetwork(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Пароль</label>
                      <input className="form-input" value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* === Restaurant === */}
              <SectionHeader id="restaurant" title="Ресторан" icon="🍽️" />
              {openSections.has('restaurant') && (
                <div style={{ padding: '16px 0' }}>
                  <div className="form-group">
                    <label className="form-label">Назва</label>
                    <input className="form-input" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Годин роботи</label>
                    <textarea className="form-input" rows={3} value={restaurantHours} onChange={e => setRestaurantHours(e.target.value)} style={{ resize: 'vertical' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Посилання на меню (URL)</label>
                    <input className="form-input" type="url" value={restaurantMenuUrl} placeholder="https://..." onChange={e => setRestaurantMenuUrl(e.target.value)} />
                  </div>
                </div>
              )}

              {/* === Useful Info === */}
              <SectionHeader id="useful" title="Корисна інформація" icon="💡" />
              {openSections.has('useful') && (
                <div style={{ padding: '16px 0' }}>
                  {usefulInfo.map((u, i) => (
                    <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>Блок {i + 1}</span>
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                          onClick={() => setUsefulInfo(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={12} /></button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                          value={u.icon} onChange={e => setUsefulInfo(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                        <input className="form-input" style={{ flex: 1 }} value={u.title} placeholder="Заголовок"
                          onChange={e => setUsefulInfo(prev => prev.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))} />
                      </div>
                      <textarea className="form-input" rows={2} value={u.desc} placeholder="Опис" style={{ resize: 'vertical' }}
                        onChange={e => setUsefulInfo(prev => prev.map((p, idx) => idx === i ? { ...p, desc: e.target.value } : p))} />
                    </div>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={() => setUsefulInfo(prev => [...prev, { icon: '📌', title: '', desc: '' }])}>
                    <Plus size={14} /> Додати блок
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
