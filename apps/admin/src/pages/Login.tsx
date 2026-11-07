import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { loginSchema } from '@dantes/shared';
import { authApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Me } from '../api/types';
import { Button, Field, Input } from '../components/ui';
import { sharedResolver } from '../lib/resolver';
import { homeFor } from '../lib/roles';
import { toast } from '../store/toast';
import { useQuery } from '@tanstack/react-query';

interface Form {
  email: string;
  password: string;
}

export function LoginPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();
  const existing = useQuery({ queryKey: ['me'], queryFn: () => authApi.me().catch(() => null), retry: false });
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: sharedResolver(loginSchema), defaultValues: { email: '', password: '' } });

  if (existing.data) return <Navigate to={homeFor(existing.data.role)} replace />;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await authApi.login(v.email, v.password);
      const me: Me = await authApi.me();
      qc.setQueryData(['me'], me);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== '/login' ? from : homeFor(me.role), { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-graphite p-4">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-2xl">
        <div>
          <div className="text-2xl font-extrabold">
            DANTE'S <span className="text-brand">PIZZA</span>
          </div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">Admin Command Centre</div>
        </div>
        <Field label="Email" error={formState.errors.email?.message}>
          {(id, d) => <Input id={id} type="email" autoComplete="username" aria-describedby={d} aria-invalid={!!formState.errors.email} {...register('email')} />}
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          {(id, d) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={d} aria-invalid={!!formState.errors.password} {...register('password')} />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
