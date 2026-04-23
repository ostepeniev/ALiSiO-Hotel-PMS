'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, ArrowLeftRight, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  color: string;
  balance: number;
}

interface Transaction {
  tx_type: 'income' | 'expense' | 'payment' | 'transfer';
  id: string;
  date: string;
  amount_raw: number;
  currency: string;
  account_id: string | null;
  account_name: string | null;
  account_color: string | null;
  counterparty: string | null;
  category: string | null;
  bu_name: string | null;
  notes: string | null;
  reservation_code: string | null;
}

interface BusinessUnit {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────

function formatCZK(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  return `${amount < 0 ? '−' : '+'}${abs.toLocaleString('cs-CZ')} CZK`;
}

function formatBalance(amount: number, currency: string): string {
  return `${Math.round(amount).toLocaleString('cs-CZ')} ${currency}`;
}

const TX_LABELS: Record<string, string> = {
  income: 'Дохід',
  expense: 'Витрата',
  payment: 'Оплата броні',
  transfer: 'Переказ',
};

const TX_COLORS: Record<string, string> = {
  income: '#22c55e',
  expense: '#ef4444',
  payment: '#22c55e',
  transfer: '#8b5cf6',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit: 'Депозит',
  full: 'Повна оплата',
  partial: 'Часткова',
  refund: 'Повернення',
  service: 'Послуга',
};

// ─── Modal: Add Income ─────────────────────────────────────

function IncomeModal({ accounts, businessUnits, onClose, onSaved }: {
  accounts: Account[];
  businessUnits: BusinessUnit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    income_date: new Date().toISOString().split('T')[0],
    account_id: accounts[0]?.id || '',
    category: '',
    counterparty: '',
    business_unit_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/finance/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <ModalShell title="+ Дохід" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <FormRow label="Опис *">
          <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
        </FormRow>
        <FormRow label="Сума (CZK) *">
          <input className="form-input" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        </FormRow>
        <FormRow label="Дата *">
          <input className="form-input" type="date" value={form.income_date} onChange={e => setForm(f => ({ ...f, income_date: e.target.value }))} required />
        </FormRow>
        <FormRow label="Рахунок">
          <select className="form-input" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
            <option value="">— без рахунку —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Категорія">
          <input className="form-input" placeholder="напр. Ресторан, Кемпінг..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        </FormRow>
        <FormRow label="Контрагент">
          <input className="form-input" placeholder="Хто сплатив?" value={form.counterparty} onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))} />
        </FormRow>
        <FormRow label="Бізнес-юніт">
          <select className="form-input" value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
            <option value="">— без BU —</option>
            {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Примітка">
          <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FormRow>
        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#22c55e' }}>
            {saving ? 'Збереження...' : 'Додати дохід'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: Add Expense ────────────────────────────────────

function ExpenseModal({ accounts, businessUnits, onClose, onSaved }: {
  accounts: Account[];
  businessUnits: BusinessUnit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    account_id: accounts[0]?.id || '',
    category_id: '',
    counterparty: '',
    method: 'cash',
    business_unit_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/finance/expense-categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : (d.categories || [])));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        category_id: form.category_id,
        amount: parseFloat(form.amount),
        description: form.description,
        expense_date: form.expense_date,
        account_id: form.account_id || undefined,
        counterparty: form.counterparty || undefined,
        method: form.method || undefined,
        business_unit_id: form.business_unit_id || undefined,
        notes: form.notes || undefined,
      };
      const res = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <ModalShell title="− Витрата" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <FormRow label="Опис *">
          <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
        </FormRow>
        <FormRow label="Сума (CZK) *">
          <input className="form-input" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        </FormRow>
        <FormRow label="Дата *">
          <input className="form-input" type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} required />
        </FormRow>
        <FormRow label="Категорія *">
          <select className="form-input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} required>
            <option value="">— оберіть —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Рахунок">
          <select className="form-input" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
            <option value="">— без рахунку —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Метод">
          <select className="form-input" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
            <option value="cash">Готівка</option>
            <option value="card">Картка</option>
            <option value="bank_transfer">Банк. переказ</option>
            <option value="invoice">Рахунок</option>
          </select>
        </FormRow>
        <FormRow label="Контрагент">
          <input className="form-input" value={form.counterparty} onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))} />
        </FormRow>
        <FormRow label="Бізнес-юніт">
          <select className="form-input" value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
            <option value="">— без BU —</option>
            {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Примітка">
          <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FormRow>
        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#ef4444' }}>
            {saving ? 'Збереження...' : 'Додати витрату'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: Transfer ──────────────────────────────────────

function TransferModal({ accounts, onClose, onSaved }: {
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    from_account_id: accounts[0]?.id || '',
    to_account_id: accounts[1]?.id || '',
    amount: '',
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/finance/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <ModalShell title="⇄ Переказ між рахунками" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <FormRow label="Звідки *">
          <select className="form-input" value={form.from_account_id} onChange={e => setForm(f => ({ ...f, from_account_id: e.target.value }))} required>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Куди *">
          <select className="form-input" value={form.to_account_id} onChange={e => setForm(f => ({ ...f, to_account_id: e.target.value }))} required>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Сума (CZK) *">
          <input className="form-input" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
        </FormRow>
        <FormRow label="Дата *">
          <input className="form-input" type="date" value={form.transfer_date} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))} required />
        </FormRow>
        <FormRow label="Примітка">
          <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FormRow>
        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#8b5cf6' }}>
            {saving ? 'Збереження...' : 'Переказати'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: Manage Accounts ────────────────────────────────

function AccountsModal({ accounts, onClose, onSaved }: {
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'cash', currency: 'CZK', initial_balance: '0', color: '#6366f1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/finance/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, initial_balance: parseFloat(form.initial_balance) }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setCreating(false);
      setForm({ name: '', type: 'cash', currency: 'CZK', initial_balance: '0', color: '#6366f1' });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Рахунки" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
        {accounts.map(a => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem', borderRadius: '8px', background: 'var(--surface-hover)',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.type} · {a.currency}</div>
            </div>
            <div style={{ fontWeight: 700, color: a.balance >= 0 ? '#22c55e' : '#ef4444' }}>
              {formatBalance(a.balance, a.currency)}
            </div>
          </div>
        ))}
      </div>

      {!creating ? (
        <button className="btn btn-secondary" onClick={() => setCreating(true)} style={{ width: '100%' }}>
          + Новий рахунок
        </button>
      ) : (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <FormRow label="Назва *">
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="напр. Каса Кемпінг" />
          </FormRow>
          <FormRow label="Тип">
            <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="cash">Готівка</option>
              <option value="bank">Банк</option>
              <option value="investment">Інвестиції</option>
              <option value="other">Інше</option>
            </select>
          </FormRow>
          <FormRow label="Початковий залишок">
            <input className="form-input" type="number" step="0.01" value={form.initial_balance} onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))} />
          </FormRow>
          <FormRow label="Колір">
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 48, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
          </FormRow>
          {error && <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Скасувати</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...' : 'Створити'}</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ─── Shared UI helpers ─────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: '16px',
        padding: '1.75rem',
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '0.75rem' }}>
      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────

type ModalType = 'income' | 'expense' | 'transfer' | 'accounts' | null;

const PAGE_LIMIT = 50;

export default function FinanceLogPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingTx, setLoadingTx] = useState(true);

  const [modal, setModal] = useState<ModalType>(null);

  // Filters
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [filterType, setFilterType] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/finance/accounts');
    if (res.ok) setAccounts(await res.json());
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (filterMonth) params.set('month', filterMonth);
    if (filterType) params.set('type', filterType);
    if (filterAccount) params.set('account_id', filterAccount);
    if (filterSearch) params.set('search', filterSearch);
    try {
      const res = await fetch(`/api/finance/log?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } finally {
      setLoadingTx(false);
    }
  }, [page, filterMonth, filterType, filterAccount, filterSearch]);

  useEffect(() => {
    fetchAccounts();
    fetch('/api/finance/business-units').then(r => r.json()).then(d => setBusinessUnits(Array.isArray(d) ? d : []));
  }, [fetchAccounts]);

  useEffect(() => {
    setPage(1);
  }, [filterMonth, filterType, filterAccount, filterSearch]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  function handleModalSaved() {
    setModal(null);
    fetchAccounts();
    fetchTransactions();
  }

  const totalPages = Math.ceil(total / PAGE_LIMIT);

  // Summary numbers for current filtered view
  const summaryIncome = transactions
    .filter(t => t.tx_type === 'income' || t.tx_type === 'payment')
    .reduce((s, t) => s + t.amount_raw, 0);
  const summaryExpense = transactions
    .filter(t => t.tx_type === 'expense')
    .reduce((s, t) => s + Math.abs(t.amount_raw), 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Журнал транзакцій</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
            Доходи · Витрати · Оплати бронювань · Перекази
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setModal('accounts')} style={{ fontSize: '0.8rem' }}>
            Рахунки
          </button>
          <button className="btn btn-primary" onClick={() => setModal('income')} style={{ background: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Plus size={16} /> Дохід
          </button>
          <button className="btn btn-primary" onClick={() => setModal('expense')} style={{ background: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Minus size={16} /> Витрата
          </button>
          <button className="btn btn-primary" onClick={() => setModal('transfer')} style={{ background: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowLeftRight size={16} /> Переказ
          </button>
        </div>
      </div>

      {/* Account balance pills */}
      {accounts.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => setFilterAccount(filterAccount === a.id ? '' : a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 0.875rem', borderRadius: '20px',
                border: `2px solid ${filterAccount === a.id ? a.color : 'var(--border)'}`,
                background: filterAccount === a.id ? `${a.color}20` : 'var(--surface)',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
              <span>{a.name}</span>
              <span style={{ fontWeight: 700, color: a.balance >= 0 ? '#22c55e' : '#ef4444' }}>
                {formatBalance(a.balance, a.currency)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="month"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        >
          <option value="">Всі типи</option>
          <option value="income">Дохід</option>
          <option value="expense">Витрата</option>
          <option value="payment">Оплата броні</option>
          <option value="transfer">Переказ</option>
        </select>
        <input
          placeholder="Пошук..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.875rem', minWidth: 200 }}
        />
        {/* Mini summary */}
        {!loadingTx && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>↗ {Math.round(summaryIncome).toLocaleString('cs-CZ')} CZK</span>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>↘ {Math.round(summaryExpense).toLocaleString('cs-CZ')} CZK</span>
            <span style={{ color: (summaryIncome - summaryExpense) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
              = {Math.round(summaryIncome - summaryExpense).toLocaleString('cs-CZ')} CZK
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loadingTx ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Транзакцій не знайдено. Спробуйте змінити фільтри або додайте першу транзакцію.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Дата</th>
                <th style={{ width: 140, textAlign: 'right' }}>Сума</th>
                <th style={{ width: 110 }}>Тип</th>
                <th>Рахунок</th>
                <th>Контрагент</th>
                <th>Категорія</th>
                <th>BU</th>
                <th>Примітка</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const isPositive = tx.amount_raw >= 0;
                return (
                  <tr key={`${tx.tx_type}-${tx.id}`}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {tx.date ? tx.date.split('T')[0] : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: isPositive ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                      {isPositive ? '+' : '−'}{Math.abs(Math.round(tx.amount_raw)).toLocaleString('cs-CZ')} {tx.currency}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.5rem',
                        borderRadius: 12, fontSize: '0.72rem', fontWeight: 600,
                        background: `${TX_COLORS[tx.tx_type]}20`,
                        color: TX_COLORS[tx.tx_type],
                      }}>
                        {TX_LABELS[tx.tx_type]}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {tx.account_name ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {tx.account_color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: tx.account_color, flexShrink: 0 }} />}
                          {tx.account_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {tx.counterparty || (tx.reservation_code ? `#${tx.reservation_code}` : '—')}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {tx.tx_type === 'payment' && tx.category
                        ? PAYMENT_TYPE_LABELS[tx.category] || tx.category
                        : (tx.category || '—')}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tx.bu_name || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <ChevronLeft size={16} /> Назад
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {page} / {totalPages} ({total} записів)
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            Далі <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Modals */}
      {modal === 'income' && (
        <IncomeModal accounts={accounts} businessUnits={businessUnits} onClose={() => setModal(null)} onSaved={handleModalSaved} />
      )}
      {modal === 'expense' && (
        <ExpenseModal accounts={accounts} businessUnits={businessUnits} onClose={() => setModal(null)} onSaved={handleModalSaved} />
      )}
      {modal === 'transfer' && accounts.length >= 2 && (
        <TransferModal accounts={accounts} onClose={() => setModal(null)} onSaved={handleModalSaved} />
      )}
      {modal === 'accounts' && (
        <AccountsModal accounts={accounts} onClose={() => setModal(null)} onSaved={fetchAccounts} />
      )}
    </div>
  );
}
