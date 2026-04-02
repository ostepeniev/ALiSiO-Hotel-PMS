'use client';

import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { FileText, Download, Eye, Plus, Printer } from 'lucide-react';

const DEMO_DOCS = [
  { id: 'DOC-001', name: 'Підтвердження бронювання #B001', type: 'booking_confirmation', booking: 'B001', guest: 'Jan Novák', lang: 'CZ', created: '2026-03-10' },
  { id: 'DOC-002', name: 'Підтвердження бронювання #B002', type: 'booking_confirmation', booking: 'B002', guest: 'Maria Schmidt', lang: 'DE', created: '2026-03-10' },
  { id: 'DOC-003', name: 'Підтвердження бронювання #B003', type: 'booking_confirmation', booking: 'B003', guest: 'Олена Ковальчук', lang: 'UA', created: '2026-03-11' },
  { id: 'DOC-004', name: 'Правила проживання', type: 'rules', booking: '—', guest: '—', lang: 'CZ/EN', created: '2026-02-15' },
  { id: 'DOC-005', name: 'Інструкція заїзду (Glamping)', type: 'instructions', booking: '—', guest: '—', lang: 'CZ/EN/DE/UA', created: '2026-02-10' },
];

const TYPE_MAP: Record<string, { label: string; badge: string }> = {
  booking_confirmation: { label: 'Підтвердження', badge: 'badge-success' },
  invoice: { label: 'Інвойс', badge: 'badge-primary' },
  rules: { label: 'Правила', badge: 'badge-warning' },
  instructions: { label: 'Інструкція', badge: 'badge-info' },
};

export default function DocumentsPage() {
  const onMenuClick = useMobileMenu();
  return (
    <>
      <Header title="Документи" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Документи</h2>
            <div className="page-subtitle">Шаблони та згенеровані документи</div>
          </div>
          <button className="btn btn-primary"><Plus size={16} /> Створити документ</button>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Назва</th>
                <th>Тип</th>
                <th>Гість</th>
                <th>Мова</th>
                <th>Створено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {DEMO_DOCS.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{doc.id}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <FileText size={14} style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ fontWeight: 500 }}>{doc.name}</span>
                    </span>
                  </td>
                  <td><span className={`badge ${TYPE_MAP[doc.type]?.badge || 'badge-info'}`}>{TYPE_MAP[doc.type]?.label || doc.type}</span></td>
                  <td>{doc.guest}</td>
                  <td><span className="badge badge-info">{doc.lang}</span></td>
                  <td>{doc.created}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost btn-icon" title="Переглянути"><Eye size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Завантажити"><Download size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon" title="Друк"><Printer size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
