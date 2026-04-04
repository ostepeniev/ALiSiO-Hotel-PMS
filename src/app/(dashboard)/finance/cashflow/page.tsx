'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface MonthlyData {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
}

interface SourceEntry {
  method: string;
  count: number;
  total: number;
}

interface CategoryEntry {
  name: string;
  icon: string;
  color: string;
  total: number;
}

interface BUEntry {
  name: string;
  total: number;
}

interface CashFlowData {
  month: string;
  kpi: { inflows: number; outflows: number; netCashFlow: number };
  monthlyData: MonthlyData[];
  inflowsBySource: SourceEntry[];
  outflowsByCategory: CategoryEntry[];
  outflowsByBU: BUEntry[];
}

function formatCZK(amount: number): string {
  if (amount === 0) return '0 CZK';
  return `${Math.round(amount).toLocaleString('cs-CZ')} CZK`;
}

function getMonthLabel(m: string): string {
  const [, month] = m.split('-');
  const names = ['', 'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
  return names[parseInt(month)] || m;
}

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка',
  card: '💳 Картка',
  bank_transfer: '🏦 Переказ',
  invoice: '📄 Фактура',
  online: '🌐 Онлайн',
  booking_platform: '🏨 Платформа бронювання',
};

export default function CashFlowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/cashflow?month=${month}`);
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header"><h1>📊 Cash Flow</h1></div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
      </div>
    );
  }

  if (!data) return <div className="page-container"><p>Помилка завантаження</p></div>;

  const maxBar = Math.max(...data.monthlyData.map(d => Math.max(d.inflows, d.outflows)), 1);
  const maxOutflow = data.outflowsByCategory.length > 0 ? Math.max(...data.outflowsByCategory.map(c => c.total)) : 1;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={28} /> Cash Flow — Рух коштів
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Реальний рух грошей: коли прийшли / пішли
          </p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowDownLeft size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Надходження</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e' }}>{formatCZK(data.kpi.inflows)}</div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpRight size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Видатки</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>{formatCZK(data.kpi.outflows)}</div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '12px',
            background: data.kpi.netCashFlow >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: data.kpi.netCashFlow >= 0 ? '#22c55e' : '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Чистий потік</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: data.kpi.netCashFlow >= 0 ? '#22c55e' : '#ef4444' }}>{formatCZK(data.kpi.netCashFlow)}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 600 }}>📊 Рух коштів по місяцях</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '220px' }}>
          {data.monthlyData.map((d) => (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: d.net >= 0 ? '#22c55e' : '#ef4444' }}>
                {d.net !== 0 ? formatCZK(d.net) : ''}
              </div>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '170px', width: '100%', justifyContent: 'center' }}>
                <div
                  style={{
                    width: '40%', borderRadius: '4px 4px 0 0',
                    height: `${Math.max((d.inflows / maxBar) * 170, 2)}px`,
                    background: 'linear-gradient(to top, #22c55e, #4ade80)',
                  }}
                  title={`Надходження: ${formatCZK(d.inflows)}`}
                />
                <div
                  style={{
                    width: '40%', borderRadius: '4px 4px 0 0',
                    height: `${Math.max((d.outflows / maxBar) * 170, 2)}px`,
                    background: 'linear-gradient(to top, #ef4444, #f87171)',
                  }}
                  title={`Видатки: ${formatCZK(d.outflows)}`}
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{getMonthLabel(d.month)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e', display: 'inline-block' }} /> Надходження
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#ef4444', display: 'inline-block' }} /> Видатки
          </span>
        </div>
      </div>

      {/* Breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        {/* By Source */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📥 Надходження по джерелах</h3>
          {data.inflowsBySource.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Немає даних</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.inflowsBySource.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                  <span style={{ fontSize: '0.85rem' }}>{METHOD_LABELS[s.method] || s.method}</span>
                  <span style={{ fontWeight: 600, color: '#22c55e', fontSize: '0.85rem' }}>{formatCZK(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Category */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📤 Видатки по категоріях</h3>
          {data.outflowsByCategory.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Немає даних</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {data.outflowsByCategory.map((c, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.8rem' }}>{c.icon} {c.name}</span>
                    <span style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.8rem' }}>{formatCZK(c.total)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.total / maxOutflow) * 100}%`, background: c.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By BU */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>🏢 Видатки по BU</h3>
          {data.outflowsByBU.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Немає даних</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.outflowsByBU.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--surface-hover)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{b.name || 'Без BU'}</span>
                  <span style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.85rem' }}>{formatCZK(b.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
