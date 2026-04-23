'use client';

import React, { useState, useEffect } from 'react';
import { formatPrice } from '../lib/pricing';

interface Service { id: string; name: string; name_en: string; price: number; unit_label: string; icon: string; category: string; }
interface Props {
  accommodationType: string;
  onNext: (services: { id: string; name: string; quantity: number; price: number }[]) => void;
  onSkip: () => void;
}

export default function StepExtras({ accommodationType, onNext, onSkip }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/widget/config')
      .then(r => r.json())
      .then(data => {
        const svcs = (data.services || []).filter((s: Service) => s.category !== 'other');
        setServices(svcs);
      })
      .catch(() => {})
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

      {services.length === 0 ? (
        <div className="kc-alert info"><span className="kc-alert-icon">ℹ️</span> No extras available for this accommodation type</div>
      ) : (
        services.map(s => (
          <div key={s.id} className={`kc-svc-card ${selected[s.id] ? 'added' : ''}`} onClick={() => !selected[s.id] && toggle(s.id)}>
            <div className="kc-svc-icon">{s.icon}</div>
            <div className="kc-svc-info">
              <div className="kc-svc-name">{s.name_en || s.name}</div>
              <div className="kc-svc-price">{formatPrice(s.price)} Kč · {s.unit_label}</div>
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
        ))
      )}

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
