/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@/lib/db';
import BookingV3 from '@/app/booking/BookingV3';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function WidgetPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ siteSlug: string }>,
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { siteSlug } = await params;
  await searchParams; // required to be awaited in Next 15 even if not used
  
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
