'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type KnowledgeDoc } from '@/lib/api';
import { Modal } from '@/components/Modal';

const emptyForm = { title: '', content: '' };

type FormMode = 'create' | 'edit' | null;

function excerpt(text: string, max = 140) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

export function KnowledgePanel() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewDoc, setViewDoc] = useState<KnowledgeDoc | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await api.listKnowledge());
    } catch {
      setMessage('Error cargando documentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  function closeFormModal() {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setFormMode('create');
    setMessage('');
  }

  function openEdit(doc: KnowledgeDoc) {
    setViewDoc(null);
    setEditingId(doc.id);
    setForm({ title: doc.title, content: doc.content });
    setFormMode('edit');
    setMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (formMode === 'edit' && editingId) {
        await api.updateKnowledge(editingId, form);
        setMessage('Documento actualizado. Reindexando…');
      } else {
        await api.createKnowledge(form);
        setMessage('Documento guardado. Procesando…');
      }
      closeFormModal();
      await loadDocs();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este documento?')) return;
    await api.deleteKnowledge(id);
    if (viewDoc?.id === id) setViewDoc(null);
    if (editingId === id) closeFormModal();
    await loadDocs();
  }

  if (loading) {
    return <p className="ai-training-loading">Cargando entrenamiento…</p>;
  }

  return (
    <div className="ai-training">
      <header className="ai-training-header">
        <div>
          <h2>Entrenamiento AI</h2>
          <p>
            Carga políticas, horarios, servicios y FAQs. La IA usará esta información para
            responder huéspedes. El contador muestra cuántas veces se usó cada documento en
            respuestas.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Agregar información
        </button>
      </header>

      {message && (
        <div className={message.includes('Error') ? 'error-banner' : 'info-banner'}>{message}</div>
      )}

      {docs.length === 0 ? (
        <div className="ai-training-empty glass-panel">
          <p>No hay documentos aún.</p>
          <button type="button" className="btn-primary" onClick={openCreate}>
            Agregar primera información
          </button>
        </div>
      ) : (
        <div className="ai-training-grid">
          {docs.map((doc) => (
            <article key={doc.id} className="ai-doc-card glass-panel">
              <div className="ai-doc-card-top">
                <span className={`ai-doc-status ${doc.isIndexed ? 'indexed' : 'pending'}`}>
                  {doc.isIndexed ? 'Activo' : 'Pendiente'}
                </span>
                <span className="ai-doc-usage" title="Veces usado por la IA en respuestas">
                  {doc.aiUsageCount ?? 0} usos
                </span>
              </div>
              <h3>{doc.title}</h3>
              <p>{excerpt(doc.content)}</p>
              <div className="ai-doc-actions">
                <button type="button" className="btn-secondary" onClick={() => setViewDoc(doc)}>
                  Ampliar
                </button>
                <button type="button" className="btn-secondary" onClick={() => openEdit(doc)}>
                  Editar
                </button>
                <button type="button" className="btn-link-danger" onClick={() => handleDelete(doc.id)}>
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formMode !== null}
        title={formMode === 'edit' ? 'Editar información' : 'Agregar información'}
        onClose={closeFormModal}
      >
        <form className="ai-training-form" onSubmit={handleSubmit}>
          <label>
            Título
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Política de mascotas"
            />
          </label>
          <label>
            Contenido
            <textarea
              required
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Aceptamos mascotas pequeñas (hasta 10kg) con un cargo adicional..."
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={closeFormModal}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving
                ? formMode === 'edit'
                  ? 'Guardando…'
                  : 'Procesando…'
                : formMode === 'edit'
                  ? 'Guardar cambios'
                  : 'Guardar e indexar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={viewDoc !== null}
        title={viewDoc?.title ?? ''}
        onClose={() => setViewDoc(null)}
        wide
      >
        {viewDoc && (
          <div className="ai-training-view">
            <div className="ai-training-view-meta">
              <span className={`ai-doc-status ${viewDoc.isIndexed ? 'indexed' : 'pending'}`}>
                {viewDoc.isIndexed ? 'Activo' : 'Pendiente'}
              </span>
              <span className="ai-doc-usage">{viewDoc.aiUsageCount ?? 0} usos por la IA</span>
            </div>
            <div className="ai-training-view-content">{viewDoc.content}</div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setViewDoc(null)}>
                Cerrar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  openEdit(viewDoc);
                }}
              >
                Editar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
