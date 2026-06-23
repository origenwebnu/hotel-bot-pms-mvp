import Link from 'next/link';
import { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="logo">BookiChat</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: radial-gradient(ellipse at top, #1a2838 0%, var(--bg) 70%);
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2.5rem;
        }
        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent);
          letter-spacing: -0.02em;
        }
        h1 {
          font-size: 1.5rem;
          margin: 0.75rem 0 0.25rem;
        }
        .auth-header p {
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .auth-footer {
          text-align: center;
          margin-top: 1.5rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .auth-footer :global(a) {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
        }
        .auth-footer :global(a:hover) {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
