'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, saveAuthSession, getPostLoginPath } from '@/lib/api';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordInput } from '@/components/PasswordInput';

type Step = 'form' | 'verify';

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [form, setForm] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    hotelName: '',
  });

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const formatTime = useCallback((sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    if (form.password !== form.passwordConfirm) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    try {
      const res = await api.sendRegistrationCode(form);
      setExpiresAt(Date.now() + res.expires_in_seconds * 1000);
      setStep('verify');
      setInfo(`Enviamos un código de 6 dígitos a ${res.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar código');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api.verifyRegistration({
        email: form.email,
        code: code.trim(),
      });
      saveAuthSession(data);
      router.push(getPostLoginPath(data.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await api.resendRegistrationCode(form.email);
      setExpiresAt(Date.now() + res.expires_in_seconds * 1000);
      setCode('');
      setInfo('Nuevo código enviado a tu email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'verify') {
    return (
      <AuthLayout
        title="Verifica tu email"
        subtitle={`Código enviado a ${form.email}`}
        footer={
          <p>
            <button type="button" className="link-btn" onClick={() => setStep('form')}>
              ← Volver al formulario
            </button>
          </p>
        }
      >
        <form onSubmit={handleVerify} className="auth-form">
          {info && <div className="info-banner">{info}</div>}

          <label>
            Código de verificación
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="code-input"
            />
          </label>

          {expiresAt && (
            <p className="timer-text">
              {secondsLeft > 0 ? (
                <>Expira en <strong>{formatTime(secondsLeft)}</strong></>
              ) : (
                <span className="expired">Código expirado — solicita uno nuevo</span>
              )}
            </p>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || code.length !== 6 || secondsLeft === 0}
          >
            {loading ? 'Verificando...' : 'Confirmar y crear cuenta'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleResend}
            disabled={loading || secondsLeft === 0}
          >
            Reenviar código
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Registra tu hotel"
      subtitle="Activa tu chatbot de reservas en WhatsApp"
      footer={
        <p>
          ¿Ya tienes cuenta? <Link href="/">Inicia sesión</Link>
        </p>
      }
    >
      <form onSubmit={handleSendCode} className="auth-form">
        <label>
          Tu nombre
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="María García"
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
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="admin@hotel.com"
          />
        </label>
        <PasswordInput
          label="Contraseña"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Mínimo 8 caracteres"
        />
        <PasswordInput
          label="Confirmar contraseña"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
          placeholder="Repite tu contraseña"
        />

        {error && <div className="error-banner">{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enviando código...' : 'Continuar — verificar email'}
        </button>
      </form>
    </AuthLayout>
  );
}
