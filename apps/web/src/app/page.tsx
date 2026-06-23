'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    hotelName: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = isRegister
        ? await api.register(form)
        : await api.login({ email: form.email, password: form.password });

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('hotel_id', data.hotel_id);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="logo">🏨 HotelBot</span>
          <h1>{isRegister ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
          <p>Chatbot de reservas WhatsApp para tu hotel</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <>
              <label>
                Nombre
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Tu nombre"
                />
              </label>
              <label>
                Nombre del hotel
                <input
                  type="text"
                  required
                  value={form.hotelName}
                  onChange={(e) => setForm({ ...form, hotelName: e.target.value })}
                  placeholder="Hotel Paraíso"
                />
              </label>
            </>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@hotel.com"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </label>

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Procesando...' : isRegister ? 'Registrar hotel' : 'Entrar'}
          </button>
        </form>

        <p className="auth-toggle">
          {isRegister ? '¿Ya tienes cuenta?' : '¿Nuevo hotel?'}{' '}
          <button type="button" className="link-btn" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Inicia sesión' : 'Regístrate gratis'}
          </button>
        </p>
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
        }
        h1 {
          font-size: 1.5rem;
          margin: 0.75rem 0 0.25rem;
        }
        .auth-header p {
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        input {
          padding: 0.75rem 1rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 1rem;
        }
        input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .btn-primary {
          padding: 0.875rem;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          margin-top: 0.5rem;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--accent-dim);
        }
        .btn-primary:disabled {
          opacity: 0.6;
        }
        .error-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid var(--error);
          color: var(--error);
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }
        .auth-toggle {
          text-align: center;
          margin-top: 1.5rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .link-btn {
          background: none;
          border: none;
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
