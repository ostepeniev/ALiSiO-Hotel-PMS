'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, FileSpreadsheet, ArrowRight, Save, Trash2, History, CheckCircle2, AlertCircle } from 'lucide-react';

interface ParseResult {
  ok: boolean;
  file_name: string;
  headers: string[];
  sample_rows: any[][];
  row_count: number;
  signature: string;
  matched_format: { id: string; name: string; description: string | null } | null;
  suggested_mapping: Record<number, string>;
  supported_fields: string[];
  all_rows: any[][];
}

interface SavedFormat {
  id: string;
  name: string;
  description: string | null;
  detector_signature: string;
  field_mappings: Record<number, string>;
  updated_at: string;
}

interface RunHistory {
  id: string;
  format_name: string | null;
  file_name: string;
  rows_total: number;
  rows_created: number;
  rows_skipped: number;
  rows_dup: number;
  status: string;
  created_at: string;
}

type EntityType = 'account' | 'category' | 'project' | 'counterparty';
const ENTITY_LABELS: Record<EntityType, string> = {
  account: 'Рахунки', category: 'Категорії', project: 'Проєкти', counterparty: 'Контрагенти',
};

interface PmsEntity { id: string; name: string; meta?: string; similarity?: number }
interface EntityCandidate {
  source_value: string;
  candidates: PmsEntity[];
  exact_match: PmsEntity | null;
  saved_resolution: { entity_id: string | null; action: string } | null;
}
interface ResolutionResult {
  ok: boolean;
  resolutions: Record<EntityType, { source_values_count: number; items: EntityCandidate[] }>;
}

interface UserChoice {
  pms_entity_id: string | null;
  action: 'use_existing' | 'create_new' | 'ignore';
}

