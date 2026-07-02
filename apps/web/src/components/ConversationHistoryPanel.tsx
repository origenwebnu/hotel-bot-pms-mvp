'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ConversationHistoryItem, type ConversationHistoryLabel } from '@/lib/api';

const LABELS: Record<ConversationHistoryLabel, string> = {
  completed: 'Completado',
  abandoned: 'Abandonado',
};

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length > 10) return `+${digits}`;
  return phone;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConversationHistoryPanel() {
  const [labelFilter, setLabelFilter] = useState<ConversationHistoryLabel | 'all'>('all');
  const [items, setItems] = useState<ConversationHistoryItem[]>([]);
  const [retentionNote, setRetentionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [thread, setThread] = useState<Awaited<ReturnType<typeof api.getConversationThread>> | null>(
    null,
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listConversations(
        labelFilter === 'all' ? undefined : labelFilter,
      );
      setItems(result.items);
      setRetentionNote(result.retention_note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando conversaciones');
    } finally {
      setLoading(false);
    }
  }, [labelFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }

    let active = true;
    setThreadLoading(true);
    api
      .getConversationThread(selectedId)
      .then((data) => {
        if (active) setThread(data);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Error cargando chat');
        }
      })
      .finally(() => {
        if (active) setThreadLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  return (
    <div className="conv-history-layout">
      <div className="panel conv-list-panel">
        <div className="panel-header-row">
          <div>
            <h3>Historial de chats WhatsApp</h3>
            <p className="muted small">{retentionNote || 'Últimas conversaciones por número.'}</p>
          </div>
        </div>

        <div className="conv-filters">
          {(['all', 'completed', 'abandoned'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${labelFilter === key ? 'active' : ''}`}
              onClick={() => {
                setLabelFilter(key);
                setSelectedId(null);
              }}
            >
              {key === 'all' ? 'Todos' : LABELS[key]}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <p className="muted">Cargando conversaciones...</p>
        ) : items.length === 0 ? (
          <p className="muted empty-state">
            Aún no hay conversaciones guardadas. Los mensajes se registran cuando llegan por
            WhatsApp.
          </p>
        ) : (
          <ul className="conv-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`conv-item ${selectedId === item.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="conv-item-top">
                    <span className="conv-phone">{formatPhone(item.whatsapp_phone)}</span>
                    <span className={`conv-label ${item.label}`}>{LABELS[item.label]}</span>
                  </div>
                  <p className="conv-preview">
                    {item.preview_direction === 'outbound' ? '↗ ' : '↙ '}
                    {item.preview || '—'}
                  </p>
                  <div className="conv-meta">
                    <span>{formatDateTime(item.last_message_at)}</span>
                    <span>{item.message_count} mensaje{item.message_count !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="panel conv-thread-panel">
        {!selectedId && (
          <div className="thread-empty">
            <p className="muted">Selecciona una conversación para ver el historial de mensajes.</p>
          </div>
        )}

        {selectedId && threadLoading && <p className="muted">Cargando mensajes...</p>}

        {selectedId && thread && !threadLoading && (
          <>
            <div className="thread-header">
              <div>
                <h4>{formatPhone(thread.session.whatsapp_phone)}</h4>
                <p className="muted small">
                  Estado del bot: <code>{thread.session.state}</code>
                </p>
              </div>
              <span className={`conv-label ${thread.session.label}`}>
                {LABELS[thread.session.label]}
              </span>
            </div>

            {thread.session.label === 'completed' && thread.session.paid_amount != null && (
              <p className="paid-note">
                Pago aprobado:{' '}
                <strong>
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: thread.session.paid_currency ?? 'COP',
                    maximumFractionDigits: 0,
                  }).format(thread.session.paid_amount)}
                </strong>
              </p>
            )}

            <div className="thread-messages">
              {thread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`bubble ${msg.direction === 'outbound' ? 'out' : 'in'}`}
                >
                  <p className="bubble-body">{msg.body}</p>
                  <time className="bubble-time">{formatDateTime(msg.created_at)}</time>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      <style jsx>{`
        .conv-history-layout {
          display: grid;
          grid-template-columns: minmax(280px, 360px) 1fr;
          gap: 1rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .conv-history-layout {
            grid-template-columns: 1fr;
          }
        }
        .small {
          font-size: 0.85rem;
        }
        .conv-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 0.75rem 0 1rem;
        }
        .filter-chip {
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: #fff;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .filter-chip.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .conv-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .conv-item {
          width: 100%;
          text-align: left;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-hover);
          cursor: pointer;
        }
        .conv-item.selected {
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb33;
        }
        .conv-item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }
        .conv-phone {
          font-weight: 700;
          font-size: 0.95rem;
        }
        .conv-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 0.2rem 0.45rem;
          border-radius: 6px;
        }
        .conv-label.completed {
          background: #dcfce7;
          color: #166534;
        }
        .conv-label.abandoned {
          background: #fee2e2;
          color: #991b1b;
        }
        .conv-preview {
          margin: 0.35rem 0;
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .conv-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .thread-empty {
          padding: 2rem 1rem;
          text-align: center;
        }
        .thread-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .thread-header h4 {
          margin: 0;
        }
        .paid-note {
          margin: 0 0 0.75rem;
          font-size: 0.9rem;
          padding: 0.5rem 0.65rem;
          background: #ecfdf5;
          border-radius: 8px;
          color: #065f46;
        }
        .thread-messages {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 65vh;
          overflow-y: auto;
          padding-right: 0.25rem;
        }
        .bubble {
          max-width: 92%;
          padding: 0.55rem 0.7rem;
          border-radius: 10px;
          font-size: 0.9rem;
        }
        .bubble.in {
          align-self: flex-start;
          background: #fff;
          border: 1px solid var(--border);
        }
        .bubble.out {
          align-self: flex-end;
          background: #dbeafe;
          border: 1px solid #bfdbfe;
        }
        .bubble-body {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.4;
        }
        .bubble-time {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .empty-state {
          padding: 1.5rem 0;
        }
      `}</style>
    </div>
  );
}
