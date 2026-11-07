import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { STAFF_ROLES, staffUserSchema, type StaffRole } from '@dantes/shared';
import { staffApi } from '../api/endpoints';
import type { StaffUser } from '../api/types';
import { useQuery } from '@tanstack/react-query';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Td, Th } from '../components/ui';
import { fmtDateTime, humanize, toList } from '../lib/format';
import { useAction } from '../lib/hooks';
import { sharedResolver } from '../lib/resolver';
import { useMe } from '../lib/auth';

export function StaffPage() {
  const me = useMe();
  const q = useQuery({ queryKey: ['staff'], queryFn: async () => toList<StaffUser>(await staffApi.list()) });
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null);
  const [deact, setDeact] = useState<StaffUser | null>(null);
  const m = useAction((id: string) => staffApi.deactivate(id), { success: 'Staff member deactivated', invalidate: [['staff']], onSuccess: () => setDeact(null) });
  return (
    <>
      <PageHeader title="Staff" subtitle="Accounts and roles (owner only)" actions={<Button variant="primary" onClick={() => setEditing('new')}>New staff member</Button>} />
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No staff accounts" />}>
        {(rows) => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last login</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}{s.id === me.id && <span className="ml-1 text-xs text-zinc-500">(you)</span>}</Td><Td>{s.email}</Td><Td><Badge tone="cream">{humanize(s.role)}</Badge></Td>
                    <Td><Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Deactivated'}</Badge></Td><Td>{fmtDateTime(s.lastLoginAt)}</Td>
                    <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(s)}>Edit</Button>{' '}{s.active && s.id !== me.id && <Button size="sm" variant="ghost" className="text-tomato" onClick={() => setDeact(s)}>Deactivate</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && <StaffForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deact} danger title="Deactivate staff member?" message={<>{deact?.name} will no longer be able to sign in.</>} confirmLabel="Deactivate" loading={m.isPending} onCancel={() => setDeact(null)} onConfirm={() => deact && m.mutate(deact.id)} />
    </>
  );
}

interface FV { name: string; email: string; role: StaffRole; password: string; active: boolean }
function StaffForm({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FV>({
    resolver: sharedResolver<FV>(staffUserSchema, (v) => ({ name: v.name, email: v.email, role: v.role, active: v.active, password: v.password.trim() === '' ? undefined : v.password })),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'ORDER_STAFF', password: '', active: user?.active ?? true },
  });
  const save = useAction((b: { password?: string }) => (user ? staffApi.update(user.id, b) : staffApi.create(b)), { success: 'Staff member saved', invalidate: [['staff']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={user ? 'Edit staff member' : 'New staff member'}>
      <form onSubmit={handleSubmit((p) => {
        if (!user && !p.password) { setError('password', { message: 'A password is required for new staff' }); return; }
        save.mutate(p as { password?: string });
      })} noValidate className="space-y-3">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
        <Field label="Email" error={errors.email?.message}>{(id, d) => <Input id={id} type="email" aria-describedby={d} {...register('email')} />}</Field>
        <Field label="Role" error={errors.role?.message}>{(id) => <Select id={id} {...register('role')}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select>}</Field>
        <Field label={user ? 'New password' : 'Password'} hint={user ? 'Leave blank to keep the current password' : 'At least 8 characters'} error={errors.password?.message}>{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} {...register('password')} />}</Field>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('active')} /> Active</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
