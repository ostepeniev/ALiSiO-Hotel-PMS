'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart } from 'lucide-react';

interface BU {
  id: string;
  name: string;
}

interface PnLRow {
  section: string;
  line: string;
  type: string;
  key: string;
  buValues: Record<string, number>;
  total: number;
}

interface PnLData {
  month: string;
  businessUnits: BU[];
  rows: PnLRow[];
}

function formatCZK(amount: number): string {
  if (amount === 0) return '—';
  const prefix = amount < 0 ? '(' : '';
  const suffix = amount < 0 ? ')' : '';
  return `${prefix}${Math.abs(Math.round(amount)).toLocaleString('cs-CZ')}${suffix}`;
}

// Section styling
function getSectionStyle(section: string): React.CSSProperties {
  switch (section) {
    case 'Revenue': return { background: 'rgba(34,197,94,0.06)' };
    case 'Variable': return { background: 'rgba(239,68,68,0.04)' };
    case 'Margin': return { background: 'rgba(139,92,246,0.06)', fontWeight: 700 };
    case 'OPEX direct': return { background: 'rgba(249,115,22,0.04)' };
    case 'OPEX alloc': return { background: 'rgba(99,102,241,0.04)' };
    case 'Result': return { background: 'rgba(34,197,94,0.08)', fontWeight: 700 };
    case 'Taxes': return { background: 'rgba(51,65,85,0.06)' };
    case 'CAPEX': return { background: 'rgba(14,165,233,0.06)' };
    default: return {};
  }
}

function getRowStyle(type: string): React.CSSProperties {
  if (['total_revenue', 'total_variable', 'gross_profit', 'ebitda', 'net'].includes(type)) {
    return { fontWeight: 700, borderTop: '2px solid var(--border)' };
  }
  return {};
}

export default function PnLPage() {
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/pnl?month=${month}`);
      setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header"><h1>📈 P&L — Прибутки та збитки</h1></div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
      </div>
    );
  }

  if (!data) return <div className="page-container"><p>Помилка завантаження</p></div>;

  // Group rows by section for headers
  let currentSection = '';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PieChart size={28} /> P&L — Прибутки та збитки
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Повна структура P&L по бізнес-юнітах — {month}
          </p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, minWidth: '220px', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                Рядок P&L
              </th>
              {data.businessUnits.map(bu => (
                <th key={bu.id} style={{ textAlign: 'right', padding: '0.75rem 0.75rem', fontWeight: 600, minWidth: '120px', whiteSpace: 'nowrap' }}>
                  {bu.name}
                </th>
              ))}
              <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 700, minWidth: '120px', borderLeft: '2px solid var(--border)' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const showSectionHeader = row.section !== currentSection;
              if (showSectionHeader) currentSection = row.section;

              return (
                <tr key={i} style={{ ...getSectionStyle(row.section), ...getRowStyle(row.type) }}>
                  <td style={{
                    padding: '0.5rem 1rem', position: 'sticky', left: 0,
                    background: 'inherit', zIndex: 1,
                    paddingLeft: ['total_revenue', 'total_variable', 'gross_profit', 'ebitda', 'net', 'capex'].includes(row.type) ? '1rem' : '2rem',
                    fontSize: ['ebitda', 'net'].includes(row.type) ? '0.95rem' : '0.85rem',
                  }}>
                    {showSectionHeader && row.type === 'direct' && (
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.15rem' }}>
                        {row.section}
                      </span>
                    )}
                    {row.line}
                  </td>
                  {data.businessUnits.map(bu => (
                    <td key={bu.id} style={{
                      textAlign: 'right', padding: '0.5rem 0.75rem',
                      color: (row.buValues[bu.id] || 0) < 0 ? '#ef4444' : (row.buValues[bu.id] || 0) > 0 ? '#22c55e' : 'var(--text-secondary)',
                    }}>
                      {formatCZK(row.buValues[bu.id] || 0)}
                    </td>
                  ))}
                  <td style={{
                    textAlign: 'right', padding: '0.5rem 1rem',
                    borderLeft: '2px solid var(--border)', fontWeight: 700,
                    color: row.total < 0 ? '#ef4444' : row.total > 0 ? '#22c55e' : 'var(--text-secondary)',
                  }}>
                    {formatCZK(row.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '2rem' }}>
        <span>💡 Revenue = плюс; expense = мінус; CAPEX показаний окремим рядком</span>
        <span>📊 Валюта: CZK</span>
      </div>
    </div>
  );
}
