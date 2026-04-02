'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Receipt, Search, Edit2, Trash2, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  std_group: string;
  pnl_line: string;
}

interface BU {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  amount: number;
  description: string;
  counterparty: string;
  method: string;
  expense_date: string;
  month: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  std_group: string;
  bu_name: string;
  category_id: string;
  business_unit_id: string;
  notes: string;
}

interface CategorySummary {
  id: string;
  name: string;
  icon: string;
  color: string;
  std_group: string;
  total: number;
}

function formatCZK(amount: number): string {
  if (amount === 0) return '0';
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${Math.abs(Math.round(amount)).toLocaleString('cs-CZ')}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: '💵 Готівка',
  card: '💳 Картка',
  bank_transfer: '🏦 Переказ',
  invoice: '📄 Фактура',
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bus, setBus] = useState<BU[]>([]);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBU, setFilterBU] = useState('');
  const [search, setSearch] = useState('');

  // Form
  const [form, setForm] = useState({
    category_id: '',
    business_unit_id: '',
    amount: '',
    description: '',
    counterparty: '',
    method: 'cash',
    expense_date: new Date().toISOString().substring(0, 10),
    notes: '',
    is_revenue: false,
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (filterCategory) params.set('category_id', filterCategory);
    if (filterBU) params.set('business_unit_id', filterBU);
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/finance/expenses?${params}`);
      const json = await res.json();
      setExpenses(json.expenses || []);
      setTotal(json.total || 0);
      setCategorySummary(json.categorySummary || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month, filterCategory, filterBU, search]);

  const fetchMeta = useCallback(async () => {
    try {
      const [catRes, buRes] = await Promise.all([
        fetch('/api/finance/expense-categories'),
        fetch('/api/finance/business-units'),
      ]);
      setCategories(await catRes.json());
      setBus(await buRes.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      category_id: categories[0]?.id || '',
      business_unit_id: '',
      amount: '',
      description: '',
      counterparty: '',
      method: 'cash',
      expense_date: new Date().toISOString().substring(0, 10),
      notes: '',
      is_revenue: false,
    });
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingId(exp.id);
    const isRev = exp.amount > 0;
    setForm({
      category_id: exp.category_id,
      business_unit_id: exp.business_unit_id || '',
      amount: String(Math.abs(exp.amount)),
      description: exp.description,
      counterparty: exp.counterparty || '',
      method: exp.method || 'cash',
      expense_date: exp.expense_date,
      notes: exp.notes || '',
      is_revenue: isRev,
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount) * (form.is_revenue ? 1 : -1);
    const body = {
      category_id: form.category_id,
      business_unit_id: form.business_unit_id || null,
      amount,
      description: form.description,
      counterparty: form.counterparty,
      method: form.method,
      expense_date: form.expense_date,
      notes: form.notes,
    };

    try {
      if (editingId) {
        await fetch(`/api/finance/expenses/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/finance/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowModal(false);
      fetchExpenses();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити цю транзакцію?')) return;
    try {
      await fetch(`/api/finance/expenses/${id}`, { method: 'DELETE' });
      fetchExpenses();
    } catch (e) { console.error(e); }
  };

  const filteredSummary = categorySummary.filter(c => c.total !== 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={28} /> Витрати
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Управління витратами та доходами — {total} записів
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Plus size={18} /> Додати транзакцію
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
        />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
          <option value="">Всі категорії</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <select value={filterBU} onChange={(e) => setFilterBU(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
          <option value="">Всі BU</option>
          {bus.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input type="text" placeholder="Пошук..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Category Summary Cards */}
      {filteredSummary.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {filteredSummary.map(c => (
            <div key={c.id}
              onClick={() => setFilterCategory(filterCategory === c.id ? '' : c.id)}
              style={{
                padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap',
                border: filterCategory === c.id ? `2px solid ${c.color}` : '1px solid var(--border)',
                background: filterCategory === c.id ? `${c.color}15` : 'var(--surface)',
                display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 'fit-content',
                transition: 'all 0.15s',
              }}>
              <span>{c.icon}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.total >= 0 ? '#22c55e' : '#ef4444' }}>
                {formatCZK(c.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expenses Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
        ) : expenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Receipt size={48} strokeWidth={1} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p>Немає транзакцій за обраний період</p>
            <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: '1rem' }}>
              <Plus size={16} /> Додати першу транзакцію
            </button>
          </div>
        ) : (
          <table className="data-table" style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Категорія</th>
                <th>Опис</th>
                <th>Контрагент</th>
                <th>BU</th>
                <th>Метод</th>
                <th style={{ textAlign: 'right' }}>Сума</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{exp.expense_date}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.15rem 0.5rem', borderRadius: '6px', background: `${exp.category_color}18`, fontSize: '0.8rem' }}>
                      {exp.category_icon} {exp.category_name}
                    </span>
                  </td>
                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{exp.counterparty || '—'}</td>
                  <td>{exp.bu_name || '—'}</td>
                  <td style={{ fontSize: '0.75rem' }}>{METHOD_LABELS[exp.method] || exp.method || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: exp.amount >= 0 ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>
                    {formatCZK(exp.amount)} CZK
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn-icon" onClick={() => openEdit(exp)} title="Редагувати"><Edit2 size={14} /></button>
                      <button className="btn-icon" onClick={() => handleDelete(exp.id)} title="Видалити" style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editingId ? 'Редагувати транзакцію' : 'Нова транзакція'}</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Type toggle */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${!form.is_revenue ? 'btn-primary' : ''}`}
                  style={{ flex: 1, background: !form.is_revenue ? '#ef4444' : undefined, borderColor: !form.is_revenue ? '#ef4444' : undefined }}
                  onClick={() => setForm({ ...form, is_revenue: false })}>
                  📤 Витрата
                </button>
                <button
                  className={`btn ${form.is_revenue ? 'btn-primary' : ''}`}
                  style={{ flex: 1, background: form.is_revenue ? '#22c55e' : undefined, borderColor: form.is_revenue ? '#22c55e' : undefined }}
                  onClick={() => setForm({ ...form, is_revenue: true })}>
                  📥 Дохід
                </button>
              </div>

              <div className="form-group">
                <label>Категорія *</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                  <option value="">Оберіть категорію</option>
                  {categories
                    .filter(c => form.is_revenue ? c.std_group === 'Revenue' : c.std_group !== 'Revenue')
                    .map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Бізнес-юніт</label>
                <select value={form.business_unit_id} onChange={e => setForm({ ...form, business_unit_id: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                  <option value="">Оберіть BU</option>
                  {bus.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Сума (CZK) *</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                </div>
                <div className="form-group">
                  <label>Дата *</label>
                  <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              <div className="form-group">
                <label>Опис *</label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Опис транзакції"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Контрагент</label>
                  <input type="text" value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} placeholder="Назва"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                </div>
                <div className="form-group">
                  <label>Метод оплати</label>
                  <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                    <option value="cash">💵 Готівка</option>
                    <option value="card">💳 Картка</option>
                    <option value="bank_transfer">🏦 Переказ</option>
                    <option value="invoice">📄 Фактура</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Нотатки</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Додаткова інформація"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.category_id || !form.amount || !form.description}>
                {editingId ? 'Зберегти' : 'Додати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
