'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Briefcase, BarChart3, DollarSign, ArrowLeft, Database, Building2, FileText } from 'lucide-react';
import InvestorsTab from './_components/InvestorsTab';
import InvestmentsTab from './_components/InvestmentsTab';
import MetricsTab from './_components/MetricsTab';
import PayoutsTab from './_components/PayoutsTab';
import SupabaseImportTab from './_components/SupabaseImportTab';
import PropertiesTab from './_components/PropertiesTab';
import MonthlyReportsTab from './_components/MonthlyReportsTab';

type TabId = 'properties' | 'investors' | 'investments' | 'metrics' | 'reports' | 'payouts' | 'supabase';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'properties',  label: 'Об\'єкти',             icon: <Building2 size={16} /> },
  { id: 'investors',   label: 'Інвестори',           icon: <Users size={16} /> },
  { id: 'investments', label: 'Інвестиції (лоти)',   icon: <Briefcase size={16} /> },
  { id: 'metrics',     label: 'Метрики (Occupancy)', icon: <BarChart3 size={16} /> },
  { id: 'reports',     label: 'Місячні звіти',       icon: <FileText size={16} /> },
  { id: 'payouts',     label: 'Виплати',             icon: <DollarSign size={16} /> },
  { id: 'supabase',    label: 'Import з Supabase',   icon: <Database size={16} /> },
];

export default function InvestorsAdminPage() {
  const [tab, setTab] = useState<TabId>('properties');

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance" style={backLink}><ArrowLeft size={14} /></Link>
        <h1 style={{ margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={24} /> Інвестори (адмін)
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 16, borderBottom: '1px solid var(--border-primary)' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: 'transparent',
              border: 'none', borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              color: tab === t.id ? '#3b82f6' : 'var(--text-secondary)',
              fontWeight: tab === t.id ? 600 : 500, fontSize: 13, cursor: 'pointer',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'properties' && <PropertiesTab />}
      {tab === 'investors' && <InvestorsTab />}
      {tab === 'investments' && <InvestmentsTab />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'reports' && <MonthlyReportsTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'supabase' && <SupabaseImportTab />}
    </div>
  );
}

const backLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: 8,
  background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-primary)', textDecoration: 'none',
};
