import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatKes, ingredientSchema, toppingGroupSchema } from '@dantes/shared';
import { ingredientsApi, toppingGroupsApi } from '../api/endpoints';
import { useGroups, useIngredients } from '../api/queries';
import type { Ingredient, ToppingGroup } from '../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, MoneyInput, MoveButtons, PageHeader, Select, Table, Tabs, Td, Textarea, Th, useDragRows } from '../components/ui';
import { useAction, useOrdered } from '../lib/hooks';
import { centsToKes, kesToCents, kesToCentsStrict } from '../lib/money';
import { sharedResolver, slugify } from '../lib/resolver';

export function IngredientsPage() {
  const [tab, setTab] = useState<'ingredients' | 'groups'>('ingredients');
  return (
    <>
      <PageHeader title="Ingredients & toppings" subtitle="Topping groups set the default surcharge; ingredients can override it" />
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ key: 'ingredients', label: 'Ingredients' }, { key: 'groups', label: 'Topping groups' }]} />
      <div className="mt-4">{tab === 'ingredients' ? <IngredientList /> : <GroupList />}</div>
    </>
  );
}

function IngredientList() {
  const q = useIngredients();
  const groups = useGroups();
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [removing, setRemoving] = useState<Ingredient | null>(null);
  const del = useAction((id: string) => ingredientsApi.remove(id), { success: 'Ingredient deleted', invalidate: [['ingredients']], onSuccess: () => setRemoving(null) });
  const gname = (id: string) => groups.data?.find((g) => g.id === id);
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => setEditing('new')}>New ingredient</Button></div>
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No ingredients yet" />}>
        {(rows) => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Ingredient</Th><Th>Group</Th><Th className="text-right">Surcharge</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const g = gname(i.groupId);
                  return (
                    <tr key={i.id} className="hover:bg-zinc-50">
                      <Td><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: i.color }} aria-hidden />{i.name}</Td>
                      <Td>{g?.name ?? '—'}</Td>
                      <Td className="text-right tabular-nums">{i.surchargeCents === null ? <span className="text-zinc-500">Group ({formatKes(g?.surchargeCents ?? 0)})</span> : <strong>{formatKes(i.surchargeCents)}</strong>}</Td>
                      <Td><Badge tone={i.available ? 'green' : 'gray'}>{i.available ? 'Available' : 'Unavailable'}</Badge></Td>
                      <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(i)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(i)}>Delete</Button></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && groups.data && <IngredientForm ing={editing === 'new' ? null : editing} groups={groups.data} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete ingredient?" message={<>Delete “{removing?.name}”? It will be removed from all products.</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </>
  );
}

interface IV { name: string; slug: string; description: string; groupId: string; surchargeKes: string; available: boolean; modelKey: string; color: string }
function IngredientForm({ ing, groups, onClose }: { ing: Ingredient | null; groups: ToppingGroup[]; onClose: () => void }) {
  const [touched, setTouched] = useState(!!ing);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<IV>({
    resolver: sharedResolver<IV>(ingredientSchema, (v) => ({ ...v, surchargeCents: kesToCents(v.surchargeKes) ?? (v.surchargeKes.trim() === '' ? null : Number.NaN) })),
    defaultValues: { name: ing?.name ?? '', slug: ing?.slug ?? '', description: ing?.description ?? '', groupId: ing?.groupId ?? groups[0]?.id ?? '', surchargeKes: centsToKes(ing?.surchargeCents), available: ing?.available ?? true, modelKey: ing?.modelKey ?? '', color: ing?.color ?? '#cc3b1f' },
  });
  const name = watch('name');
  useEffect(() => { if (!touched) setValue('slug', slugify(name)); }, [name, touched, setValue]);
  const gid = watch('groupId');
  const save = useAction((b: unknown) => (ing ? ingredientsApi.update(ing.id, b) : ingredientsApi.create(b)), { success: 'Ingredient saved', invalidate: [['ingredients']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={ing ? 'Edit ingredient' : 'New ingredient'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
          <Field label="Slug" error={errors.slug?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('slug', { onChange: () => setTouched(true) })} />}</Field>
          <Field label="Group" error={errors.groupId?.message}>{(id) => <Select id={id} {...register('groupId')}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({formatKes(g.surchargeCents)})</option>)}</Select>}</Field>
          <Field label="Surcharge override" hint={`Blank = group price (${formatKes(groups.find((g) => g.id === gid)?.surchargeCents ?? 0)})`} error={errors.surchargeKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register('surchargeKes')} />}</Field>
          <Field label="3D model key" error={errors.modelKey?.message}>{(id) => <Input id={id} {...register('modelKey')} />}</Field>
          <Field label="Colour" error={errors.color?.message}>{(id) => <Input id={id} type="color" className="h-10 p-1" {...register('color')} />}</Field>
        </div>
        <Field label="Description" error={errors.description?.message}>{(id) => <Textarea id={id} rows={2} {...register('description')} />}</Field>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('available')} /> Available</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

function GroupList() {
  const q = useGroups();
  const { list, move } = useOrdered(q.data, async (ids) => {
    // The contract has no reorder endpoint for topping groups: persist order by sortOrder via PUT.
    await Promise.all(ids.map((id, i) => { const g = q.data?.find((x) => x.id === id); return g && g.sortOrder !== i ? toppingGroupsApi.update(id, { name: g.name, surchargeCents: g.surchargeCents, sortOrder: i }) : null; }));
  }, ['topping-groups']);
  const drag = useDragRows(move);
  const [editing, setEditing] = useState<ToppingGroup | 'new' | null>(null);
  const [removing, setRemoving] = useState<ToppingGroup | null>(null);
  const del = useAction((id: string) => toppingGroupsApi.remove(id), { success: 'Group deleted', invalidate: [['topping-groups']], onSuccess: () => setRemoving(null) });
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" onClick={() => setEditing('new')}>New group</Button></div>
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No topping groups" />}>
        {() => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Order</Th><Th>Group</Th><Th className="text-right">Surcharge</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {list.map((g, i) => (
                  <tr key={g.id} {...drag(i)} className="cursor-grab hover:bg-zinc-50">
                    <Td><MoveButtons index={i} count={list.length} onMove={move} label={g.name} /></Td>
                    <Td className="font-medium">{g.name}</Td><Td className="text-right tabular-nums">{formatKes(g.surchargeCents)}</Td>
                    <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(g)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(g)}>Delete</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && <GroupForm group={editing === 'new' ? null : editing} count={list.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete group?" message={<>Delete “{removing?.name}”? Ingredients in it must be moved first.</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </>
  );
}
interface GV { name: string; surchargeKes: string }
function GroupForm({ group, count, onClose }: { group: ToppingGroup | null; count: number; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GV>({
    resolver: sharedResolver<GV>(toppingGroupSchema, (v) => ({ name: v.name, surchargeCents: kesToCentsStrict(v.surchargeKes), sortOrder: group?.sortOrder ?? count })),
    defaultValues: { name: group?.name ?? '', surchargeKes: centsToKes(group?.surchargeCents) },
  });
  const save = useAction((b: unknown) => (group ? toppingGroupsApi.update(group.id, b) : toppingGroupsApi.create(b)), { success: 'Group saved', invalidate: [['topping-groups'], ['ingredients']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={group ? 'Edit group' : 'New group'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
        <Field label="Surcharge per topping" error={errors.surchargeKes?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} {...register('surchargeKes')} />}</Field>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
