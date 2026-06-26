import Image from 'next/image';
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
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <Image
            src="/brand/logo-full-light.svg"
            alt="BookiChat"
            width={180}
            height={34}
            className="auth-logo"
            priority
          />
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
          padding: 2rem 1rem;
          background:
            radial-gradient(circle at 10% 10%, rgba(188, 194, 253, 0.45), transparent 40%),
            radial-gradient(circle at 90% 0%, rgba(95, 66, 209, 0.18), transparent 35%),
            var(--bg);
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          border-radius: var(--radius-lg);
          padding: 2.25rem;
          box-shadow: var(--shadow-lg);
        }
        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .auth-header :global(.auth-logo) {
          width: auto;
          height: 34px;
          margin-bottom: 1rem;
        }
        h1 {
          font-size: 1.5rem;
          margin: 0.25rem 0;
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
          color: var(--accent-hover);
        }
      `}</style>
    </div>
  );
}
