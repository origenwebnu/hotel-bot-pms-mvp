import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HotelBot — Panel de Administración',
  description: 'Chatbot SaaS de reservas directas para hoteles vía WhatsApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
