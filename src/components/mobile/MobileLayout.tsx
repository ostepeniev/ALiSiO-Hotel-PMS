'use client';

import { useState } from 'react';
import MobileHeader from './MobileHeader';
import MobileBottomTabs from './MobileBottomTabs';
import MobileMoreSheet from './MobileMoreSheet';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="m-app">
      <MobileHeader />
      <main className="m-content">
        {children}
      </main>
      <MobileBottomTabs onMoreClick={() => setShowMore(true)} />
      <MobileMoreSheet open={showMore} onClose={() => setShowMore(false)} />
    </div>
  );
}
