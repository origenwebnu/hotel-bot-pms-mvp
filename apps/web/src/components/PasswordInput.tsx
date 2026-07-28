'use client';

import { useState, InputHTMLAttributes } from 'react';

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function PasswordInput({ label, id, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? inputProps.name ?? 'password';

  return (
    <label htmlFor={inputId}>
      {label}
      <div className="password-field">
        <input
          {...inputProps}
          id={inputId}
          type={visible ? 'text' : 'password'}
        />
        <button
          type="button"
          className="toggle-btn"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          tabIndex={-1}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
    </label>
  );
}
