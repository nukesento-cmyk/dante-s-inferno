import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { crustSchema, formatKes, sizeSchema } from '@dantes/shared';
import { crustsApi, sizesApi } from '../api/endpoints';
import { useCrusts, useSizes } from '../api/queries';
import type { Crust, Size } from '../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, MoneyInput, MoveButtons, PageHeader, Table, Td, Textarea, Th, useDragRows } from '../components/ui';
import { useAction, useOrdered } from '../lib/hooks';
import { centsToKes, kesToCentsStrict } from '../lib/money';
import { sharedResolver } from '../lib/resolver';

export function CustomizationsPage() {
  return (
    <>
      <PageHeader title="Sizes & crusts" subtitle="Crust prices are adjustments added to the base pizza price, per size" />
      <div className="space-y-6"><SizeSection /><CrustSection /></div>
    </>
  );
}

function SizeSection() {
  const q = useSizes();
  const { list, move } = useOrdered(q.data, (ids) => sizesApi.reorder(ids), ['sizes']);
  const drag = useDragRows(move);
  const [editing, setEditing] = useState<Size | 'new' | null>(null);
  const [removing, setRemoving] = useState<Size | null>(null);
  const del = useAction((id: string) => sizesApi.remove(id), { success: 'Size deleted', invalidate: [['sizes']], onSuccess: () => setRemoving(null) });
  return (
    <Card title="Sizes" actions={<Button variant="primary" size="sm" onClick={() => setEditing('new')}>New size</Button>} className="">
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No sizes" />}>
        {() => (
          <Table>
            <thead><tr><Th>Order</Th><Th>Name</Th><Th>Code</Th><Th>Diameter</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id} {...drag(i)} className="cursor-grab">
                  <Td><MoveButtons index={i} count={list.length} onMove={move} label={s.name} /></Td><Td className="font-medium">{s.name}</Td><Td>{s.code}</Td><Td>{s.inches}"</Td>
                  <Td><Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Inactive'}</Badge></Td>
                  <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(s)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(s)}>Delete</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Async>
      {editing && <SizeForm size={editing === 'new' ? null : editing} count={list.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete size?" message={<>Delete “{removing?.name}”? Product prices for this size will be lost.</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </Card>
  );
}
interface SV { code: string; name: string; inches: string; active: boolean }
function SizeForm({ size, count, onClose }: { size: Size | null; count: number; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SV>({
    resolver: sharedResolver<SV>(sizeSchema, (v) => ({ code: v.code, name: v.name, inches: Number(v.inches), active: v.active, sortOrder: size?.sortOrder ?? count })),
    defaultValues: { code: size?.code ?? '', name: size?.name ?? '', inches: String(size?.inches ?? 12), active: size?.active ?? true },
  });
  const save = useAction((b: unknown) => (size ? sizesApi.update(size.id, b) : sizesApi.create(b)), { success: 'Size saved', invalidate: [['sizes']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={size ? 'Edit size' : 'New size'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
          <Field label="Code" error={errors.code?.message}>{(id, d) => <Input id={id} aria-describedby={d} placeholder="M" {...register('code')} />}</Field>
          <Field label="Inches" error={errors.inches?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('inches')} />}</Field>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('active')} /> Active</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

function CrustSection() {
  const q = useCrusts();
  const sizes = useSizes();
  const { list, move } = useOrdered(q.data, (ids) => crustsApi.reorder(ids), ['crusts']);
  const drag = useDragRows(move);
  const [editing, setEditing] = useState<Crust | 'new' | null>(null);
  const [removing, setRemoving] = useState<Crust | null>(null);
  const del = useAction((id: string) => crustsApi.remove(id), { success: 'Crust deleted', invalidate: [['crusts']], onSuccess: () => setRemoving(null) });
  return (
    <Card title="Crusts" actions={<Button variant="primary" size="sm" onClick={() => setEditing('new')}>New crust</Button>}>
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No crusts" />}>
        {() => (
          <Table>
            <thead><tr><Th>Order</Th><Th>Crust</Th><Th>Adjustments</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.id} {...drag(i)} className="cursor-grab">
                  <Td><MoveButtons index={i} count={list.length} onMove={move} label={c.name} /></Td>
                  <Td className="font-medium">{c.name}<div className="text-xs font-normal text-zinc-500">{c.description}</div></Td>
                  <Td className="text-xs tabular-nums">{c.adjustments.map((a) => `${sizes.data?.find((s) => s.id === a.sizeId)?.code ?? '?'} +${formatKes(a.adjustmentCents)}`).join(' · ') || '—'}</Td>
                  <Td><Badge tone={c.active ? 'green' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Badge></Td>
                  <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(c)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(c)}>Delete</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Async>
      {editing && sizes.data && <CrustForm crust={editing === 'new' ? null : editing} sizes={sizes.data} count={list.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete crust?" message={<>Delete “{removing?.name}”?</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </Card>
  );
}
interface CV { name: string; description: string; active: boolean; adjustments: { sizeId: string; adjustmentKes: string }[] }
function CrustForm({ crust, sizes, count, onClose }: { crust: Crust | null; sizes: Size[]; count: number; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CV>({
    resolver: sharedResolver<CV>(crustSchema, (v) => ({ name: v.name, description: v.description, active: v.active, sortOrder: crust?.sortOrder ?? count, adjustments: v.adjustments.map((a) => ({ sizeId: a.sizeId, adjustmentCents: a.adjustmentKes.trim() === '' ? 0 : kesToCentsStrict(a.adjustmentKes) })) })),
    defaultValues: { name: crust?.name ?? '', description: crust?.description ?? '', active: crust?.active ?? true, adjustments: sizes.map((s) => ({ sizeId: s.id, adjustmentKes: centsToKes(crust?.adjustments.find((a) => a.sizeId === s.id)?.adjustmentCents ?? 0) })) },
  });
  const save = useAction((b: unknown) => (crust ? crustsApi.update(crust.id, b) : crustsApi.create(b)), { success: 'Crust saved', invalidate: [['crusts']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={crust ? 'Edit crust' : 'New crust'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
        <Field label="Description" error={errors.description?.message}>{(id) => <Textarea id={id} rows={2} {...register('description')} />}</Field>
        <fieldset className="rounded-lg border border-zinc-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase text-zinc-600">Price adjustment per size</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {sizes.map((s, i) => (
              <Field key={s.id} label={s.name} error={errors.adjustments?.[i]?.adjustmentKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register(`adjustments.${i}.adjustmentKes`)} />}</Field>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('active')} /> Active</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
