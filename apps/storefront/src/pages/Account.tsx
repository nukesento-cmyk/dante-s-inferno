import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customerRegisterSchema } from '@dantes/shared';
import { forgotPassword, login, logout, register, resetPassword } from '../services/auth';
import { ApiError, issuesToFieldErrors } from '../lib/api';
import { useMe } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { PhoneField } from '../components/PhoneField';
import { Loading } from '../components/States';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function Field({ id, label, type = 'text', value, set, error, auto }: { id: string; label: string; type?: string; value: string; set: (v: string) => void; error?: string; auto?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} autoComplete={auto} onChange={(e) => set(e.target.value)} aria-invalid={!!error} />
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export default function Account() {
  useTitle('Account');
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const resetToken = sp.get('token');
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login');
  const { data: me, isLoading } = useMe();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['cart'] });
  };
  const onError = (e: unknown) => {
    setFail(e instanceof ApiError ? e.message : 'Something went wrong.');
    if (e instanceof ApiError) setErrs(issuesToFieldErrors(e.issues));
  };
  const m = useMutation({
    mutationFn: async () => {
      if (mode === 'login') return login({ email: f.email, password: f.password });
      if (mode === 'register') {
        const p = customerRegisterSchema.safeParse(f);
        if (!p.success) {
          const e: Record<string, string> = {};
          p.error.issues.forEach((i) => (e[i.path.join('.')] ??= i.message));
          setErrs(e);
          throw new Error('Please fix the highlighted fields.');
        }
        return register(p.data);
      }
      if (mode === 'forgot') {
        await forgotPassword(f.email);
        setInfo('If that email has an account, a reset link is on its way.');
        return null;
      }
      await resetPassword({ token: resetToken ?? '', password: f.password });
      setInfo('Password updated. You can log in now.');
      setMode('login');
      return null;
    },
    onSuccess: (r) => {
      if (r) onDone();
    },
    onError,
  });
  const out = useMutation({ mutationFn: logout, onSuccess: onDone });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrs({});
    setFail(null);
    setInfo(null);
    m.mutate();
  }

  if (isLoading) return <div className="page container-x"><Loading /></div>;
  if (me)
    return (
      <div className="page container-x">
        <h1>Hi, {me.name.split(' ')[0]}</h1>
        <p className="muted">{me.email}</p>
        <div className="chips">
          <Link to="/account/orders" className="btn btn-primary">My orders</Link>
          <button type="button" className="btn btn-ghost" onClick={() => out.mutate()} disabled={out.isPending}>Log out</button>
        </div>
      </div>
    );

  const titles: Record<Mode, string> = { login: 'Log in', register: 'Create account', forgot: 'Forgot password', reset: 'Reset password' };
  return (
    <div className="page container-x">
      <h1>{titles[mode]}</h1>
      <p className="muted">An account is optional. You can always order as a guest.</p>
      <form className="panel" style={{ maxWidth: 460 }} onSubmit={submit} noValidate>
        {mode === 'register' && <Field id="a-name" label="Name" value={f.name} set={set('name')} error={errs.name} auto="name" />}
        {mode !== 'reset' && <Field id="a-email" label="Email" type="email" value={f.email} set={set('email')} error={errs.email} auto="email" />}
        {mode === 'register' && <PhoneField label="Phone" value={f.phone} onChange={set('phone')} error={errs.phone} />}
        {mode !== 'forgot' && <Field id="a-pw" label={mode === 'reset' ? 'New password' : 'Password'} type="password" value={f.password} set={set('password')} error={errs.password} auto={mode === 'login' ? 'current-password' : 'new-password'} />}
        {fail && <p className="err" role="alert">{fail}</p>}
        {info && <p className="notice notice-ok" role="status">{info}</p>}
        <button className="btn btn-primary" type="submit" disabled={m.isPending}>{m.isPending ? 'Please wait…' : titles[mode]}</button>
        <div className="chips mt-3">
          {mode !== 'login' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('login')}>Log in</button>}
          {mode !== 'register' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('register')}>Create account</button>}
          {mode === 'login' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('forgot')}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}
