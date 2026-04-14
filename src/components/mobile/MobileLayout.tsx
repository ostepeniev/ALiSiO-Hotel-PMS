'use client';

import { useState } from 'react';
import MobileHeader from './MobileHeader';
import MobileBottomTabs from './MobileBottomTabs';
import MobileMoreSheet from './MobileMoreSheet';

interface MobileLayoutProps {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  showSearch?: boolean;
  onSearch?: () => void;
  headerRight?: React.ReactNode;
  onFabClick?: () => void;
}

export default function MobileLayout({
  children,
  title,
  onBack,
  showSearch,
  onSearch,
  headerRight,
  onFabClick,
}: MobileLayoutProps) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="m-app">
      <MobileHeader
        title={title}
        onBack={onBack}
        showSearch={showSearch}
        onSearch={onSearch}
        rightAction={headerRight}
      />
      <main className="m-content">
        {children}
      </main>
      <MobileBottomTabs
        onMoreClick={() => setShowMore(true)}
        onFabClick={onFabClick}
      />
      <MobileMoreSheet open={showMore} onClose={() => setShowMore(false)} />
    </div>
  );
}
