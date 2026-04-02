import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ваше бронювання — ALiSiO Resort & Glamping',
  description: 'Інформація про ваше бронювання, реєстрація гостей, додаткові послуги',
};

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="guest-page-root">
      {children}
    </div>
  );
}
