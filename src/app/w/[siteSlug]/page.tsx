import dynamicImport from 'next/dynamic';

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
  
  return (
    <BookingV3 siteSlug={siteSlug} />
  );
}
