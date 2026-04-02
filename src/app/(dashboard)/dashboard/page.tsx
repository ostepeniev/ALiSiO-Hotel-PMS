'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  BedDouble,
  CalendarDays,
  Users,
  Loader2,
} from 'lucide-react';

interface DashboardData {
  arrivalsToday: number;
  departuresToday: number;
  occupancyRate: number;
  freeUnits: number;
  totalUnits: number;
  upcomingArrivals: Array<{
    id: string; check_in: string; check_out: string; nights: number; adults: number; children: number; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string;
  }>;
  todayDepartures: Array<{
    id: string; check_out: string; status: string;
    first_name: string; last_name: string; unit_name: string; unit_code: string; cleaning_status: string;
  }>;
}

const STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Чернетка', badge: 'badge-info' },
  tentative: { label: 'Очікується', badge: 'badge-warning' },
  confirmed: { label: 'Підтверджено', badge: 'badge-success' },
  checked_in: { label: 'Заселено', badge: 'badge-primary' },
  checked_out: { label: 'Виселено', badge: 'badge-info' },
};

const CLEAN_MAP: Record<string, { label: string; badge: string }> = {
  clean: { label: 'Прибрано', badge: 'badge-success' },
  dirty: { label: 'Брудно', badge: 'badge-danger' },
  in_progress: { label: 'Прибирається', badge: 'badge-warning' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const onMenuClick = useMobileMenu();

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <>
        <Header title="Dashboard" onMenuClick={onMenuClick} />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={24} className="animate-pulse" /> <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>Завантаження...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Dashboard" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Stats cards */}
        <div className="dashboard-stats-grid">
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownRight size={22} style={{ color: 'var(--accent-success)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.arrivalsToday}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Заїзди сьогодні</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(96, 165, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={22} style={{ color: 'var(--accent-info)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.departuresToday}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Виїзди сьогодні</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(251, 191, 36, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={22} style={{ color: 'var(--accent-warning)' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.occupancyRate}%</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Завантаженість</div>
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BedDouble size={22} style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{data.freeUnits}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Вільних номерів</div>
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="dashboard-tables-grid">
          {/* Upcoming Arrivals */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} /> Найближчі заїзди
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(52,211,153,0.15)', color: 'var(--accent-success)', padding: '2px 8px', borderRadius: 10 }}>
                {data.upcomingArrivals.length}
              </span>
            </h3>
            {data.upcomingArrivals.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає найближчих заїздів</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="desktop-only">
                  <table className="table">
                    <thead>
                      <tr><th>Гість</th><th>Юніт</th><th>Заїзд</th><th>Ночей</th><th>Статус</th></tr>
                    </thead>
                    <tbody>
                      {data.upcomingArrivals.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.first_name} {a.last_name}</td>
                          <td><span className="badge badge-primary">{a.unit_code}</span></td>
                          <td>{a.check_in}</td>
                          <td>{a.nights}</td>
                          <td><span className={`badge ${STATUS_MAP[a.status]?.badge || 'badge-info'}`}>{STATUS_MAP[a.status]?.label || a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="mobile-only">
                  <div className="card-list">
                    {data.upcomingArrivals.map(a => (
                      <div key={a.id} className="dashboard-event-card">
                        <div className="dashboard-event-card-icon" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
                          <ArrowDownRight size={18} style={{ color: 'var(--accent-success)' }} />
                        </div>
                        <div className="dashboard-event-card-info">
                          <div className="dashboard-event-card-name">{a.first_name} {a.last_name}</div>
                          <div className="dashboard-event-card-detail">
                            <span className="badge badge-primary" style={{ fontSize: 10, padding: '1px 6px' }}>{a.unit_code}</span>
                            · {a.nights} ночей
                          </div>
                        </div>
                        <div className="dashboard-event-card-right">
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{a.check_in}</div>
                          <span className={`badge ${STATUS_MAP[a.status]?.badge || 'badge-info'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                            {STATUS_MAP[a.status]?.label || a.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Departures Today */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowUpRight size={16} /> Виїзди сьогодні
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(96,165,250,0.15)', color: 'var(--accent-info)', padding: '2px 8px', borderRadius: 10 }}>
                {data.todayDepartures.length}
              </span>
            </h3>
            {data.todayDepartures.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Немає виїздів сьогодні</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="desktop-only">
                  <table className="table">
                    <thead>
                      <tr><th>Гість</th><th>Юніт</th><th>Виїзд</th><th>Прибирання</th></tr>
                    </thead>
                    <tbody>
                      {data.todayDepartures.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.first_name} {d.last_name}</td>
                          <td><span className="badge badge-primary">{d.unit_code}</span></td>
                          <td>{d.check_out}</td>
                          <td><span className={`badge ${CLEAN_MAP[d.cleaning_status]?.badge || 'badge-info'}`}>{CLEAN_MAP[d.cleaning_status]?.label || d.cleaning_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="mobile-only">
                  <div className="card-list">
                    {data.todayDepartures.map(d => (
                      <div key={d.id} className="dashboard-event-card">
                        <div className="dashboard-event-card-icon" style={{ background: 'rgba(96, 165, 250, 0.15)' }}>
                          <ArrowUpRight size={18} style={{ color: 'var(--accent-info)' }} />
                        </div>
                        <div className="dashboard-event-card-info">
                          <div className="dashboard-event-card-name">{d.first_name} {d.last_name}</div>
                          <div className="dashboard-event-card-detail">
                            <span className="badge badge-primary" style={{ fontSize: 10, padding: '1px 6px' }}>{d.unit_code}</span>
                          </div>
                        </div>
                        <div className="dashboard-event-card-right">
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.check_out}</div>
                          <span className={`badge ${CLEAN_MAP[d.cleaning_status]?.badge || 'badge-info'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                            {CLEAN_MAP[d.cleaning_status]?.label || d.cleaning_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
