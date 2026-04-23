'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Globe, ArrowLeft, Loader2, Plus, Trash2, X, Copy, Check,
  LayoutList, Sparkles, Palette, Code2, Tag, CreditCard, Percent,
  ToggleRight, ToggleLeft, ChevronDown, ChevronUp, Save, Pencil, Eye, Image as ImageIcon, Upload,
} from 'lucide-react';
import BookingV3 from '@/app/booking/BookingV3';

/* ════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════ */
interface Site {
  id: string;
  name: string;
  slug: string;
  site_url?: string;
  type: string;
  currency: string;
  status: string;
  design_config: DesignConfig;
  widget_config: WidgetConfig;
  payment_config: PaymentConfig;
}
interface PaymentConfig {
  provider?: 'teya' | 'stripe' | 'manual';
  enabled?: boolean;
  teya?: {
    client_id?: string;
    client_secret?: string;
    store_id?: string;
  };
}
interface DesignConfig {
  theme?: string;
  primary_color?: string;
  button_style?: string;
  show_shadow?: boolean;
  logo_url?: string | null;
  favicon_url?: string | null;
}
interface WidgetConfig {
  search_result_url?: string;
  enable_prefill?: boolean;
  default_lang?: string;
}
interface Listing { id: string; unit_id?: string; unit_type_id?: string; unit_name?: string; unit_code?: string; unit_type_name?: string; unit_type_code?: string; unit_type_photos?: string; photos?: string; actual_unit_type_id?: string; price_override?: number; external_url?: string; thank_you_url?: string; default_lang?: string; sort_order: number; created_at: string; }
interface SiteService { id: string; name: string; icon: string; service_type: string; price: number; currency: string; is_enabled: number; price_override?: number; site_service_id?: string; }
interface RatePlan { id: string; name: string; is_default: number; cancellation_policy: string; payment_schedule: {percent:number;trigger:string}[]; meals_included: string[]; min_stay: number; max_stay: number; min_days_before_checkin: number; pricing_mode: string; applied_listings: string[]; }

const TABS = [
  { id: 'listings',     label: 'Оголошення',      icon: <LayoutList size={16} /> },
  { id: 'services',     label: 'Сервіси',          icon: <Sparkles size={16} /> },
  { id: 'design',       label: 'Дизайн',           icon: <Palette size={16} /> },
  { id: 'widget',       label: 'Віджет пошуку',    icon: <Code2 size={16} /> },
  { id: 'rate-plans',   label: 'Тарифні плани',    icon: <Tag size={16} /> },
  { id: 'payments',     label: 'Платежі',          icon: <CreditCard size={16} /> },
  { id: 'promo-codes',  label: 'Промокоди',        icon: <Percent size={16} /> },
];

const CANCEL_LABELS: Record<string,string> = {
  non_refundable: '❌ Без повернення',
  full_refund:    '✅ Повне повернення',
  flexible:       '⚡ Гнучке',
};
const THEME_CONFIGS: Record<string,{color:string;bg:string;card:string;text:string;sub:string;border:string}> = {
  Classical: { color:'#8B6914', bg:'#fdf8f0', card:'#fff8ec', text:'#2d1f0a', sub:'#8b7355', border:'#e8d5b0' },
  Modern:    { color:'#2563eb', bg:'#f8faff', card:'#ffffff', text:'#0f172a', sub:'#64748b', border:'#e2e8f0' },
  Minimal:   { color:'#374151', bg:'#ffffff', card:'#f9fafb', text:'#111827', sub:'#9ca3af', border:'#f3f4f6' },
  Nature:    { color:'#16a34a', bg:'#f0fdf4', card:'#dcfce7', text:'#14532d', sub:'#4ade80', border:'#bbf7d0' },
  Luxury:    { color:'#d4af37', bg:'#0d0d1a', card:'#1a1628', text:'#f5efe6', sub:'#c9a84c', border:'#2d2540' },
  Ocean:     { color:'#0891b2', bg:'#ecfeff', card:'#cffafe', text:'#164e63', sub:'#0e7490', border:'#a5f3fc' },
  Sunset:    { color:'#ea580c', bg:'#fff7ed', card:'#ffedd5', text:'#431407', sub:'#c2410c', border:'#fed7aa' },
  Nordic:    { color:'#4f81bd', bg:'#f2f6fb', card:'#ffffff', text:'#1e3a5f', sub:'#7a9bbf', border:'#c8daf0' },
  Dark:      { color:'#22d3ee', bg:'#0f172a', card:'#1e293b', text:'#f1f5f9', sub:'#94a3b8', border:'#334155' },
};
const THEMES = Object.keys(THEME_CONFIGS);
const BUTTON_STYLES = [
  { value:'rounded_filled',  label:'Rounded Filled' },
  { value:'rounded_outline', label:'Rounded Outline' },
  { value:'sharp_filled',    label:'Sharp Filled' },
  { value:'sharp_outline',   label:'Sharp Outline' },
  { value:'pill_filled',     label:'Pill Filled' },
  { value:'pill_outline',    label:'Pill Outline' },
];

/* ════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════ */
function Modal({ open, onClose, title, children, footer, size }: {
  open:boolean; onClose:()=>void; title:string; children:React.ReactNode; footer?:React.ReactNode; size?:'lg'|'xl';
}) {
  if (!open) return null;
  const w = size==='xl' ? 900 : size==='lg' ? 640 : 480;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: w, width: '95vw' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <button className="btn btn-ghost" onClick={copy} style={{ padding:'4px 10px', fontSize:12 }}>
      {copied ? <Check size={14} style={{color:'#22c55e'}}/> : <Copy size={14}/>}
      {copied ? 'Скопійовано' : 'Копіювати'}
    </button>
  );
}

/* ── Check indicator ── */
const Chk = ({ val }: { val?: string | null }) =>
  val ? <span style={{color:'#22c55e',fontSize:16}}>✓</span> : <span style={{color:'var(--text-tertiary)',fontSize:14}}>—</span>;

