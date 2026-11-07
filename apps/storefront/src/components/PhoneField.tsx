import { useId, useState } from 'react';
import { validatePhoneInput } from '../lib/phone';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  required?: boolean;
  hint?: string;
  name?: string;
  autoComplete?: string;
}

export function PhoneField({ label, value, onChange, error, required = true, hint, name, autoComplete = 'tel' }: Props) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const local = touched ? validatePhoneInput(value, { required }).error : null;
  const msg = error ?? local;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? '' : ' (optional)'}</label>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder="0712 345 678"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={!!msg}
        aria-describedby={msg ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {hint && !msg && <p id={`${id}-hint`} className="hint">{hint}</p>}
      {msg && <p id={`${id}-err`} className="err" role="alert">{msg}</p>}
    </div>
  );
}
