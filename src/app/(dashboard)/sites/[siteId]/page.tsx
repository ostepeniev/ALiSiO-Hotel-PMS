'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Globe, ArrowLeft, Loader2, Plus, Trash2, X, Copy, Check,
  LayoutList, Sparkles, Palette, Code2, Tag, CreditCard, Percent,
  ToggleRight, ToggleLeft, ChevronDown, ChevronUp, Save,
} from 'lucide-react';

/* ════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════ */
interface Site {
  id: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  design_config: DesignConfig;
  widget_config: WidgetConfig;
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
}
interface Listing { id: string; unit_id?: string; unit_type_id?: string; unit_name?: string; unit_code?: string; unit_type_name?: string; unit_type_code?: string; price_override?: number; sort_order: number; created_at: string; }
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
const THEMES = ['Classical','Modern','Minimal','Nature','Luxury','Ocean','Forest','Sunset','Nordic','Urban','Vintage','Neon','Pastel','Dark'];
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

/* ════════════════════════════════════════════════
   TAB: LISTINGS
   ════════════════════════════════════════════════ */
function ListingsTab({ siteId }: { siteId: string }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
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
      <div className="table-toolbar">
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
          <thead><tr><th>Назва</th><th>Тип</th><th>Ціна</th><th></th></tr></thead>
          <tbody>
            {listings.map(l => (
              <tr key={l.id}>
                <td style={{fontWeight:600}}>{l.unit_name || l.unit_type_name || '—'}</td>
                <td style={{fontSize:12,color:'var(--text-secondary)'}}>{l.unit_id ? 'Юніт' : 'Тип юніту'}</td>
                <td style={{fontSize:13}}>{l.price_override ? `${l.price_override} CZK (override)` : 'За прайсом'}</td>
                <td style={{textAlign:'right'}}>
                  <button className="btn btn-ghost" style={{padding:'4px 8px',color:'#ef4444'}} onClick={()=>handleDelete(l.id)}>
                    <Trash2 size={14}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Themes */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.05em'}}>Тема</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
          {THEMES.map(t => (
            <button key={t} onClick={()=>setCfg(c=>({...c,theme:t}))}
              style={{padding:'10px 8px',borderRadius:8,fontSize:12,fontWeight:cfg.theme===t?700:400,
                border:`2px solid ${cfg.theme===t?'var(--accent-primary)':'var(--border-primary)'}`,
                background:cfg.theme===t?'var(--accent-primary-dim)':'var(--surface-secondary)',
                cursor:'pointer',color:'var(--text-primary)',transition:'all .15s'}}>
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
        <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Стиль кнопки</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {BUTTON_STYLES.map(bs => (
            <button key={bs.value} onClick={()=>setCfg(c=>({...c,button_style:bs.value}))}
              style={{padding:'8px 14px',borderRadius:bs.value.includes('pill')?99:bs.value.includes('rounded')?8:2,
                fontSize:12,border:`2px solid ${cfg.button_style===bs.value?'var(--accent-primary)':'var(--border-primary)'}`,
                background:cfg.button_style===bs.value?'var(--accent-primary-dim)':'var(--surface-secondary)',
                fontWeight:cfg.button_style===bs.value?700:400,cursor:'pointer',color:'var(--text-primary)'}}>
              {bs.label}
            </button>
          ))}
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

  const scriptTag = `<script
  src="${origin || 'https://YOUR_DOMAIN'}/widget/embed.js"
  data-site="${site.id}"
  data-lang="uk">
</script>`;

  const iframeEmbed = `<iframe
  src="${origin || 'https://YOUR_DOMAIN'}/booking?site=${site.id}"
  width="100%" height="600"
  frameborder="0" allowfullscreen>
</iframe>`;


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

      <Step n={2} title="Вставте JS-тег на ваш сайт">
        <div style={{position:'relative'}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:16,fontSize:12,overflowX:'auto',margin:0}}>{scriptTag}</pre>
          <div style={{position:'absolute',top:8,right:8}}><CopyBtn text={scriptTag}/></div>
        </div>
      </Step>

      <Step n={3} title="Або використайте iframe (альтернатива)">
        <div style={{position:'relative'}}>
          <pre style={{background:'var(--surface-secondary)',borderRadius:8,padding:16,fontSize:12,overflowX:'auto',margin:0}}>{iframeEmbed}</pre>
          <div style={{position:'absolute',top:8,right:8}}><CopyBtn text={iframeEmbed}/></div>
        </div>
      </Step>

      <Step n={4} title="Перевірте встановлення">
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>
          Відкрийте ваш сайт і переконайтесь що кнопка/форма бронювання відображається. Бронювання буде прив'язане до сайту <strong>{site.name}</strong>.
        </div>
      </Step>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin"/> : saved ? <Check size={16}/> : <Save size={16}/>}
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
function PaymentsTab({ siteId }: { siteId: string }) {
  return (
    <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
      <CreditCard size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
      <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Платіжні акаунти</div>
      <div style={{fontSize:13,marginBottom:20}}>Підключіть Stripe або PayPal для прийому онлайн-оплат через цей сайт.</div>
      <button className="btn btn-primary" disabled><Plus size={16}/> Підключити акаунт (скоро)</button>
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
  const [form, setForm] = useState({ code:'', discount_type:'percent', discount_value:'', valid_from:'', valid_until:'', min_nights:1, redemption_limit:'' });
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

  const handleCreate = async () => {
    if (!form.code.trim() || !form.discount_value) { alert("Введіть код та знижку"); return; }
    setCreating(true);
    try {
      await fetch('/api/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, site_id: siteId, discount_value: +form.discount_value, min_nights: +form.min_nights, redemption_limit: form.redemption_limit ? +form.redemption_limit : null }),
      });
      setShowCreate(false);
      setForm({ code:'', discount_type:'percent', discount_value:'', valid_from:'', valid_until:'', min_nights:1, redemption_limit:'' });
      fetchCodes();
    } catch { alert('Помилка'); }
    setCreating(false);
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
          <thead><tr><th>Код</th><th>Знижка</th><th>Діє до</th><th>Використано</th></tr></thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.id}>
                <td style={{fontFamily:'monospace',fontWeight:700}}>{c.code}</td>
                <td>{c.discount_value}{c.discount_type==='percent'?'%':' CZK'}</td>
                <td style={{fontSize:13,color:'var(--text-secondary)'}}>{c.valid_until || '—'}</td>
                <td style={{fontSize:13}}>{c.used_count || 0}{c.redemption_limit ? ` / ${c.redemption_limit}` : ''}</td>
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
        <div className="form-group">
          <label className="form-label">Код *</label>
          <input className="form-input" placeholder="SUMMER20" value={form.code} style={{textTransform:'uppercase'}} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} autoFocus />
        </div>
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
            <input className="form-input" type="number" min={0} placeholder={form.discount_type==='percent'?'20':'500'} value={form.discount_value} onChange={e=>setForm(f=>({...f,discount_value:e.target.value}))} />
          </div>
        </div>
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
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Мін. ночей</label>
            <input className="form-input" type="number" min={1} value={form.min_nights} onChange={e=>setForm(f=>({...f,min_nights:+e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Ліміт використань</label>
            <input className="form-input" type="number" min={0} placeholder="Без ліміту" value={form.redemption_limit} onChange={e=>setForm(f=>({...f,redemption_limit:e.target.value}))} />
          </div>
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

  const fetchSite = useCallback(async () => {
    const res = await fetch(`/api/booking-sites/${siteId}`);
    const d = await res.json();
    if (d.site) setSite(d.site);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchSite(); }, [fetchSite]);

  if (loading) return (
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
      <Header title={site.name} onMenuClick={onMenuClick} />

      <div className="page-content">
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
        {activeTab === 'listings'    && <ListingsTab siteId={siteId} />}
        {activeTab === 'services'    && <ServicesTab siteId={siteId} />}
        {activeTab === 'design'      && <DesignTab site={site} onUpdate={cfg=>setSite(s=>s?{...s,design_config:cfg}:s)} />}
        {activeTab === 'widget'      && <WidgetTab site={site} onUpdate={cfg=>setSite(s=>s?{...s,widget_config:cfg}:s)} />}
        {activeTab === 'rate-plans'  && <RatePlansTab siteId={siteId} />}
        {activeTab === 'payments'    && <PaymentsTab siteId={siteId} />}
        {activeTab === 'promo-codes' && <PromoCodesTab siteId={siteId} />}
      </div>
    </div>
  );
}