export default function ImportWizardPage() {
  const [stage, setStage] = useState<'upload' | 'mapping' | 'resolution'>('upload');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [formatId, setFormatId] = useState<string | null>(null);
  const [formatName, setFormatName] = useState('');
  const [formatDesc, setFormatDesc] = useState('');
  const [savedFormats, setSavedFormats] = useState<SavedFormat[]>([]);
  const [runs, setRuns] = useState<RunHistory[]>([]);
  const [resolution, setResolution] = useState<ResolutionResult | null>(null);
  const [choices, setChoices] = useState<Record<EntityType, Record<string, UserChoice>>>({ account: {}, category: {}, project: {}, counterparty: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuxiliary = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([
        fetch('/api/finance/import/formats'),
        fetch('/api/finance/import/runs'),
      ]);
      const [fJ, rJ] = await Promise.all([fRes.json(), rRes.json()]);
      setSavedFormats(fJ.items || []);
      setRuns(rJ.items || []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { fetchAuxiliary(); }, [fetchAuxiliary]);

  async function handleUpload(file: File) {
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/import/parse', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Parse failed'); setLoading(false); return; }
      setParsed(json);
      setMapping(json.suggested_mapping || {});
      setFormatName(json.matched_format?.name || file.name.replace(/\.[^.]+$/, ''));
      setFormatDesc(json.matched_format?.description || '');
      setStage('mapping');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function saveAndContinue() {
    if (!parsed) return;
    if (!formatName.trim()) { alert('Введи назву формату'); return; }
    setLoading(true); setError(null);
    try {
      const fmtRes = await fetch('/api/finance/import/formats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: parsed.matched_format?.id,
          name: formatName.trim(),
          description: formatDesc.trim() || null,
          signature: parsed.signature,
          field_mappings: mapping,
        }),
      });
      const fmtJson = await fmtRes.json();
      if (!fmtRes.ok) { setError(fmtJson.error || 'Save failed'); setLoading(false); return; }
      const savedId = fmtJson.id as string;
      setFormatId(savedId);

      const resRes = await fetch('/api/finance/import/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format_id: savedId, field_mappings: mapping, all_rows: parsed.all_rows }),
      });
      const resJson = await resRes.json() as ResolutionResult;
      if (!resRes.ok) { setError((resJson as any).error || 'Resolve failed'); setLoading(false); return; }
      setResolution(resJson);

      // Pre-populate choices: saved → exact → high-similarity → create_new
      const initial: Record<EntityType, Record<string, UserChoice>> = { account: {}, category: {}, project: {}, counterparty: {} };
      for (const et of Object.keys(resJson.resolutions) as EntityType[]) {
        for (const item of resJson.resolutions[et].items) {
          if (item.saved_resolution) {
            initial[et][item.source_value] = { pms_entity_id: item.saved_resolution.entity_id, action: item.saved_resolution.action as any };
          } else if (item.exact_match) {
            initial[et][item.source_value] = { pms_entity_id: item.exact_match.id, action: 'use_existing' };
          } else if (item.candidates[0] && (item.candidates[0].similarity || 0) >= 0.85) {
            initial[et][item.source_value] = { pms_entity_id: item.candidates[0].id, action: 'use_existing' };
          } else {
            initial[et][item.source_value] = { pms_entity_id: null, action: 'create_new' };
          }
        }
      }
      setChoices(initial);

      setStage('resolution');
      fetchAuxiliary();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function saveResolutionsAndContinue() {
    if (!formatId || !resolution) return;
    setLoading(true); setError(null);
    try {
      const payload: any = { format_id: formatId, resolutions: {} };
      for (const et of Object.keys(choices) as EntityType[]) {
        payload.resolutions[et] = Object.entries(choices[et]).map(([sv, c]) => ({
          source_value: sv, pms_entity_id: c.pms_entity_id, action: c.action,
        }));
      }
      const res = await fetch('/api/finance/import/save-resolutions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Save failed'); setLoading(false); return; }
      alert(`✓ Збережено ${json.total_saved} resolutions. Stage 3 (row review + commit) — у PR #35.`);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  function backToUpload() {
    setStage('upload');
    setParsed(null);
    setMapping({});
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance" style={backLink}><ArrowLeft size={14} /></Link>
        <h1 style={{ margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSpreadsheet size={24} /> Import Wizard
        </h1>
      </div>

      <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
        Завантаж XLSX/CSV (Finmap, Booking, Airbnb, бух. звіт — будь-який формат).
        Wizard визначить колонки, дозволить тобі вибрати які саме поля з PMS вони відповідають,
        і збереже мапінг для повторного використання. Стейджі 2 (entity resolution) і 3 (row review)
        — будуть у наступних PR.
      </p>

      {/* STAGE INDICATOR */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 24 }}>
        <Stage n={1} label="Upload + Field mapping" active={stage === 'upload' || stage === 'mapping'} done={stage === 'resolution'} />
        <Stage n={2} label="Entity resolution" active={stage === 'resolution'} done={false} disabled={stage === 'upload'} />
        <Stage n={3} label="Row review + Commit" active={false} done={false} disabled />
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
          <b>Помилка:</b> {error}
        </div>
      )}

      {/* UPLOAD STAGE */}
      {stage === 'upload' && (
        <>
          <div style={{ padding: 24, border: '2px dashed var(--border-primary)', borderRadius: 12, textAlign: 'center', background: 'var(--bg-secondary)' }}>
            <Upload size={32} color="var(--text-secondary)" />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>Перетягни файл сюди або вибери</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>XLSX, XLS, CSV — до 20 MB</div>
            <input
              type="file" accept=".xlsx,.xls,.csv" disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              style={{ marginTop: 12 }}
            />
          </div>

          {/* Saved formats list */}
          <h3 style={{ marginTop: 32, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Save size={16} /> Збережені формати ({savedFormats.length})
          </h3>
          {savedFormats.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Поки немає. Завантаж файл — після мапінгу формат збережеться для повторного використання.</p>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={th}>Назва</th><th style={th}>Опис</th>
                  <th style={th}>Колонки змаплено</th>
                  <th style={th}>Оновлено</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {savedFormats.map((f) => (
                    <tr key={f.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{f.name}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 12 }}>{f.description || '—'}</td>
                      <td style={td}>{Object.keys(f.field_mappings).length}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>{f.updated_at}</td>
                      <td style={td}>
                        <button onClick={async () => {
                          if (!confirm(`Видалити формат "${f.name}"?`)) return;
                          await fetch(`/api/finance/import/formats/${f.id}`, { method: 'DELETE' });
                          fetchAuxiliary();
                        }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent runs */}
          {runs.length > 0 && (
            <details style={{ marginTop: 24 }}>
              <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <History size={14} /> Останні імпорти ({runs.length})
              </summary>
              <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Дата</th><th style={th}>Формат</th><th style={th}>Файл</th><th style={th}>Створено</th><th style={th}>Skipped</th><th style={th}>Dup</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={td}>{r.created_at?.substring(0, 16)}</td>
                      <td style={td}>{r.format_name || '—'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{r.file_name}</td>
                      <td style={td}>{r.rows_created}</td>
                      <td style={td}>{r.rows_skipped}</td>
                      <td style={td}>{r.rows_dup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      {/* MAPPING STAGE */}
      {stage === 'mapping' && parsed && (
        <>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b>Файл:</b> {parsed.file_name} · <b>Колонок:</b> {parsed.headers.length} · <b>Рядків:</b> {parsed.row_count}
              </div>
              <button onClick={backToUpload} style={btn}>← Назад до upload</button>
            </div>
            {parsed.matched_format && (
              <div style={{ marginTop: 6, color: '#16a34a' }}>
                ✓ Співпадає з збереженим форматом <b>{parsed.matched_format.name}</b> — пресети застосовані. Можеш скорегувати.
              </div>
            )}
            {!parsed.matched_format && (
              <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                Це новий формат. Wizard зробив guess по назвах колонок — перевір та збережи.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Назва формату (e.g. 'Finmap export v1')" value={formatName} onChange={(e) => setFormatName(e.target.value)} />
            <input style={{ ...input, flex: 2 }} placeholder="Опис (опц.)" value={formatDesc} onChange={(e) => setFormatDesc(e.target.value)} />
          </div>

          {/* Mapping table */}
          <h3 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>Мапінг колонок → PMS-полів</h3>
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={th}>#</th>
                  <th style={th}>Колонка з файлу</th>
                  <th style={th}>Приклад значення</th>
                  <th style={th}>→ PMS поле</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h, idx) => {
                  const sample = parsed.sample_rows[0]?.[idx];
                  const sampleStr = sample == null ? '—' : String(sample).substring(0, 60);
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{idx + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{h || <i style={{ color: 'var(--text-secondary)' }}>(empty)</i>}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{sampleStr}</td>
                      <td style={td}>
                        <select style={input} value={mapping[idx] || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMapping((m) => {
                                    const next = { ...m };
                                    if (v === '') delete next[idx];
                                    else next[idx] = v;
                                    return next;
                                  });
                                }}>
                          <option value="">— ігнорувати —</option>
                          {parsed.supported_fields.map((f) => (
                            <option key={f} value={f} disabled={Object.entries(mapping).some(([k, v]) => k !== String(idx) && v === f)}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={backToUpload} style={btn}>Скасувати</button>
            <button onClick={saveAndContinue} disabled={loading} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
              {loading ? 'Збереження…' : <>💾 Зберегти формат + далі <ArrowRight size={14} /></>}
            </button>
          </div>

          {/* Sample preview (first 5 rows of data using current mapping) */}
          <h3 style={{ fontSize: 14, marginTop: 32, marginBottom: 8 }}>Preview даних (перші 5 рядків з застосованим мапінгом)</h3>
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {Object.entries(mapping).map(([colIdx, field]) => (
                    <th key={colIdx} style={th}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{parsed.headers[Number(colIdx)]}</div>
                      <div style={{ color: '#3b82f6' }}>→ {field}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.sample_rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    {Object.keys(mapping).map((colIdx) => (
                      <td key={colIdx} style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>
                        {String(row[Number(colIdx)] ?? '—').substring(0, 50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* RESOLUTION STAGE (PR #34) */}
      {stage === 'resolution' && resolution && (
        <>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b>Stage 2:</b> підтверди маппінг унікальних значень з файлу до існуючих PMS entities.
                Auto-pre-filled: збережені рішення → exact matches → high-similarity ({'>'}85%) → інакше create_new.
              </div>
              <button onClick={() => setStage('mapping')} style={btn}>← Назад до field mapping</button>
            </div>
          </div>

          {(['account', 'category', 'project', 'counterparty'] as EntityType[]).map((et) => {
            const sec = resolution.resolutions[et];
            if (!sec || sec.source_values_count === 0) return null;
            const items = sec.items;

            // Stats
            const exact = items.filter((i) => choices[et][i.source_value]?.action === 'use_existing' && choices[et][i.source_value]?.pms_entity_id === i.exact_match?.id).length;
            const newCount = items.filter((i) => choices[et][i.source_value]?.action === 'create_new').length;
            const ignored = items.filter((i) => choices[et][i.source_value]?.action === 'ignore').length;

            return (
              <div key={et} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {ENTITY_LABELS[et]} <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>({items.length} унікальних)</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 12, fontWeight: 400 }}>
                    <span style={{ color: '#22c55e' }}><CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {exact} exact</span>
                    <span style={{ color: '#3b82f6' }}>+ {newCount} new</span>
                    {ignored > 0 && <span style={{ color: 'var(--text-secondary)' }}>{ignored} ignore</span>}
                  </span>
                </h3>
                <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={th}>Source value</th>
                        <th style={th}>Match</th>
                        <th style={th}>Дія</th>
                        <th style={th}>→ PMS entity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const ch = choices[et][item.source_value] || { pms_entity_id: null, action: 'create_new' as const };
                        const isExact = item.exact_match && ch.pms_entity_id === item.exact_match.id;
                        const isHighSim = item.candidates[0] && (item.candidates[0].similarity || 0) >= 0.85 && ch.pms_entity_id === item.candidates[0].id;
                        const matchLabel = isExact ? '✓ EXACT' : isHighSim ? `~${Math.round((item.candidates[0].similarity || 0) * 100)}%` : item.exact_match ? '✓ exact є' : item.candidates.length > 0 ? `~${Math.round((item.candidates[0].similarity || 0) * 100)}%` : '—';
                        return (
                          <tr key={item.source_value} style={{ borderTop: '1px solid var(--border-primary)' }}>
                            <td style={{ ...td, fontWeight: 600 }}>{item.source_value}</td>
                            <td style={{ ...td, color: isExact ? '#22c55e' : isHighSim ? '#3b82f6' : 'var(--text-secondary)', fontSize: 11 }}>{matchLabel}</td>
                            <td style={td}>
                              <select style={input} value={ch.action} onChange={(e) => {
                                const newAction = e.target.value as any;
                                setChoices((c) => ({
                                  ...c,
                                  [et]: { ...c[et], [item.source_value]: { ...ch, action: newAction, pms_entity_id: newAction === 'use_existing' ? (ch.pms_entity_id || item.candidates[0]?.id || null) : null } },
                                }));
                              }}>
                                <option value="use_existing">Use existing</option>
                                <option value="create_new">Create new</option>
                                <option value="ignore">Ignore</option>
                              </select>
                            </td>
                            <td style={td}>
                              {ch.action === 'use_existing' ? (
                                <select style={input} value={ch.pms_entity_id || ''} onChange={(e) => {
                                  setChoices((c) => ({
                                    ...c,
                                    [et]: { ...c[et], [item.source_value]: { ...ch, pms_entity_id: e.target.value || null } },
                                  }));
                                }}>
                                  <option value="">— вибери —</option>
                                  {item.candidates.map((cand) => (
                                    <option key={cand.id} value={cand.id}>
                                      {cand.name}{cand.meta ? ` (${cand.meta})` : ''}{cand.similarity ? ` · ${Math.round(cand.similarity * 100)}%` : ''}
                                    </option>
                                  ))}
                                  {item.candidates.length === 0 && <option disabled>— немає кандидатів —</option>}
                                </select>
                              ) : ch.action === 'create_new' ? (
                                <span style={{ color: '#3b82f6', fontStyle: 'italic' }}>Створити «{item.source_value}» при commit</span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Пропустити рядки з цим значенням</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setStage('mapping')} style={btn}>← Назад</button>
            <button onClick={saveResolutionsAndContinue} disabled={loading} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>
              {loading ? 'Збереження…' : <>💾 Зберегти resolutions <ArrowRight size={14} /></>}
            </button>
          </div>

          <div style={{ marginTop: 24, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <b>💡 Що далі:</b> Stage 3 (PR #35) — для кожного рядка покаже чи це новий запис, чи можливий дублікат існуючої fin_operation (по даті ±2д + сума ±0.01),
            щоб ти міг точково підтвердити або пропустити.
          </div>
        </>
      )}
    </div>
  );
}

function Stage({ n, label, active, done, disabled }: { n: number; label: string; active: boolean; done: boolean; disabled?: boolean }) {
  const color = done ? '#22c55e' : active ? '#3b82f6' : disabled ? 'var(--text-secondary)' : 'var(--text-secondary)';
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 8, background: active ? 'rgba(59,130,246,0.08)' : done ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)', borderLeft: `3px solid ${color}`, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Stage {n}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-primary)', textDecoration: 'none' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '6px 12px' };
