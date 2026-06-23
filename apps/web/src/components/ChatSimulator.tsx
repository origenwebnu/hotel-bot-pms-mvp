'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Message {
  role: 'user' | 'bot';
  text: string;
}

export function ChatSimulator() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: '¡Hola! Soy el asistente virtual de tu hotel. Pregúntame sobre políticas, horarios o servicios.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const { reply } = await api.testChat(userMsg);
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: 'Error al procesar. Verifica que OpenAI esté configurado.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="simulator">
      <p className="hint">
        Prueba cómo responderá la IA a tus huéspedes antes de activar el bot en producción.
      </p>
      <div className="chat-window">
        {messages.map((msg, i) => (
          <div key={i} className={`bubble ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {loading && <div className="bubble bot typing">Escribiendo...</div>}
      </div>
      <form onSubmit={handleSend} className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="¿Aceptan mascotas?"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Enviar
        </button>
      </form>

      <style jsx>{`
        .simulator { max-width: 640px; }
        .hint {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .chat-window {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
          min-height: 400px;
          max-height: 500px;
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
      `}</style>
    </div>
  );
}
