'use client';

import dynamicImport from 'next/dynamic';
import { useParams } from 'next/navigation';

const BookingV3 = dynamicImport(() => import('@/app/booking/BookingV3'), { 
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh', background: '#FAFAF7' }} />
});

export default function WidgetPage() {
  const params = useParams();
  const siteSlug = params.siteSlug as string;
  
  return (
    <BookingV3 siteSlug={siteSlug} />
  );
}
