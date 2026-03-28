import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'FleetBoard Deployment Dashboard',
  description: 'Version and rollout view across clusters'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
