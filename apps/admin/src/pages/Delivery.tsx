import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { deliveryZoneSchema, formatKes } from '@dantes/shared';
import { zonesApi } from '../api/endpoints';
import { useZones } from '../api/queries';
import type { DeliveryZone } from '../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, MoneyInput, MoveButtons, PageHeader, Table, Td, Textarea, Th, useDragRows } from '../components/ui';
import { useAction, useOrdered } from '../lib/hooks';
import { centsToKes, kesToCents, kesToCentsStrict } from '../lib/money';
import { sharedResolver } from '../lib/resolver';

export function DeliveryPage() {
  const q = useZones();
  const { list, move } = useOrdered(q.data, (ids) => zonesApi.reorder(ids), ['zones']);
  const drag = useDragRows(move);
  const [editing, setEditing] = useState<DeliveryZone | 'new' | null>(null);
  const [removing, setRemoving] = useState<DeliveryZone | null>(null);
  const del = useAction((id: string) => zonesApi.remove(id), { success: 'Zone deleted', invalidate: [['zones']], onSuccess: () => setRemoving(null) });
  return (
    <>
      <PageHeader title="Delivery zones" subtitle="Fees, minimums and free-delivery thresholds" actions={<Button variant="primary" onClick={() => setEditing('new')}>New zone</Button>} />
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No delivery zones" hint="Customers cannot order delivery until a zone exists." action={<Button variant="primary" onClick={() => setEditing('new')}>Add zone</Button>} />}>
        {() => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Order</Th><Th>Zone</Th><Th className="text-right">Fee</Th><Th className="text-right">Minimum</Th><Th className="text-right">Free from</Th><Th>ETA</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {list.map((z, i) => (
                  <tr key={z.id} {...drag(i)} className="cursor-grab hover:bg-zinc-50">
                    <Td><MoveButtons index={i} count={list.length} onMove={move} label={z.name} /></Td>
                    <Td className="font-medium">{z.name}<div className="text-xs font-normal text-zinc-500">{z.description}</div></Td>
                    <Td className="text-right tabular-nums">{formatKes(z.feeCents)}</Td>
                    <Td className="text-right tabular-nums">{formatKes(z.minOrderCents)}</Td>
                    <Td className="text-right tabular-nums">{z.freeDeliveryFromCents === null ? 'None' : formatKes(z.freeDeliveryFromCents)}</Td>
                    <Td>{z.etaMinMinutes}–{z.etaMaxMinutes} min</Td>
                    <Td><Badge tone={z.active ? 'green' : 'gray'}>{z.active ? 'Active' : 'Inactive'}</Badge></Td>
                    <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(z)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(z)}>Delete</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && <ZoneForm zone={editing === 'new' ? null : editing} count={list.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete zone?" message={<>Delete “{removing?.name}”? Consider deactivating it instead to keep order history.</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </>
  );
}

interface FV { name: string; description: string; feeKes: string; minOrderKes: string; freeDeliveryFromKes: string; etaMinMinutes: string; etaMaxMinutes: string; active: boolean }
function ZoneForm({ zone, count, onClose }: { zone: DeliveryZone | null; count: number; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FV>({
    resolver: sharedResolver<FV>(deliveryZoneSchema, (v) => ({
      name: v.name, description: v.description, feeCents: kesToCentsStrict(v.feeKes), minOrderCents: v.minOrderKes.trim() === '' ? 0 : kesToCentsStrict(v.minOrderKes),
      freeDeliveryFromCents: kesToCents(v.freeDeliveryFromKes), etaMinMinutes: Number(v.etaMinMinutes), etaMaxMinutes: Number(v.etaMaxMinutes), active: v.active, sortOrder: zone?.sortOrder ?? count,
    })),
    defaultValues: { name: zone?.name ?? '', description: zone?.description ?? '', feeKes: centsToKes(zone?.feeCents), minOrderKes: centsToKes(zone?.minOrderCents ?? 0), freeDeliveryFromKes: centsToKes(zone?.freeDeliveryFromCents), etaMinMinutes: String(zone?.etaMinMinutes ?? 30), etaMaxMinutes: String(zone?.etaMaxMinutes ?? 45), active: zone?.active ?? true },
  });
  const save = useAction((b: unknown) => (zone ? zonesApi.update(zone.id, b) : zonesApi.create(b)), { success: 'Zone saved', invalidate: [['zones']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={zone ? 'Edit zone' : 'New zone'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
        <Field label="Description" error={errors.description?.message}>{(id) => <Textarea id={id} rows={2} {...register('description')} />}</Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Delivery fee" error={errors.feeKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register('feeKes')} />}</Field>
          <Field label="Minimum order" error={errors.minOrderKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register('minOrderKes')} />}</Field>
          <Field label="Free delivery from" hint="Blank = never free" error={errors.freeDeliveryFromKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register('freeDeliveryFromKes')} />}</Field>
          <Field label="ETA min (minutes)" error={errors.etaMinMinutes?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('etaMinMinutes')} />}</Field>
          <Field label="ETA max (minutes)" error={errors.etaMaxMinutes?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('etaMaxMinutes')} />}</Field>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('active')} /> Active</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save zone</Button></div>
      </form>
    </Modal>
  );
}
