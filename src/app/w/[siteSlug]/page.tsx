import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import dynamicImport from 'next/dynamic';

// Use dynamic import with SSR disabled to avoid server-side errors with complex client components
const BookingV3 = dynamicImport(() => import('@/app/booking/BookingV3'), { 
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh', background: '#FAFAF7' }} />
});

export const dynamic = 'force-dynamic';

export default async function WidgetPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ siteSlug: string }>,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { siteSlug } = await params;
  await searchParams;
  
  try {
    const db = getDb();
    const site = db.prepare("SELECT id, design_config, widget_config FROM booking_sites WHERE slug = ? AND status != 'deleted'").get(siteSlug) as any;

    if (!site) {
      return notFound();
    }

    let design = {};
    if (site.design_config) {
      try {
        design = JSON.parse(site.design_config);
      } catch { /* ignore */ }
    }

    let thankYouUrl = '';
    if (site.widget_config) {
      try {
        const cfg = JSON.parse(site.widget_config);
        thankYouUrl = cfg.thank_you_url || '';
      } catch { /* ignore */ }
    }

    return (
      <BookingV3 siteId={site.id} siteSlug={siteSlug} thankYouUrl={thankYouUrl} design={design} />
    );
  } catch (error) {
    console.error('WidgetPage Error:', error);
    return (
      <BookingV3 siteSlug={siteSlug} />
    );
  }
}
