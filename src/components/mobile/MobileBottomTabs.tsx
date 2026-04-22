'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Plus,
  BookOpen,
  Menu,
} from 'lucide-react';

interface MobileBottomTabsProps {
  onMoreClick?: () => void;
  onFabClick?: () => void;
}

const tabs = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Календар', href: '/calendar', icon: CalendarDays },
  // FAB goes in center
  { label: 'Бронюв.', href: '/bookings', icon: BookOpen },
  { label: 'Більше', href: '__more__', icon: Menu },
];

export default function MobileBottomTabs({ onMoreClick, onFabClick }: MobileBottomTabsProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleFab = () => {
    if (onFabClick) {
      onFabClick();
    } else {
      router.push('/bookings');
    }
  };

  return (
    <nav className="m-bottom-tabs">
      {tabs.map((tab, i) => {
        // Insert FAB after 2nd tab
        const elements = [];

        if (i === 2) {
          elements.push(
            <button
              key="fab"
              className="m-fab"
              onClick={handleFab}
              aria-label="Нове бронювання"
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>
          );
        }

        if (tab.href === '__more__') {
          elements.push(
            <button
              key={tab.label}
              className="m-tab-item"
              onClick={onMoreClick}
            >
              <tab.icon size={22} />
              <span>{tab.label}</span>
            </button>
          );
        } else {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          elements.push(
            <Link
              key={tab.href}
              href={tab.href}
              className={`m-tab-item ${isActive ? 'm-tab-active' : ''}`}
            >
              <tab.icon size={22} />
              <span>{tab.label}</span>
              {isActive && <div className="m-tab-pill" />}
            </Link>
          );
        }

        return elements;
      })}
    </nav>
  );
}
