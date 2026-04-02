import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ALiSiO PMS — Property Management System',
  description: 'Modern property management system for glamping, resort, and camping properties',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
