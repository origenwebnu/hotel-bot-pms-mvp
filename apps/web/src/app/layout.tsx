import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BookiChat — Panel del Hotel',
  description: 'Chatbot SaaS de reservas directas para hoteles vía WhatsApp',
  icons: {
    icon: [
      { url: '/brand/favicon-light.svg', media: '(prefers-color-scheme: light)' },
      { url: '/brand/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('bookichat-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={rubik.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
