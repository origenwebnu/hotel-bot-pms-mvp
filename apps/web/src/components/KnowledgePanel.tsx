'use client';

import { useEffect, useState } from 'react';
import { api, type KnowledgeDoc } from '@/lib/api';

export function KnowledgePanel() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listKnowledge().then(setDocs).catch(console.error);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const doc = await api.createKnowledge({ title, content });
      setDocs((prev) => [doc, ...prev]);
      setTitle('');
      setContent('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este documento?')) return;
    await api.deleteKnowledge(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="panel">
      <section className="card">
        <h2>Agregar información</h2>
        <p className="desc">
          Carga políticas, horarios, servicios y FAQs. La IA usará esta información para responder huéspedes.
        </p>
        <form onSubmit={handleCreate} className="form">
          <label>
            Título
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Política de mascotas"
            />
          </label>
          <label>
            Contenido
            <textarea
              required
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Aceptamos mascotas pequeñas (hasta 10kg) con un cargo adicional de $50.000 COP por noche..."
            />
          </label>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Indexando...' : 'Guardar e indexar'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Documentos ({docs.length})</h2>
        {docs.length === 0 ? (
          <p className="empty">No hay documentos aún. Agrega información sobre tu hotel.</p>
        ) : (
          <ul className="doc-list">
            {docs.map((doc) => (
              <li key={doc.id}>
                <div>
                  <strong>{doc.title}</strong>
                  <span className={`status ${doc.isIndexed ? 'indexed' : 'pending'}`}>
                    {doc.isIndexed ? 'Indexado' : 'Pendiente'}
                  </span>
                </div>
                <p>{doc.content.slice(0, 120)}...</p>
                <button onClick={() => handleDelete(doc.id)} className="delete-btn">
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style jsx>{`
        .panel { display: flex; flex-direction: column; gap: 1.5rem; }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
        }
        h2 { font-size: 1.15rem; margin-bottom: 0.35rem; }
        .desc { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
        .form { display: flex; flex-direction: column; gap: 1rem; }
        label {
          display: flex; flex-direction: column; gap: 0.35rem;
          font-size: 0.85rem; color: var(--text-muted);
        }
        input, textarea {
          padding: 0.65rem 0.875rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          resize: vertical;
        }
        .btn-primary {
          padding: 0.75rem 1.5rem;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          align-self: flex-start;
        }
        .empty { color: var(--text-muted); padding: 1rem 0; }
        .doc-list { list-style: none; display: flex; flex-direction: column; gap: 0.75rem; }
        .doc-list li {
          padding: 1rem;
          background: var(--bg);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .doc-list li > div {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .status {
          font-size: 0.75rem;
          padding: 0.15rem 0.5rem;
          border-radius: 12px;
        }
        .status.indexed { background: rgba(34,197,94,0.15); color: var(--success); }
        .status.pending { background: rgba(245,158,11,0.15); color: var(--warning); }
        .doc-list p { color: var(--text-muted); font-size: 0.875rem; }
        .delete-btn {
          margin-top: 0.5rem;
          background: none;
          border: none;
          color: var(--error);
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}
