'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  FileText, Download, Eye, RefreshCw, Receipt,
  CheckCircle, AlertCircle, Calendar, User
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  amount: number;
  currency: string;
  status: 'issued' | 'cancelled';
  reservation_id: string;
  guest_first_name: string;
  guest_last_name: string;
  unit_name: string;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(amount: number, currency = 'CZK') {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DocumentsPage() {
  const onMenuClick = useMobileMenu();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setInvoices(data);
    } catch {
      setError('Не вдалося завантажити документи');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, []);

  const openInvoice = (id: string) => {
    window.open(`/api/invoices/${id}`, '_blank');
  };

  const downloadInvoice = (id: string, invoiceNumber: string) => {
    const a = document.createElement('a');
    a.href = `/api/invoices/${id}?format=download`;
    a.download = `faktura-${invoiceNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <Header title="Документи" onMenuClick={onMenuClick} />
      <div className="app-content">

        {/* ─── Page Header ──────────────────────────────────────── */}
        <div className="page-header">
          <div>
            <h2 className="page-title">Документи</h2>
            <div className="page-subtitle">Інвойси та фінансові документи бронювань</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={fetchInvoices} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Оновити
          </button>
        </div>

        {/* ─── Summary Cards ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(79,110,247,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Receipt size={18} color="var(--accent-primary)" />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Всього інвойсів</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{invoices.length}</div>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(52,211,153,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircle size={18} color="var(--accent-success)" />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Виставлено</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {invoices.filter(i => i.status === 'issued').length}
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(79,110,247,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FileText size={18} color="var(--accent-primary)" />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Сума (поточний рік)</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {formatAmount(
                invoices
                  .filter(i => i.issued_at?.startsWith(new Date().getFullYear().toString()) && i.status === 'issued')
                  .reduce((s, i) => s + i.amount, 0)
              )}
            </div>
          </div>
        </div>

        {/* ─── Info banner ──────────────────────────────────────── */}
        <div style={{
          background: 'rgba(79,110,247,0.08)',
          border: '1px solid rgba(79,110,247,0.2)',
          borderRadius: 8, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)'
        }}>
          <AlertCircle size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <span>
            Інвойси (Faktury) генеруються <strong>автоматично</strong> після позначення бронювання як
            {' '}<strong>«Оплачено»</strong>. Kemp Carlsbad s.r.o. — <strong>neplátce DPH</strong>.
            Для збереження PDF — відкрийте інвойс та натисніть «Stáhnout PDF / Tisk» у браузері.
          </span>
        </div>

        {/* ─── Invoices Table ───────────────────────────────────── */}
        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
            <div>Завантаження документів...</div>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
            <AlertCircle size={24} style={{ marginBottom: 8 }} />
            <div>{error}</div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="card" style={{ padding: 56, textAlign: 'center' }}>
            <Receipt size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Документів ще немає</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
              Інвойс буде створено автоматично, коли бронювання буде позначено як оплачене.
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Гість</th>
                  <th>Об&apos;єкт</th>
                  <th>Сума</th>
                  <th>Дата виставлення</th>
                  <th>Термін оплати</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    {/* Invoice Number */}
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <code style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 12, fontWeight: 600,
                          color: 'var(--accent-primary)'
                        }}>
                          {inv.invoice_number}
                        </code>
                      </span>
                    </td>

                    {/* Guest */}
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>
                          {inv.guest_first_name} {inv.guest_last_name}
                        </span>
                      </span>
                    </td>

                    {/* Unit */}
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {inv.unit_name}
                    </td>

                    {/* Amount */}
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {formatAmount(inv.amount, inv.currency)}
                      </span>
                    </td>

                    {/* Issue Date */}
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <Calendar size={12} />
                        {formatDate(inv.issued_at)}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {formatDate(inv.due_date)}
                    </td>

                    {/* Status */}
                    <td>
                      {inv.status === 'issued' ? (
                        <span className="badge badge-success">✓ Виставлено</span>
                      ) : (
                        <span className="badge badge-danger">Скасовано</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-sm btn-ghost btn-icon"
                          title="Переглянути / Друк / PDF"
                          onClick={() => openInvoice(inv.id)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-sm btn-ghost btn-icon"
                          title="Завантажити HTML"
                          onClick={() => downloadInvoice(inv.id, inv.invoice_number)}
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </>
  );
}
