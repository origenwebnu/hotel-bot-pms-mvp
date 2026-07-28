import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookiChat — Panel del Hotel',
  description: 'Chatbot SaaS de reservas directas para hoteles vía WhatsApp',
  icons: {
    icon: '/favicon.svg',
    apple: '/branding/logo-mark-on-dark.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
