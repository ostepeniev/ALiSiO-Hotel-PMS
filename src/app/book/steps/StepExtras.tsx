'use client';

import React, { useState, useEffect } from 'react';
import { formatPrice } from '../lib/pricing';

interface Service { id: string; name: string; name_en: string; price: number; unit_label: string; icon: string; category: string; }
interface Props {
  accommodationType: string;
  nights: number;
  onNext: (services: { id: string; name: string; quantity: number; price: number }[]) => void;
  onSkip: () => void;
}

// Default extras for Kemp Carlsbad
const DEFAULT_EXTRAS: Service[] = [
  { id: 'ext_sauna', name: 'Sauna', name_en: 'Sauna session', price: 1500, unit_label: '2h session / up to 6 ppl', icon: '🧖', category: 'wellness' },
  { id: 'ext_hottub', name: 'Koupací sud', name_en: 'Hot tub', price: 2000, unit_label: '2h session / up to 6 ppl', icon: '🛁', category: 'wellness' },
  { id: 'ext_grill', name: 'Grill set', name_en: 'Grill set', price: 350, unit_label: 'per set (charcoal + tools)', icon: '🔥', category: 'bbq' },
  { id: 'ext_breakfast', name: 'Snídaně', name_en: 'Breakfast', price: 180, unit_label: 'per person / day', icon: '🥐', category: 'food' },
];

export default function StepExtras({ accommodationType, nights, onNext, onSkip }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/widget/config')
      .then(r => r.json())
      .then(data => {
        const apiSvcs = (data.services || []).filter((s: Service) => s.category !== 'other');
        // Merge: API services + defaults (avoid duplicates by id)
        const apiIds = new Set(apiSvcs.map((s: Service) => s.id));
        const merged = [...apiSvcs, ...DEFAULT_EXTRAS.filter(d => !apiIds.has(d.id))];
        setServices(merged);
      })
      .catch(() => {
        // API failed — use defaults
        setServices(DEFAULT_EXTRAS);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const copy = { ...prev };
      if (copy[id]) delete copy[id];
      else copy[id] = 1;
      return copy;
    });
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setSelected(prev => { const c = { ...prev }; delete c[id]; return c; });
    } else {
      setSelected(prev => ({ ...prev, [id]: qty }));
    }
  };

  const totalExtras = services
    .filter(s => selected[s.id])
    .reduce((sum, s) => sum + s.price * (selected[s.id] || 0), 0);

  const selectedList = services
    .filter(s => selected[s.id])
    .map(s => ({ id: s.id, name: s.name_en || s.name, quantity: selected[s.id], price: s.price * selected[s.id] }));

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="kc-spinner" style={{ margin: '0 auto', borderColor: 'rgba(46,107,79,0.2)', borderTopColor: 'var(--kc-green)' }} /></div>;

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Extras</h1>
      <p className="kc-subtitle">Make your stay even better</p>

      {services.map(s => {
        const isPerPerson = s.unit_label.includes('person');
        const hint = isPerPerson ? `💡 Tip: set quantity = guests × ${nights} night${nights > 1 ? 's' : ''}` : null;
        return (
          <div key={s.id} className={`kc-svc-card ${selected[s.id] ? 'added' : ''}`} onClick={() => !selected[s.id] && toggle(s.id)}>
            <div className="kc-svc-icon">{s.icon}</div>
            <div className="kc-svc-info">
              <div className="kc-svc-name">{s.name_en || s.name}</div>
              <div className="kc-svc-price">{formatPrice(s.price)} Kč · {s.unit_label}</div>
              {selected[s.id] && hint && <div style={{ fontSize: 11, color: 'var(--kc-green)', marginTop: 2 }}>{hint}</div>}
            </div>
            {selected[s.id] ? (
              <div className="kc-stepper" onClick={e => e.stopPropagation()}>
                <button className="kc-stepper-btn" onClick={() => setQty(s.id, (selected[s.id] || 1) - 1)} type="button">−</button>
                <span className="kc-stepper-val">{selected[s.id]}</span>
                <button className="kc-stepper-btn" onClick={() => setQty(s.id, (selected[s.id] || 0) + 1)} type="button">+</button>
              </div>
            ) : (
              <button className="kc-svc-action" type="button">+ Add</button>
            )}
          </div>
        );
      })}

      {totalExtras > 0 && (
        <div className="kc-breakdown">
          <div className="kc-breakdown-total"><span>Extras total</span><span>{formatPrice(totalExtras)} Kč</span></div>
        </div>
      )}

      <button className="kc-btn kc-btn-primary" onClick={() => onNext(selectedList)} style={{ marginTop: 8 }} type="button">
        {selectedList.length > 0 ? `Continue with ${selectedList.length} extra${selectedList.length > 1 ? 's' : ''} →` : 'Continue without extras →'}
      </button>
      <button className="kc-btn kc-btn-ghost" onClick={onSkip} type="button">Skip this step</button>
    </div>
  );
}
