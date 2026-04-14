'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  BedDouble,
  RefreshCw,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface DashboardData {
  arrivalsToday: number;
  departuresToday: number;
  occupancyRate: number;
  freeUnits: number;
  totalUnits: number;
  upcomingArrivals: Array<{
    id: string; check_in: string; check_out: string; nights: number;
    first_name: string; last_name: string; unit_name: string; unit_code: string; status: string;
  }>;
  todayDepartures: Array<{
    id: string; check_out: string; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string; cleaning_status: string;
  }>;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Чернетка', color: 'var(--text-tertiary)' },
  tentative: { label: 'Очікується', color: 'var(--accent-warning)' },
  confirmed: { label: 'Підтверджено', color: 'var(--accent-success)' },
  checked_in: { label: 'Заселено', color: 'var(--accent-primary)' },
  checked_out: { label: 'Виселено', color: 'var(--accent-info)' },
};

const CLEAN_MAP: Record<string, { label: string; color: string }> = {
  clean: { label: '✓', color: 'var(--accent-success)' },
  dirty: { label: '✗', color: 'var(--accent-danger)' },
  in_progress: { label: '⟳', color: 'var(--accent-warning)' },
};

export default function MobileDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const d = await res.json();
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
        {[1,2,3,4].map(i => <div key={i} className="m-skeleton" style={{ height: 72, borderRadius: 14 }} />)}
      </div>
    );
  }

  if (!data) return null;

  const kpis = [
    { value: data.arrivalsToday, label: 'Заїзди', icon: ArrowDownRight, color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
    { value: data.departuresToday, label: 'Виїзди', icon: ArrowUpRight, color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
    { value: `${data.occupancyRate}%`, label: 'Заванта.', icon: TrendingUp, color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    { value: data.freeUnits, label: 'Вільних', icon: BedDouble, color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  ];

  return (
    <div>
      {/* Pull to refresh indicator */}
      <button
        onClick={fetchData}
        disabled={loading}
        style={{
          position: 'absolute', top: -4, right: 16,
          background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
          cursor: 'pointer', padding: 4, zIndex: 5,
        }}
      >
        <RefreshCw size={16} className={loading ? 'animate-pulse' : ''} />
      </button>

      {/* KPI Grid */}
      <div className="m-kpi-grid">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="m-kpi-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: kpi.color }} />
                </div>
              </div>
              <div className="m-kpi-value">{kpi.value}</div>
              <div className="m-kpi-label">{kpi.label}</div>
            </div>
          );
        })}
      </div>

      {/* Upcoming Arrivals */}
      <div className="m-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        🛬 Найближчі заїзди
        <span style={{
          fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px',
          background: 'rgba(52,211,153,0.15)', color: 'var(--accent-success)',
        }}>{data.upcomingArrivals.length}</span>
      </div>
      {data.upcomingArrivals.length === 0 ? (
        <div className="m-empty" style={{ padding: 24 }}>Немає найближчих заїздів</div>
      ) : (
        data.upcomingArrivals.slice(0, 8).map(a => (
          <div key={a.id} className="m-card" style={{ padding: '12px 14px' }}>
            <div className="m-card-row">
              <div>
                <div className="m-card-title">{a.first_name} {a.last_name}</div>
                <div className="m-card-subtitle">{a.unit_code} · {a.nights} ноч.</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.check_in}</div>
                <div style={{ fontSize: 11, color: STATUS_MAP[a.status]?.color || 'var(--text-tertiary)' }}>
                  {STATUS_MAP[a.status]?.label || a.status}
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Today Departures */}
      <div className="m-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
        🚶 Виїзди сьогодні
        <span style={{
          fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px',
          background: 'rgba(96,165,250,0.15)', color: 'var(--accent-info)',
        }}>{data.todayDepartures.length}</span>
      </div>
      {data.todayDepartures.length === 0 ? (
        <div className="m-empty" style={{ padding: 24 }}>Немає виїздів сьогодні</div>
      ) : (
        data.todayDepartures.map(d => (
          <div key={d.id} className="m-card" style={{ padding: '12px 14px' }}>
            <div className="m-card-row">
              <div>
                <div className="m-card-title">{d.first_name} {d.last_name}</div>
                <div className="m-card-subtitle">{d.unit_code}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 14, fontWeight: 700,
                  color: CLEAN_MAP[d.cleaning_status]?.color || 'var(--text-tertiary)',
                }}>
                  {CLEAN_MAP[d.cleaning_status]?.label || '?'}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
