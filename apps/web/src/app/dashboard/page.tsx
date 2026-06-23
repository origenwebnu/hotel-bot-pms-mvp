'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Hotel, type IntegrationStatus } from '@/lib/api';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';
import { KnowledgePanel } from '@/components/KnowledgePanel';
import { ChatSimulator } from '@/components/ChatSimulator';

type Tab = 'integrations' | 'knowledge' | 'simulator';

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('integrations');
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }

    Promise.all([api.getHotel(), api.getIntegration()])
      .then(([h, i]) => {
        setHotel(h);
        setIntegration(i);
      })
      .catch(() => router.push('/'));
  }, [router]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('hotel_id');
    router.push('/');
  }

  if (!hotel) {
    return <div className="loading">Cargando panel...</div>;
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>🏨</span>
          <div>
            <strong>HotelBot</strong>
            <small>{hotel.name}</small>
          </div>
        </div>
        <nav>
          <button
            className={tab === 'integrations' ? 'active' : ''}
            onClick={() => setTab('integrations')}
          >
            ⚙️ Integraciones
          </button>
          <button
            className={tab === 'knowledge' ? 'active' : ''}
            onClick={() => setTab('knowledge')}
          >
            📚 Knowledge Base
          </button>
          <button
            className={tab === 'simulator' ? 'active' : ''}
            onClick={() => setTab('simulator')}
          >
            💬 Simulador IA
          </button>
        </nav>
        <button className="logout-btn" onClick={logout}>
          Cerrar sesión
        </button>
      </aside>

      <main className="main">
        <header className="main-header">
          <h1>
            {tab === 'integrations' && 'Integraciones'}
            {tab === 'knowledge' && 'Knowledge Base'}
            {tab === 'simulator' && 'Simulador de Chat'}
          </h1>
          <div className="status-badges">
            <span className={`badge ${integration?.pms_connected ? 'ok' : 'warn'}`}>
              PMS {integration?.pms_connected ? '✓' : '○'}
            </span>
            <span className={`badge ${integration?.payment_connected ? 'ok' : 'warn'}`}>
              Pagos {integration?.payment_connected ? '✓' : '○'}
            </span>
          </div>
        </header>

        {tab === 'integrations' && (
          <IntegrationsPanel
            integration={integration}
            onUpdate={setIntegration}
          />
        )}
        {tab === 'knowledge' && <KnowledgePanel />}
        {tab === 'simulator' && <ChatSimulator />}
      </main>

      <style jsx>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
        }
        .sidebar {
          width: 260px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .sidebar-brand {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }
        .sidebar-brand span:first-child {
          font-size: 1.75rem;
        }
        .sidebar-brand strong {
          display: block;
          font-size: 1rem;
        }
        .sidebar-brand small {
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        nav {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }
        nav button {
          text-align: left;
          padding: 0.75rem 1rem;
          background: none;
          border: none;
          border-radius: 8px;
          color: var(--text-muted);
          font-size: 0.95rem;
        }
        nav button.active,
        nav button:hover {
          background: var(--surface-hover);
          color: var(--text);
        }
        .logout-btn {
          padding: 0.75rem;
          background: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
        }
        .main {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
        }
        .main-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        h1 {
          font-size: 1.75rem;
        }
        .status-badges {
          display: flex;
          gap: 0.5rem;
        }
        .badge {
          padding: 0.35rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .badge.ok {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }
        .badge.warn {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
        }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
