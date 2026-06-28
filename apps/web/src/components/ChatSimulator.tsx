'use client';

import { useEffect, useState } from 'react';
import { api, type SimulatorBootstrap, type SimulatorSession } from '@/lib/api';

interface Message {
  role: 'user' | 'bot';
  text: string;
}

function formatHint(vertical: string) {
  if (vertical === 'restaurant') {
    return 'Simula reservas de mesa con tu inventario real (zonas, tarifas, horarios). También responde preguntas con tu knowledge base.';
  }
  if (vertical === 'hotel') {
    return 'Prueba preguntas frecuentes y tarifas antes de activar WhatsApp en producción.';
  }
  return 'Prueba cómo responderá el bot antes de activarlo en producción.';
}

export function ChatSimulator() {
  const [bootstrap, setBootstrap] = useState<SimulatorBootstrap | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SimulatorSession>({ state: 'idle' });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    api
      .getSimulatorBootstrap()
      .then((data) => {
        setBootstrap(data);
        setMessages([{ role: 'bot', text: data.welcome_message }]);
        setSuggestions(data.suggestions);
      })
      .catch(() => {
        setMessages([
          {
            role: 'bot',
            text: 'No se pudo cargar el simulador. Verifica tu sesión e intenta recargar.',
          },
        ]);
      })
      .finally(() => setBootLoading(false));
  }, []);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: text.trim() }]);
    setLoading(true);

    try {
      const result = await api.simulatorChat(text.trim(), session);
      setSession(result.session);
      setSuggestions(result.suggestions);
      setMessages((prev) => [
        ...prev,
        ...result.replies.map((reply) => ({ role: 'bot' as const, text: reply })),
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: 'Error al procesar. Verifica que OpenAI esté configurado en el servidor.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  if (bootLoading) {
    return <div className="panel">Cargando simulador...</div>;
  }

  return (
    <div className="simulator-layout">
      <div className="simulator-main">
        <p className="hint">
          {bootstrap ? formatHint(bootstrap.business_vertical) : ''}
          {session.state !== 'idle' && session.state !== 'faq' && (
            <span className="sim-state"> · Flujo activo: {session.state.replace(/_/g, ' ')}</span>
          )}
        </p>

        <div className="chat-window">
          {messages.map((msg, i) => (
            <div key={i} className={`bubble ${msg.role}`}>
              {msg.text}
            </div>
          ))}
          {loading && <div className="bubble bot typing">Escribiendo...</div>}
        </div>

        {suggestions.length > 0 && (
          <div className="suggestion-row">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="suggestion-chip"
                disabled={loading}
                onClick={() => sendMessage(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              bootstrap?.business_vertical === 'restaurant'
                ? '¿Cuánto cuesta reservar para 4 personas?'
                : '¿Aceptan mascotas?'
            }
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Enviar
          </button>
        </form>
      </div>

      {bootstrap?.inventory_summary && (
        <aside className="simulator-side panel">
          <h3>Inventario cargado</h3>
          <pre className="inventory-preview">{bootstrap.inventory_summary}</pre>
          <p className="muted small">
            El simulador usa estos datos junto con tu entrenamiento AI para responder tarifas y
            disponibilidad.
          </p>
        </aside>
      )}

      <style jsx>{`
        .simulator-layout {
          display: grid;
          grid-template-columns: 1fr minmax(240px, 320px);
          gap: 1.25rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .simulator-layout {
            grid-template-columns: 1fr;
          }
          .simulator-side {
            order: -1;
          }
        }
        .hint {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .sim-state {
          color: var(--accent);
        }
        .chat-window {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
          min-height: 400px;
          max-height: 520px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .bubble {
          max-width: 85%;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          font-size: 0.95rem;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .bubble.user {
          align-self: flex-end;
          background: var(--accent);
          color: #000;
          border-bottom-right-radius: 4px;
        }
        .bubble.bot {
          align-self: flex-start;
          background: var(--surface-hover);
          border-bottom-left-radius: 4px;
        }
        .bubble.typing {
          opacity: 0.6;
          font-style: italic;
        }
        .suggestion-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .suggestion-chip {
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 0.82rem;
          cursor: pointer;
        }
        .suggestion-chip:disabled {
          opacity: 0.5;
        }
        .chat-input {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }
        .chat-input input {
          flex: 1;
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
        .chat-input button {
          padding: 0.75rem 1.25rem;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
        }
        .chat-input button:disabled {
          opacity: 0.5;
        }
        .simulator-side h3 {
          margin: 0 0 0.75rem;
          font-size: 1rem;
        }
        .inventory-preview {
          white-space: pre-wrap;
          font-family: inherit;
          font-size: 0.82rem;
          line-height: 1.45;
          margin: 0;
          color: var(--text);
        }
        .small {
          font-size: 0.8rem;
          margin-top: 0.75rem;
        }
      `}</style>
    </div>
  );
}
