'use client';

import { useEffect, useState } from 'react';
import { FileSpreadsheet, AlertCircle, CheckCircle2, Upload, Trash2 } from 'lucide-react';

interface ImportResult {
  ok: boolean;
  dry_run: boolean;
  parsed: number;
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  entities_created: {
    accounts: string[];
    categories: string[];
    projects: string[];
    counterparties: string[];
  };
  per_month: Record<string, number>;
}

interface Status {
  never_run?: boolean;
  current_count?: number;
  ran_at?: string;
  parsed?: number;
  created?: number;
  skipped?: number;
  errors?: number;
  dry_run?: boolean;
}

export default function FinmapImportTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rollbackResult, setRollbackResult] = useState<any>(null);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    fetch('/api/finance/finmap-import').then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  async function rollback(includeEntities: boolean, dryRun: boolean) {
    const verb = dryRun ? 'Перевірити що буде видалено' : (includeEntities ? 'ВИДАЛИТИ операції + всі auto-створені accounts/categories/projects/counterparties' : 'ВИДАЛИТИ ТІЛЬКИ операції з джерелом finmap_import');
    if (!dryRun && !confirm(`${verb}?\n\nЦя дія НЕЗВОРОТНА. Продовжити?`)) return;
    setRollingBack(true);
    setError(null);
    setRollbackResult(null);
    try {
      const res = await fetch('/api/finance/finmap-import/rollback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_entities: includeEntities, dry_run: dryRun }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || 'Rollback failed');
      else {
        setRollbackResult(json);
        fetch('/api/finance/finmap-import').then((r) => r.json()).then(setStatus).catch(() => {});
      }
    } catch (e: any) { setError(e.message); }
    setRollingBack(false);
  }

  async function run(dryRun: boolean) {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      const url = `/api/finance/finmap-import${dryRun ? '?dry_run=1' : ''}`;
      const res = await fetch(url, { method: 'POST', body: file ? fd : undefined });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Import failed');
      } else {
        setResult(json);
        // refresh status
        fetch('/api/finance/finmap-import').then((r) => r.json()).then(setStatus).catch(() => {});
      }
    } catch (e: any) { setError(e.message); }
    setRunning(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <FileSpreadsheet size={20} color="#16a34a" />
        <h2 style={{ margin: 0, fontSize: 18 }}>Finmap історичний імпорт</h2>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Імпортує операції з Finmap XLSX експорту в <code>fin_operations</code> з тегом <code>source=&apos;finmap_import&apos;</code>.
        Ідемпотентно (SHA256 hash як dedup key — повторний run це no-op).
        Відсутні рахунки/категорії/проекти/контрагенти створюються автоматично.
        За замовчуванням бере файл з <code>docs/ExportUK (2).xlsx</code> у репо;
        можеш завантажити свіжіший:
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ ...input, flex: 1 }}
        />
        <button onClick={() => run(true)} disabled={running} style={{ ...btn, background: 'var(--bg-primary)' }}>
          🔍 Dry run (preview)
        </button>
        <button onClick={() => run(false)} disabled={running} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>
          {running ? 'Імпорт…' : '✓ Запустити імпорт'}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, padding: 8, borderLeft: '3px solid var(--border-primary)' }}>
          {status.never_run ? (
            <>Імпорт ще не запускався</>
          ) : (
            <>
              Останній run: <b>{status.ran_at}</b> ({status.dry_run ? 'dry-run' : 'COMMIT'}){' '}
              · parsed <b>{status.parsed}</b> · created <b>{status.created}</b> · skipped <b>{status.skipped}</b>
              {(status.errors ?? 0) > 0 && <span style={{ color: '#ef4444' }}> · errors <b>{status.errors}</b></span>}
            </>
          )}
          <br />
          В системі зараз: <b>{status.current_count ?? 0}</b> операцій з джерелом <code>finmap_import</code>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
          <b>Помилка:</b> {error}
        </div>
      )}

      {result && (
        <div style={{ padding: 16, border: '1px solid var(--border-primary)', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {result.dry_run ? '🔍 Dry-run результат' : '✓ Імпорт виконано'}
            {!result.dry_run && <span style={{ fontSize: 11, color: '#16a34a', padding: '2px 6px', background: 'rgba(34,197,94,0.15)', borderRadius: 4 }}>COMMITTED</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
            <span>Parsed: <b>{result.parsed}</b></span>
            <span style={{ color: '#22c55e' }}>{result.dry_run ? 'Will create' : 'Created'}: <b>{result.created}</b></span>
            <span style={{ color: 'var(--text-secondary)' }}>Skipped (already imported): <b>{result.skipped}</b></span>
            {result.errors.length > 0 && (
              <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Errors: <b>{result.errors.length}</b>
              </span>
            )}
          </div>

          {/* Per-month breakdown */}
          {Object.keys(result.per_month).length > 0 && (
            <details open>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>По місяцях</summary>
              <table style={{ marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={th}>Місяць</th><th style={th}>Операцій</th></tr>
                </thead>
                <tbody>
                  {Object.entries(result.per_month).sort().map(([m, c]) => (
                    <tr key={m}><td style={td}>{m}</td><td style={td}>{c}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {/* Entities created */}
          {result.entities_created.accounts.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                {result.dry_run ? 'Будуть створені' : 'Створено'} рахунки ({result.entities_created.accounts.length})
              </summary>
              <ul style={{ margin: '4px 0 8px 20px', fontSize: 12 }}>
                {result.entities_created.accounts.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          )}
          {result.entities_created.categories.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                {result.dry_run ? 'Будуть створені' : 'Створено'} категорії ({result.entities_created.categories.length})
              </summary>
              <ul style={{ margin: '4px 0 8px 20px', fontSize: 12 }}>
                {result.entities_created.categories.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          )}
          {result.entities_created.projects.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                {result.dry_run ? 'Будуть створені' : 'Створено'} проекти ({result.entities_created.projects.length})
              </summary>
              <ul style={{ margin: '4px 0 8px 20px', fontSize: 12 }}>
                {result.entities_created.projects.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          )}
          {result.entities_created.counterparties.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                {result.dry_run ? 'Будуть створені' : 'Створено'} контрагенти ({result.entities_created.counterparties.length})
              </summary>
              <ul style={{ margin: '4px 0 8px 20px', fontSize: 12 }}>
                {result.entities_created.counterparties.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
          )}

          {result.errors.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444' }}>Помилки ({result.errors.length})</summary>
              <ul style={{ margin: '4px 0 8px 20px', fontSize: 12 }}>
                {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Rollback section */}
      <div style={{ padding: 16, marginBottom: 16, border: '1px solid #ef4444', borderRadius: 10, background: 'rgba(239,68,68,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Trash2 size={16} color="#ef4444" />
          <h3 style={{ margin: 0, fontSize: 15, color: '#ef4444' }}>Rollback (відкат імпорту)</h3>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Видаляє всі fin_operations з джерелом <code>finmap_import</code>. Опціонально — також видаляє accounts/categories/projects/counterparties автоматично створені імпортом
          (ID-префікси <code>acct_finmap_*</code>, <code>ec_finmap_*</code>, <code>bu_finmap_*</code>, <code>cp_finmap_*</code>).
          Якщо якась entity використовується ще десь (FK conflict) — пропустить її і повідомить.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => rollback(false, true)} disabled={rollingBack} style={btn}>
            🔍 Dry-run (тільки операції)
          </button>
          <button onClick={() => rollback(true, true)} disabled={rollingBack} style={btn}>
            🔍 Dry-run (все, включно з entities)
          </button>
          <button onClick={() => rollback(false, false)} disabled={rollingBack} style={{ ...btn, background: '#ef4444', color: '#fff', border: 'none' }}>
            <Trash2 size={12} /> {rollingBack ? 'Rollback…' : 'Видалити операції'}
          </button>
          <button onClick={() => rollback(true, false)} disabled={rollingBack} style={{ ...btn, background: '#dc2626', color: '#fff', border: 'none' }}>
            <Trash2 size={12} /> {rollingBack ? 'Rollback…' : 'Видалити ВСЕ (operations + entities)'}
          </button>
        </div>

        {rollbackResult && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {rollbackResult.dry_run ? '🔍 Що буде видалено:' : '✓ Видалено:'}
            </div>
            <div>Operations: <b>{rollbackResult.operations.deleted ?? rollbackResult.operations.found}</b> (знайдено {rollbackResult.operations.found})</div>
            {rollbackResult.entities && !rollbackResult.entities.skipped && Object.entries(rollbackResult.entities).map(([k, v]: any) => (
              <div key={k}>{k}: <b>{v.deleted ?? v.found}</b> (знайдено {v.found}){v.errors && v.errors.length > 0 && (
                <span style={{ color: '#ef4444', marginLeft: 8 }}>· {v.errors.length} FK conflict(s)</span>
              )}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <b>Workflow:</b>
        <ol style={{ margin: '4px 0 0 16px' }}>
          <li>Спершу натисни <b>Dry run</b> — побачиш скільки операцій буде створено та які нові entities</li>
          <li>Перевір що auto-create accounts/categories виглядає ОК</li>
          <li>Натисни <b>Запустити імпорт</b> — операції створюються в одній транзакції</li>
          <li>Якщо щось не так — operations можна знайти за фільтром <code>source = finmap_import</code> і видалити масово</li>
        </ol>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)' };
const btn: React.CSSProperties = { padding: '7px 14px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const th: React.CSSProperties = { textAlign: 'left', padding: '4px 12px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '4px 12px' };