/* ── ListingRow: click → edit modal ── */
function ListingRow({ listing, siteId, siteSlug, onDelete, onRefresh, onEdit, onEmbed }: {
  listing: Listing;
  siteId: string;
  siteSlug: string;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onEdit: (l: Listing) => void;
}) {
  const unitName = listing.unit_name || listing.unit_type_name || listing.id;
  return (
    <tr style={{cursor:'pointer'}} onClick={() => onEdit(listing)}>
      <td>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{
            width:40, height:40, borderRadius:8, overflow:'hidden', 
            background:'var(--surface-secondary)', border:'1px solid var(--border-primary)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}>
            {listing.photos || listing.unit_type_photos ? (
              <img 
                src={(listing.photos || listing.unit_type_photos || '').split(',')[0]} 
                alt="" 
                style={{width:'100%',height:'100%',objectFit:'cover'}} 
              />
            ) : (
              <ImageIcon size={18} style={{color:'var(--text-tertiary)',opacity:0.5}} />
            )}
          </div>
          <div style={{fontWeight:600}}>{unitName}</div>
        </div>
      </td>
      <td style={{fontSize:12,color:'var(--text-secondary)'}}>{listing.unit_id ? 'Юніт' : 'Тип юніту'}</td>
      <td style={{fontSize:13}}>{listing.price_override ? `${listing.price_override} CZK` : 'За прайсом'}</td>
      <td style={{textAlign:'center'}}><Chk val={listing.external_url}/></td>
      <td style={{textAlign:'center'}}><Chk val={listing.thank_you_url}/></td>
      <td style={{textAlign:'right'}} onClick={e => e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'flex-end',gap:4}}>
          <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}}
            onClick={() => onDelete(listing.id)}>
            <Trash2 size={14}/>
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Edit Modal Component ── */
function ListingEditModal({ listing, siteId, siteSlug, open, onClose, onRefresh }: {
  listing: Listing | null;
  siteId: string;
  siteSlug: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    external_url: '',
    thank_you_url: '',
    default_lang: '',
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [embedLang, setEmbedLang] = useState('uk');
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    if (listing) {
      setForm({
        external_url:  listing.external_url  || '',
        thank_you_url: listing.thank_you_url || '',
        default_lang:  listing.default_lang  || '',
      });
      const photoStr = listing.photos || listing.unit_type_photos || '';
      setPhotoUrls(photoStr ? photoStr.split(',').map(s=>s.trim()).filter(Boolean) : []);
    }
  }, [listing]);

  if (!listing) return null;

  const save = async () => {
    setSaving(true);
    // Update listing settings
    await fetch(`/api/booking-sites/${siteId}/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_url:  form.external_url.trim()  || null,
        thank_you_url: form.thank_you_url.trim() || null,
        default_lang:  form.default_lang  || null,
        photos: photoUrls.length > 0 ? photoUrls.join(',') : null,
      }),
    });

    // Update unit type photos
    if (listing.actual_unit_type_id) {
      await fetch(`/api/unit-types/${listing.actual_unit_type_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoUrls.join(',') }),
      });
    }

    setSaving(false);
    onClose();
    onRefresh();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('unit_type_id', listing.actual_unit_type_id!);
      
      const res = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (res.ok && data.url) {
        setPhotoUrls(prev => [...prev, data.url]);
      } else {
        throw new Error(data.error || `Помилка завантаження (${res.status})`);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Помилка завантаження. Спробуйте інше фото.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const LANGS = ['uk','cs','en','de'];
  const unitName = listing.unit_name || listing.unit_type_name || listing.id;

  return (
    <Modal open={open} onClose={onClose} title={unitName} size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin"/> : <Check size={14}/>} Зберегти
          </button>
        </>
      }>
      <div className="form-group">
        <label className="form-label">URL сторінки об&apos;єкта</label>
        <input className="form-input" placeholder="https://yoursite.com/cabin-b3"
          value={form.external_url} onChange={e => setForm(f => ({...f, external_url: e.target.value}))} />
      </div>
      <div className="form-group">
        <label className="form-label">URL сторінки подяки</label>
        <input className="form-input" placeholder="https://yoursite.com/thank-you"
          value={form.thank_you_url} onChange={e => setForm(f => ({...f, thank_you_url: e.target.value}))} />
      </div>
      <div className="form-group">
        <label className="form-label">Мова за замовчуванням</label>
        <div style={{display:'flex',gap:6}}>
          {LANGS.map(l => (
            <button key={l} type="button" onClick={() => setForm(f => ({...f, default_lang: f.default_lang === l ? '' : l}))}
              style={{
                padding:'6px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
                border:`2px solid ${form.default_lang===l?'var(--accent-primary)':'var(--border-primary)'}`,
                background:form.default_lang===l?'var(--accent-primary)':'var(--surface-secondary)',
                color:form.default_lang===l?'#fff':'var(--text-secondary)', transition:'all .15s',
              }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group" style={{marginTop:24}}>
        <label className="form-label" style={{display:'flex', alignItems:'center', gap:8}}>
          <ImageIcon size={16} /> Фотографії об&apos;єкта
        </label>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:12, marginTop:12}}>
          {photoUrls.map((url, idx) => (
            <div key={idx} style={{position:'relative', aspectRatio:'4/3', borderRadius:8, overflow:'hidden', border:'1px solid var(--border-primary)'}}>
              <img src={url} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} />
              <button onClick={() => removePhoto(idx)} style={{position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', cursor:'pointer', borderRadius:'50%', width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <X size={12} />
              </button>
            </div>
          ))}
          <label style={{aspectRatio:'4/3', border:'2px dashed var(--border-primary)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:4, color:'var(--text-secondary)'}}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            <span style={{fontSize:11}}>{uploading ? '...' : 'Завантажити'}</span>
            <input type="file" accept="image/*" hidden onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div style={{marginTop:32, borderTop:'1px solid var(--border-primary)', paddingTop:24}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
          <Code2 size={18} style={{color:'var(--accent-primary)'}} />
          <h4 style={{margin:0, fontSize:15, fontWeight:700}}>Код для вставки (Embed)</h4>
        </div>
        <div style={{fontSize:13, color:'var(--text-secondary)', marginBottom:16}}>
          Використовуйте цей код, щоб додати віджет бронювання саме для цього об&apos;єкта на ваш сайт.
        </div>
        
        <div style={{marginBottom:12}}>
          <div style={{display:'flex', gap:6}}>
            {LANGS.map(l => (
              <button key={l} type="button" onClick={() => setEmbedLang(l)}
                style={{
                  padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                  border:`2px solid ${embedLang===l?'var(--accent-primary)':'var(--border-primary)'}`,
                  background:embedLang===l?'var(--accent-primary)':'var(--surface-secondary)',
                  color:embedLang===l?'#fff':'var(--text-secondary)',
                }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{position:'relative'}}>
          <pre style={{
            background:'var(--surface-secondary)', borderRadius:8, padding:16, 
            fontSize:12, overflowX:'auto', fontFamily:'monospace', lineWeight:1.5,
            border:'1px solid var(--border-primary)'
          }}>
{`<div id="alisio-booking-widget"
  data-site="${siteSlug}"
  data-unit="${listing.unit_id || listing.unit_type_id}"
  data-lang="${embedLang}">
</div>
<script src="${origin || 'https://alisio.swipescape.eu'}/widget/embed.v2.js"></script>`}
          </pre>
          <div style={{position:'absolute', top:8, right:8}}>
            <CopyBtn text={`<div id="alisio-booking-widget" data-site="${siteSlug}" data-unit="${listing.unit_id || listing.unit_type_id}" data-lang="${embedLang}"></div><script src="${origin || 'https://alisio.swipescape.eu'}/widget/embed.v2.js"></script>`}/>
          </div>
        </div>
      </div>
    </Modal>
  );
}





/* ════════════════════════════════════════════════
   TAB: LISTINGS
   ════════════════════════════════════════════════ */
function ListingsTab({ siteId, siteSlug }: { siteId: string, siteSlug: string }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [embedListing, setEmbedListing] = useState<Listing | null>(null);

  /* unit picker data */
  const [unitTypes, setUnitTypes] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [activeUt, setActiveUt] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState<'unit'|'unit_type'>('unit');
  const [adding, setAdding] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/listings`);
    const d = await res.json();
    if (Array.isArray(d.listings)) setListings(d.listings);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => {
    if (!showAdd) return;
    Promise.all([
      fetch('/api/unit-types').then(r=>r.json()),
      fetch('/api/units').then(r=>r.json()),
    ]).then(([uts, us]) => {
      if (Array.isArray(uts)) { setUnitTypes(uts); setActiveUt(uts[0]?.id||''); }
      if (Array.isArray(us)) setUnits(us);
    });
  }, [showAdd]);

  const unitsByType = units.filter(u => u.unit_type_id === activeUt);

  const handleAdd = async () => {
    if (!selected.size) return;
    setAdding(true);
    const batch = Array.from(selected).map(id =>
      addMode === 'unit' ? { unit_id: id } : { unit_type_id: id }
    );
    await fetch(`/api/booking-sites/${siteId}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    setAdding(false);
    setShowAdd(false);
    setSelected(new Set());
    fetchListings();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити оголошення?')) return;
    await fetch(`/api/booking-sites/${siteId}/listings/${id}`, { method:'DELETE' });
    fetchListings();
  };

  if (loading) return <div style={{padding:40,textAlign:'center'}}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      <div className="table-toolbar" style={{marginBottom:12}}>
        <div style={{fontSize:14,color:'var(--text-secondary)'}}>{listings.length} оголошень</div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Додати оголошення</button>
      </div>

      {listings.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
          <LayoutList size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
          <div>Додайте юніти або типи, які будуть доступні на цьому сайті</div>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr>
            <th>Назва</th>
            <th>Тип</th>
            <th>Ціна</th>
            <th style={{textAlign:'center'}}>URL сторінки</th>
            <th style={{textAlign:'center'}}>URL подяки</th>
            <th></th>
          </tr></thead>
          <tbody>
            {listings.map(l => (
              <ListingRow key={l.id} listing={l} siteId={siteId} siteSlug={siteSlug} onDelete={handleDelete} onRefresh={fetchListings} onEdit={setEditingListing} />
            ))}
          </tbody>
        </table>
      )}

      {/* Edit Modal */}
      <ListingEditModal open={!!editingListing} listing={editingListing} siteId={siteId} siteSlug={siteSlug} onClose={() => setEditingListing(null)} onRefresh={fetchListings} />

      {/* Add Modal */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Додати оголошення" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding||!selected.size}>
              {adding ? <Loader2 size={14} className="spin"/> : <Plus size={14}/>}
              Додати вибране ({selected.size})
            </button>
          </>
        }
      >
        {/* Mode toggle */}
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {(['unit','unit_type'] as const).map(m => (
            <button key={m} className={`btn ${addMode===m?'btn-primary':'btn-ghost'}`} onClick={()=>{setAddMode(m);setSelected(new Set());}}>
              {m==='unit' ? '🏠 Конкретні юніти' : '📦 Типи юнітів'}
            </button>
          ))}
        </div>

        {addMode === 'unit' && (
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16,minHeight:300}}>
            {/* Left: unit types */}
            <div style={{borderRight:'1px solid var(--border-primary)',paddingRight:16}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>ТИП ЮНІТУ</div>
              {unitTypes.map(ut => (
                <div key={ut.id} onClick={()=>setActiveUt(ut.id)}
                  style={{padding:'8px 10px',borderRadius:6,cursor:'pointer',fontWeight:activeUt===ut.id?600:400,
                    background:activeUt===ut.id?'var(--accent-primary-dim)':'transparent',
                    color:activeUt===ut.id?'var(--accent-primary)':'var(--text-primary)',fontSize:13}}>
                  {ut.name}
                </div>
              ))}
            </div>
            {/* Right: units */}
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>ЮНІТИ</div>
              {unitsByType.length === 0 && <div style={{fontSize:13,color:'var(--text-secondary)'}}>Немає юнітів</div>}
              {unitsByType.map(u => {
                const chk = selected.has(u.id);
                const alreadyAdded = listings.some(l => l.unit_id === u.id);
                return (
                  <label key={u.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 4px',cursor:alreadyAdded?'not-allowed':'pointer',opacity:alreadyAdded?0.5:1}}>
                    <input type="checkbox" checked={chk} disabled={alreadyAdded}
                      onChange={() => { const s=new Set(selected); chk?s.delete(u.id):s.add(u.id); setSelected(s); }} />
                    <span style={{fontSize:13}}>{u.name} <span style={{color:'var(--text-tertiary)'}}>({u.code})</span></span>
                    {alreadyAdded && <span style={{fontSize:11,color:'var(--accent-primary)'}}>вже додано</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {addMode === 'unit_type' && (
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>ТИПИ ЮНІТІВ</div>
            {unitTypes.map(ut => {
              const chk = selected.has(ut.id);
              const alreadyAdded = listings.some(l => l.unit_type_id === ut.id);
              return (
                <label key={ut.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 4px',cursor:alreadyAdded?'not-allowed':'pointer',opacity:alreadyAdded?0.5:1}}>
                  <input type="checkbox" checked={chk} disabled={alreadyAdded}
                    onChange={() => { const s=new Set(selected); chk?s.delete(ut.id):s.add(ut.id); setSelected(s); }} />
                  <span style={{fontSize:13,fontWeight:500}}>{ut.name}</span>
                  {alreadyAdded && <span style={{fontSize:11,color:'var(--accent-primary)'}}>вже додано</span>}
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB: SERVICES
   ════════════════════════════════════════════════ */
function ServicesTab({ siteId }: { siteId: string }) {
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/services`);
    const d = await res.json();
    if (Array.isArray(d.services)) setServices(d.services);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const toggle = async (svc: SiteService) => {
    await fetch(`/api/booking-sites/${siteId}/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: svc.id, is_enabled: !svc.is_enabled }),
    });
    fetchServices();
  };

  /* embed code */
  const embedCode = (svcId: string) =>
    `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget/service-embed.js"\n  data-service="${svcId}"\n  data-site="${siteId}">\n</script>`;

  const [embedSvc, setEmbedSvc] = useState<SiteService | null>(null);

  if (loading) return <div style={{padding:40,textAlign:'center'}}><Loader2 size={24} className="spin"/></div>;

  return (
    <div>
      <div style={{marginBottom:16,fontSize:13,color:'var(--text-secondary)'}}>
        Оберіть сервіси, що доступні для замовлення на цьому сайті.
      </div>
      <table className="data-table">
        <thead><tr><th>Сервіс</th><th>Ціна</th><th>Активний</th><th>Embed-код</th></tr></thead>
        <tbody>
          {services.map(svc => (
            <tr key={svc.id}>
              <td>
                <span style={{fontSize:18,marginRight:8}}>{svc.icon}</span>
                <span style={{fontWeight:500}}>{svc.name}</span>
              </td>
              <td style={{fontSize:13}}>{svc.price_override ?? svc.price} {svc.currency}</td>
              <td>
                <button className="btn btn-ghost" style={{padding:'4px 6px'}} onClick={()=>toggle(svc)}>
                  {svc.is_enabled
                    ? <ToggleRight size={22} style={{color:'#22c55e'}}/>
                    : <ToggleLeft size={22} style={{color:'var(--text-tertiary)'}}/>}
                </button>
              </td>
              <td>
                <button className="btn btn-ghost" style={{fontSize:12,padding:'4px 8px'}} onClick={()=>setEmbedSvc(svc)}>
                  <Code2 size={13}/> Код
                </button>
              </td>
            </tr>
          ))}
          {services.length===0 && <tr><td colSpan={4} style={{textAlign:'center',color:'var(--text-secondary)'}}>Немає сервісів. Додайте їх у Налаштування → Послуги.</td></tr>}
        </tbody>
      </table>

      {/* Embed modal */}
      <Modal open={!!embedSvc} onClose={()=>setEmbedSvc(null)} title={`Embed-код: ${embedSvc?.name}`} size="lg">
        <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>
          Вставте цей код на ваш сайт для відображення кнопки замовлення сервісу.
        </div>
        <div style={{position:'relative'}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:16,fontSize:12,overflowX:'auto',margin:0}}>
            {embedSvc ? embedCode(embedSvc.id) : ''}
          </pre>
          <div style={{position:'absolute',top:8,right:8}}>
            <CopyBtn text={embedSvc ? embedCode(embedSvc.id) : ''} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB: DESIGN
   ════════════════════════════════════════════════ */
function DesignTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: DesignConfig) => void }) {
  const [cfg, setCfg] = useState<DesignConfig>(site.design_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  // Use theme palette for preview
  const themeCfg = THEME_CONFIGS[cfg.theme || 'Classical'] || THEME_CONFIGS['Classical'];
  const color       = cfg.primary_color || themeCfg.color;
  const previewBg   = themeCfg.bg;
  const previewText = themeCfg.text;
  const previewSub  = themeCfg.sub;
  const previewCard = themeCfg.card;
  const previewBorder = themeCfg.border;

  const btnRadius = cfg.button_style?.includes('pill') ? 99
    : cfg.button_style?.includes('rounded') ? 10 : 2;
  const btnBg = cfg.button_style?.includes('outline') ? 'transparent' : color;
  const btnColor = cfg.button_style?.includes('outline') ? color : '#fff';
  const btnBorder = cfg.button_style?.includes('outline') ? `2px solid ${color}` : 'none';
  const shadow = cfg.show_shadow ? '0 8px 32px rgba(0,0,0,0.12)' : 'none';

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

      {/* ── Settings column ── */}
      <div style={{ flex: '0 0 400px', minWidth: 0 }}>
        {/* Themes */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.05em'}}>Тема</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
            {THEMES.map(t => (
              <button key={t} onClick={()=>setCfg(c=>({...c, theme:t, primary_color: THEME_CONFIGS[t].color }))}
                style={{padding:'10px 8px',borderRadius:8,fontSize:12,fontWeight:cfg.theme===t?700:400,
                  border:`2px solid ${cfg.theme===t?'var(--accent-primary)':'var(--border-primary)'}`,
                  background:cfg.theme===t?'var(--accent-primary-dim)':'var(--surface-secondary)',
                  cursor:'pointer',color:'var(--text-primary)',transition:'all .15s',
                  borderLeft:`4px solid ${THEME_CONFIGS[t].color}`}}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Primary color */}
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Основний колір</div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <input type="color" value={cfg.primary_color||'#A2845E'} onChange={e=>setCfg(c=>({...c,primary_color:e.target.value}))}
                style={{width:44,height:44,border:'none',borderRadius:8,cursor:'pointer',padding:2}} />
              <input className="form-input" value={cfg.primary_color||'#A2845E'}
                onChange={e=>setCfg(c=>({...c,primary_color:e.target.value}))}
                style={{width:120,fontFamily:'monospace',fontSize:13}} />
            </div>
          </div>
        </div>

        {/* Button style */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.05em'}}>Стиль кнопок та елементів</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {BUTTON_STYLES.map(bs => {
              const isPill = bs.value.includes('pill');
              const isSharp = bs.value.includes('sharp');
              const isOutline = bs.value.includes('outline');
              return (
                <button key={bs.value} onClick={()=>setCfg(c=>({...c,button_style:bs.value}))}
                  style={{
                    padding:'12px', borderRadius:12, textAlign:'left',
                    fontSize:12, border:`2px solid ${cfg.button_style===bs.value?'var(--accent-primary)':'var(--border-primary)'}`,
                    background:cfg.button_style===bs.value?'var(--accent-primary-dim)':'var(--surface-secondary)',
                    cursor:'pointer', color:'var(--text-primary)', transition:'all .15s'
                  }}>
                  <div style={{fontSize:11,fontWeight:600,marginBottom:8,color:cfg.button_style===bs.value?'var(--accent-primary)':'var(--text-secondary)'}}>{bs.label}</div>
                  <div style={{
                    height:32, width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius: isPill ? 16 : isSharp ? 0 : 6,
                    background: isOutline ? 'transparent' : (cfg.primary_color || '#A2845E'),
                    color: isOutline ? (cfg.primary_color || '#A2845E') : '#fff',
                    border: isOutline ? `1.5px solid ${cfg.primary_color || '#A2845E'}` : 'none',
                    fontSize:11, fontWeight:700
                  }}>
                    Кнопка
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Shadow */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <input type="checkbox" checked={!!cfg.show_shadow} onChange={e=>setCfg(c=>({...c,show_shadow:e.target.checked}))} />
            <span style={{fontSize:13}}>Показувати тінь (shadow)</span>
          </label>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin"/> : saved ? <Check size={16}/> : <Save size={16}/>}
          {saved ? 'Збережено!' : 'Зберегти дизайн'}
        </button>
      </div>

      {/* ── Live preview column ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
            Мобільний вигляд (Smartphone)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} /> Попередній перегляд
          </div>
        </div>
        
        {/* Smartphone Frame Mockup */}
        <div style={{ 
          width: 340, margin: '0 auto', 
          border: '14px solid #1a1a1a', borderRadius: 50, 
          boxShadow: '0 30px 60px rgba(0,0,0,0.3)', 
          background: '#000', position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Speaker/Camera notch */}
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 140, height: 28, background: '#1a1a1a', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, zIndex: 10 }} />
          
          <div style={{ height: 680, background: 'var(--bg-primary)', overflow: 'hidden', position: 'relative' }}>
            <div style={{ 
              height: '100%', overflowY: 'auto', overflowX: 'hidden',
              scrollbarWidth: 'none'
            }}>
              <BookingV3 
                siteSlug={site.slug} 
                isPreview={true}
                design={{
                  theme: cfg.theme,
                  primary_color: cfg.primary_color,
                  button_style: cfg.button_style,
                  show_shadow: cfg.show_shadow
                }}
              />
            </div>
          </div>
          
          {/* Home indicator */}
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: 100, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 20, textAlign: 'center', background: 'var(--surface-secondary)', padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
          💡 Ваш віджет повністю адаптований під мобільні пристрої. Ви можете протестувати всі кроки прямо в цьому вікні.
        </div>
      </div>

    </div>
  );
}


/* ════════════════════════════════════════════════
   TAB: WIDGET
   ════════════════════════════════════════════════ */
function WidgetTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: WidgetConfig) => void }) {
  const [cfg, setCfg] = useState<WidgetConfig>(site.widget_config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const lang = cfg.default_lang || 'uk';

  const widgetUrl = site.site_url || origin || 'https://YOUR_DOMAIN';
  
  const scriptTag = `<div id="alisio-booking-widget" data-site="${site.slug}"></div>
<script src="${origin || 'https://YOUR_PMS_DOMAIN'}/widget/embed.v2.js"></script>`;

  const iframeEmbed = `<iframe
  src="${origin || 'https://YOUR_PMS_DOMAIN'}/booking?site=${site.slug}&lang=${lang}"
  width="100%" height="600"
  frameborder="0" allowfullscreen>
</iframe>`;

  // Dynamic locale injection example
  const dynamicLocaleSnippet = `<!-- Передайте мову сайту у віджет динамічно -->
<script>
  window.__BOOKING_LANG__ = document.documentElement.lang || '${lang}';
</script>
<div id="alisio-booking-widget" data-site="${site.slug}" data-lang-from="window.__BOOKING_LANG__"></div>
<script src="${origin || 'https://YOUR_PMS_DOMAIN'}/widget/embed.v2.js"></script>`;

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
        <div style={{ width:28,height:28,borderRadius:'50%',background:'var(--accent-primary)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0 }}>{n}</div>
        <div style={{ fontSize:14,fontWeight:600 }}>{title}</div>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 740 }}>
      <Step n={1} title="Налаштуйте URL результатів">
        <div style={{marginBottom:8,fontSize:13,color:'var(--text-secondary)'}}>Сторінка вашого сайту, на яку будуть потрапляти гості після вибору дат:</div>
        <input className="form-input" placeholder="https://yoursite.com/booking" value={cfg.search_result_url||''} onChange={e=>setCfg(c=>({...c,search_result_url:e.target.value}))} />
        <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,cursor:'pointer'}}>
          <input type="checkbox" checked={!!cfg.enable_prefill} onChange={e=>setCfg(c=>({...c,enable_prefill:e.target.checked}))} />
          <span style={{fontSize:13}}>Автоматично підставляти дати в URL (prefill)</span>
        </label>
      </Step>

      <Step n={2} title="Мова віджета за замовчуванням">
        <div style={{marginBottom:10,fontSize:13,color:'var(--text-secondary)'}}>
          Ця мова буде використана якщо сторінка не передає локаль.
        </div>
        <div style={{display:'flex',gap:8}}>
          {(['uk','cs','en','de'] as const).map(l => (
            <button key={l} type="button"
              onClick={() => setCfg(c => ({...c, default_lang: l}))}
              style={{
                padding:'6px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
                border:`2px solid ${lang===l?'var(--accent-primary)':'var(--border-primary)'}`,
                background:lang===l?'var(--accent-primary)':'var(--surface-secondary)',
                color:lang===l?'#fff':'var(--text-secondary)', transition:'all .15s',
              }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{marginTop:12,fontSize:12,color:'var(--text-tertiary)',lineHeight:1.6}}>
          Щоб передати локаль з батьківського сайту динамічно, вставте перед тегом скрипта:
        </div>
        <div style={{position:'relative',marginTop:6}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:12,fontSize:11,overflowX:'auto',margin:0}}>
{`<script>
  window.__BOOKING_LANG__ = document.documentElement.lang || '${lang}';
</script>`}
          </pre>
          <div style={{position:'absolute',top:8,right:8}}>
            <CopyBtn text={`<script>\n  window.__BOOKING_LANG__ = document.documentElement.lang || '${lang}';\n</script>`}/>
          </div>
        </div>
      </Step>

      <Step n={3} title="Вставте JS-тег на ваш сайт">
        <div style={{position:'relative'}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:16,fontSize:12,overflowX:'auto',margin:0}}>{scriptTag}</pre>
          <div style={{position:'absolute',top:8,right:8}}><CopyBtn text={scriptTag}/></div>
        </div>
      </Step>

      <Step n={4} title="Або використайте iframe (альтернатива)">
        <div style={{position:'relative'}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:16,fontSize:12,overflowX:'auto',margin:0}}>{iframeEmbed}</pre>
          <div style={{position:'absolute',top:8,right:8}}><CopyBtn text={iframeEmbed}/></div>
        </div>
      </Step>

      <Step n={5} title="Перевірте встановлення">
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>
          Відкрийте ваш сайт і переконайтесь що кнопка/форма бронювання відображається. Бронювання буде прив'язане до сайту <strong>{site.name}</strong>.
        </div>
      </Step>

      <Step n={6} title="Системні налаштування">
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Slug (ідентифікатор для вбудовування)</label>
          <input className="form-input" value={site.slug || ''} readOnly style={{ background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Використовується в data-site attribute</div>
        </div>

        <div className="form-group">
          <label className="form-label">URL вашого сайту (де вбудовано віджет)</label>
          <input className="form-input" placeholder="https://book.kemp-carlsbad.cz"
            value={site.site_url || ''}
            onChange={e => onUpdate({ ...site, site_url: e.target.value } as any)} />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Допомагає правильно генерувати посилання на бронювання</div>
        </div>
      </Step>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
        {saved ? 'Збережено!' : 'Зберегти налаштування'}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB: RATE PLANS
   ════════════════════════════════════════════════ */
function RatePlansTab({ siteId }: { siteId: string }) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:'', cancellation_policy:'non_refundable', min_stay:1, max_stay:999, min_days_before_checkin:0, pricing_mode:'independent', is_default:false });
  const [creating, setCreating] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/booking-sites/${siteId}/rate-plans`);
    const d = await res.json();
    if (Array.isArray(d.plans)) setPlans(d.plans);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleCreate = async () => {
    if (!form.name.trim()) { alert('Введіть назву тарифу'); return; }
    setCreating(true);
    await fetch(`/api/booking-sites/${siteId}/rate-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, is_default: form.is_default ? 1 : 0 }),
    });
    setCreating(false);
    setShowCreate(false);
    setForm({ name:'', cancellation_policy:'non_refundable', min_stay:1, max_stay:999, min_days_before_checkin:0, pricing_mode:'independent', is_default:false });
    fetchPlans();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити тариф?')) return;
    await fetch(`/api/booking-sites/${siteId}/rate-plans/${id}`, { method:'DELETE' });
    fetchPlans();
  };

  if (loading) return <div style={{padding:40,textAlign:'center'}}><Loader2 size={24} className="spin"/></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div style={{fontSize:14,color:'var(--text-secondary)'}}>{plans.length} тарифів</div>
        <button className="btn btn-primary" onClick={()=>setShowCreate(true)}><Plus size={16}/> Новий тариф</button>
      </div>

      {plans.length===0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
          <Tag size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
          <div>Тарифних планів ще немає</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {plans.map(plan => (
            <div key={plan.id} style={{border:'1px solid var(--border-primary)',borderRadius:10,overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',padding:'12px 16px',cursor:'pointer',background:'var(--surface-secondary)'}}
                onClick={() => setExpanded(expanded===plan.id ? null : plan.id)}>
                <div style={{flex:1}}>
                  <span style={{fontWeight:600,marginRight:8}}>{plan.name}</span>
                  {plan.is_default===1 && <span style={{fontSize:11,background:'var(--accent-primary)',color:'#fff',padding:'2px 8px',borderRadius:99,marginRight:8}}>За замовч.</span>}
                  <span style={{fontSize:12,color:'var(--text-secondary)'}}>{CANCEL_LABELS[plan.cancellation_policy]}</span>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={e=>{e.stopPropagation();handleDelete(plan.id);}}>
                    <Trash2 size={14}/>
                  </button>
                  {expanded===plan.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </div>
              </div>
              {expanded===plan.id && (
                <div style={{padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
                  <div><span style={{color:'var(--text-secondary)'}}>Мін. ночей:</span> <strong>{plan.min_stay}</strong></div>
                  <div><span style={{color:'var(--text-secondary)'}}>Макс. ночей:</span> <strong>{plan.max_stay}</strong></div>
                  <div><span style={{color:'var(--text-secondary)'}}>Днів до заїзду:</span> <strong>{plan.min_days_before_checkin}</strong></div>
                  <div><span style={{color:'var(--text-secondary)'}}>Ціноутворення:</span> <strong>{plan.pricing_mode}</strong></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Новий тарифний план"
        footer={<>
          <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin"/> : <Plus size={14}/>} Створити
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Назва *</label>
          <input className="form-input" placeholder="Базовий тариф" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Політика скасування</label>
          <select className="form-select" value={form.cancellation_policy} onChange={e=>setForm(f=>({...f,cancellation_policy:e.target.value}))}>
            <option value="non_refundable">❌ Без повернення</option>
            <option value="full_refund">✅ Повне повернення</option>
            <option value="flexible">⚡ Гнучке</option>
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" min={1} value={form.min_stay} onChange={e=>setForm(f=>({...f,min_stay:+e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Макс. ночей</label>
            <input className="form-input" type="number" min={1} value={form.max_stay} onChange={e=>setForm(f=>({...f,max_stay:+e.target.value}))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Мін. днів до заїзду</label>
          <input className="form-input" type="number" min={0} value={form.min_days_before_checkin} onChange={e=>setForm(f=>({...f,min_days_before_checkin:+e.target.value}))} />
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginTop:8}}>
          <input type="checkbox" checked={form.is_default} onChange={e=>setForm(f=>({...f,is_default:e.target.checked}))} />
          <span style={{fontSize:13}}>Встановити як тариф за замовчуванням</span>
        </label>
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB: PAYMENTS (stub — payment_accounts not yet
   fully wired; shows placeholder UI)
   ════════════════════════════════════════════════ */
function PaymentsTab({ site, onUpdate }: { site: Site; onUpdate: (cfg: PaymentConfig) => void }) {
  const [cfg, setCfg] = useState<PaymentConfig>(site.payment_config || { provider: 'teya', enabled: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/booking-sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_config: cfg }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate(cfg);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: 16, background: 'var(--surface-secondary)', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Прийом платежів</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Дозволити гостям оплачувати бронювання онлайн</div>
        </div>
        <button className="btn btn-ghost" onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}>
          {cfg.enabled ? <ToggleRight size={32} style={{ color: '#22c55e' }} /> : <ToggleLeft size={32} style={{ color: 'var(--text-tertiary)' }} />}
        </button>
      </div>

      {cfg.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Платіжний провайдер</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn ${cfg.provider === 'teya' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCfg(c => ({ ...c, provider: 'teya' }))} style={{ flex: 1 }}>
                Teya Online
              </button>
              <button className="btn btn-ghost" disabled style={{ flex: 1, opacity: 0.5, cursor: 'not-allowed' }}>
                Stripe (скоро)
              </button>
            </div>
          </div>

          {cfg.provider === 'teya' && (
            <div style={{ padding: 20, border: '1px solid var(--border-primary)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <img src="https://teya.com/favicon.ico" style={{ width: 20, height: 20 }} alt="" />
                <span style={{ fontWeight: 700 }}>Налаштування Teya</span>
              </div>
              
              <div className="form-group">
                <label className="form-label">Client ID</label>
                <input className="form-input" type="password" value={cfg.teya?.client_id || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, client_id: e.target.value } }))} placeholder="Введіть Client ID" />
              </div>

              <div className="form-group">
                <label className="form-label">Client Secret</label>
                <input className="form-input" type="password" value={cfg.teya?.client_secret || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, client_secret: e.target.value } }))} placeholder="Введіть Client Secret" />
              </div>

              <div className="form-group">
                <label className="form-label">Store ID</label>
                <input className="form-input" value={cfg.teya?.store_id || ''} onChange={e => setCfg(c => ({ ...c, teya: { ...c.teya, store_id: e.target.value } }))} placeholder="Введіть Store ID" />
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--surface-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                💡 Ви можете знайти ці дані в особистому кабінеті Teya (Developer Portal).
              </div>
            </div>
          )}

          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Збережено!' : 'Зберегти налаштування платежів'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   TAB: PROMO CODES
   ════════════════════════════════════════════════ */
function PromoCodesTab({ siteId }: { siteId: string }) {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const DAYS = [
    { key: 1, label: 'Пн' }, { key: 2, label: 'Вт' }, { key: 3, label: 'Ср' },
    { key: 4, label: 'Чт' }, { key: 5, label: 'Пт' }, { key: 6, label: 'Сб' },
    { key: 7, label: 'Нд' },
  ];

  const emptyForm = () => ({
    code: '', discount_type: 'percent', discount_value: '',
    valid_from: '', valid_until: '',
    min_nights: 1, max_nights: '', redemption_limit: '',
    allowed_days: [] as number[],
    applies_to: 'services' as 'services'|'listings'|'both',
  });
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/promo-codes?site_id=${siteId}`);
      const d = await res.json();
      if (Array.isArray(d)) setCodes(d);
      else if (Array.isArray(d.codes)) setCodes(d.codes);
    } catch { setCodes([]); }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const toggleDay = (day: number) => {
    setForm(f => {
      const days = f.allowed_days.includes(day)
        ? f.allowed_days.filter(d => d !== day)
        : [...f.allowed_days, day].sort();
      return { ...f, allowed_days: days };
    });
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.discount_value) { alert('Введіть код та знижку'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type === 'percent' ? 'percentage' : 'fixed_amount',
          discount_value: +form.discount_value,
          valid_from: form.valid_from || null,
          valid_until: form.valid_until || null,
          min_nights: form.min_nights || null,
          max_nights: form.max_nights ? +form.max_nights : null,
          redemption_limit: form.redemption_limit ? +form.redemption_limit : null,
          site_id: siteId,
          allowed_days: form.allowed_days.length > 0 ? form.allowed_days : null,
          applies_to: form.applies_to,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Помилка'); setCreating(false); return; }
      setShowCreate(false);
      setForm(emptyForm());
      fetchCodes();
    } catch { alert('Помилка мережі'); }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити промокод?')) return;
    await fetch(`/api/promo-codes/${id}`, { method: 'DELETE' });
    fetchCodes();
  };

  if (loading) return <div style={{padding:40,textAlign:'center'}}><Loader2 size={24} className="spin"/></div>;

  return (
    <div>
      <div className="table-toolbar">
        <div style={{fontSize:14,color:'var(--text-secondary)'}}>{codes.length} промокодів</div>
        <button className="btn btn-primary" onClick={()=>setShowCreate(true)}><Plus size={16}/> Новий промокод</button>
      </div>

      {codes.length===0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
          <Percent size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
          <div>Промо-кодів ще немає</div>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Код</th><th>Знижка</th><th>Застосовується</th><th>Діє до</th><th>Ночей</th><th>Використано</th><th></th></tr></thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.id}>
                <td style={{fontFamily:'monospace',fontWeight:700}}>{c.code}</td>
                <td>{c.discount_value}{c.discount_type==='percentage'?'%':' CZK'}</td>
                <td style={{fontSize:12}}>
                  {c.applies_to === 'listings' ? '🏠 Оголошення'
                   : c.applies_to === 'both'   ? '🏠+🛎 Обидва'
                   : '🛎 Сервіси'}
                </td>
                <td style={{fontSize:13,color:'var(--text-secondary)'}}>{c.valid_until || '—'}</td>
                <td style={{fontSize:13}}>
                  {c.min_nights || 1}–{c.max_nights || '∞'}
                  {c.allowed_days && <span style={{marginLeft:6,fontSize:11,color:'var(--text-tertiary)'}}>
                    {(() => { try { return JSON.parse(c.allowed_days).map((d:number) => ['','Пн','Вт','Ср','Чт','Пт','Сб','Нд'][d]).join(','); } catch { return ''; } })()}
                  </span>}
                </td>
                <td style={{fontSize:13}}>{c.current_uses || 0}{c.redemption_limit ? ` / ${c.redemption_limit}` : ''}</td>
                <td>
                  <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={()=>handleDelete(c.id)}>
                    <Trash2 size={14}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Новий промокод"
        footer={<>
          <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin"/> : <Plus size={14}/>} Створити
          </button>
        </>}>

        {/* Застосовується до */}
        <div className="form-group">
          <label className="form-label">Застосовується до</label>
          <div style={{display:'flex',gap:8}}>
            {([['services','🛎 Сервіси'],['listings','🏠 Оголошення'],['both','🏠+🛎 Обидва']] as const).map(([val,label]) => (
              <button key={val} type="button" onClick={() => setForm(f => ({...f, applies_to: val}))}
                style={{
                  flex:1, padding:'8px 4px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                  border:`2px solid ${form.applies_to===val?'var(--accent-primary)':'var(--border-primary)'}`,
                  background:form.applies_to===val?'var(--accent-primary)':'var(--surface-secondary)',
                  color:form.applies_to===val?'#fff':'var(--text-secondary)', transition:'all .15s',
                }}>
                {label}
              </button>
            ))}
          </div>
          {form.applies_to !== 'services' && (
            <div style={{fontSize:11,color:'#f59e0b',marginTop:6,padding:'6px 10px',background:'#fef3c722',borderRadius:6,border:'1px solid #f59e0b44'}}>
              ⚠️ Промокоди для оголошень потребують додаткового налаштування embed.js. Наразі повністю працює лише для Сервісів.
            </div>
          )}
        </div>

        {/* Код */}
        <div className="form-group">
          <label className="form-label">Код *</label>
          <input className="form-input" placeholder="SUMMER20" value={form.code}
            style={{textTransform:'uppercase'}}
            onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} autoFocus />
        </div>

        {/* Тип + значення */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Тип знижки</label>
            <select className="form-select" value={form.discount_type} onChange={e=>setForm(f=>({...f,discount_type:e.target.value}))}>
              <option value="percent">Відсоток (%)</option>
              <option value="fixed">Фіксована сума</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Значення *</label>
            <input className="form-input" type="number" min={0}
              placeholder={form.discount_type==='percent'?'20':'500'}
              value={form.discount_value} onChange={e=>setForm(f=>({...f,discount_value:e.target.value}))} />
          </div>
        </div>

        {/* Дати */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Діє від</label>
            <input className="form-input" type="date" value={form.valid_from} onChange={e=>setForm(f=>({...f,valid_from:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Діє до</label>
            <input className="form-input" type="date" value={form.valid_until} onChange={e=>setForm(f=>({...f,valid_until:e.target.value}))} />
          </div>
        </div>

        {/* Ночі */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" min={1} value={form.min_nights}
              onChange={e=>setForm(f=>({...f,min_nights:+e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Макс. ночей</label>
            <input className="form-input" type="number" min={1} placeholder="Без ліміту"
              value={form.max_nights} onChange={e=>setForm(f=>({...f,max_nights:e.target.value}))} />
          </div>
        </div>

        {/* Ліміт використань */}
        <div className="form-group">
          <label className="form-label">Ліміт використань</label>
          <input className="form-input" type="number" min={0} placeholder="Без ліміту"
            value={form.redemption_limit} onChange={e=>setForm(f=>({...f,redemption_limit:e.target.value}))} />
        </div>

        {/* Дні тижня */}
        <div className="form-group">
          <label className="form-label">
            Діє лише в ці дні тижня
            <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:400,marginLeft:6}}>
              {form.allowed_days.length === 0 ? '(всі дні)' : ''}
            </span>
          </label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {DAYS.map(d => {
              const on = form.allowed_days.includes(d.key);
              return (
                <button key={d.key} type="button" onClick={()=>toggleDay(d.key)}
                  style={{
                    width:38,height:38,borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',
                    border:`2px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: on ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                    color: on ? '#fff' : 'var(--text-secondary)',
                    transition:'all .15s',
                  }}>
                  {d.label}
                </button>
              );
            })}
            {form.allowed_days.length > 0 && (
              <button type="button" onClick={()=>setForm(f=>({...f,allowed_days:[]}))}
                style={{fontSize:11,color:'var(--text-tertiary)',background:'none',border:'none',cursor:'pointer',padding:'0 4px'}}>
                скинути
              </button>
            )}
          </div>
          {form.allowed_days.length === 0 && (
            <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:4}}>
              Не вибрано — промокод діє в будь-який день
            </div>
          )}
        </div>

      </Modal>
    </div>
  );
}


/* ════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════ */
export default function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const onMenuClick = useMobileMenu();

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('listings');
  const [isMounted, setIsMounted] = useState(false);

  const fetchSite = useCallback(async () => {
    const res = await fetch(`/api/booking-sites/${siteId}`);
    const d = await res.json();
    if (d.site) setSite(d.site);
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    setIsMounted(true);
    fetchSite();
  }, [fetchSite]);

  if (!isMounted || loading) return (
    <div className="page-layout">
      <Header title="Завантаження..." onMenuClick={onMenuClick} />
      <div style={{ display:'flex',justifyContent:'center',padding:80 }}>
        <Loader2 size={36} className="spin" style={{ color:'var(--accent-primary)' }} />
      </div>
    </div>
  );

  if (!site) return (
    <div className="page-layout">
      <Header title="Сайт не знайдено" onMenuClick={onMenuClick} />
      <div style={{padding:40,textAlign:'center'}}>
        <div style={{fontSize:16,marginBottom:12}}>Сайт не знайдено або видалено</div>
        <button className="btn btn-primary" onClick={()=>router.push('/sites')}><ArrowLeft size={16}/> Назад до списку</button>
      </div>
    </div>
  );

  const STATUS_COLOR: Record<string,string> = { active:'#22c55e', paused:'#f59e0b', deleted:'#ef4444' };

  return (
    <div className="page-layout">
      <Header title={site.name} onMenuClick={onMenuClick} onBack={() => router.push('/sites')} />

      <div className="page-content" style={{ padding: 12 }}>
        {/* Breadcrumb + meta */}
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20 }}>
          <button className="btn btn-ghost" onClick={()=>router.push('/sites')} style={{padding:'6px 10px'}}>
            <ArrowLeft size={16}/> Сайти
          </button>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <Globe size={18} style={{color:'var(--accent-primary)'}} />
            <span style={{ fontWeight:700,fontSize:18 }}>{site.name}</span>
            <span style={{ fontSize:12,padding:'2px 10px',borderRadius:99,background:`${STATUS_COLOR[site.status]}22`,color:STATUS_COLOR[site.status],fontWeight:600 }}>
              {site.status === 'active' ? 'Активний' : site.status === 'paused' ? 'Призупинено' : 'Видалено'}
            </span>
            <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:'monospace'}}>{site.currency}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex',gap:2,borderBottom:'1px solid var(--border-primary)',marginBottom:24,overflowX:'auto' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 16px',fontSize:13,fontWeight:activeTab===tab.id?600:400,
                border:'none',background:'none',cursor:'pointer',whiteSpace:'nowrap',
                borderBottom:`2px solid ${activeTab===tab.id?'var(--accent-primary)':'transparent'}`,
                color: activeTab===tab.id?'var(--accent-primary)':'var(--text-secondary)',
                marginBottom:-1,transition:'all .15s' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'listings'    && <ListingsTab siteId={siteId} siteSlug={site?.slug || ''} />}
        {activeTab === 'services'    && <ServicesTab siteId={siteId} />}
        {activeTab === 'design'      && <DesignTab site={site} onUpdate={cfg=>setSite(s=>s?{...s,design_config:cfg}:s)} />}
        {activeTab === 'widget'      && <WidgetTab site={site} onUpdate={cfg=>setSite(s=>s?{...s,widget_config:cfg}:s)} />}
        {activeTab === 'rate-plans'  && <RatePlansTab siteId={siteId} />}
        {activeTab === 'payments'    && <PaymentsTab site={site} onUpdate={cfg=>setSite(s=>s?{...s,payment_config:cfg}:s)} />}
        {activeTab === 'promo-codes' && <PromoCodesTab siteId={siteId} />}
      </div>
    </div>
  );
}
