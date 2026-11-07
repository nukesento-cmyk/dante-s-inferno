import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { categorySchema } from '@dantes/shared';
import { categoriesApi } from '../api/endpoints';
import { useCategories } from '../api/queries';
import type { Category } from '../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, MoveButtons, PageHeader, Table, Td, Th, useDragRows } from '../components/ui';
import { useAction, useOrdered } from '../lib/hooks';
import { sharedResolver, slugify } from '../lib/resolver';

export function CategoriesPage() {
  const q = useCategories();
  const { list, move } = useOrdered(q.data, (ids) => categoriesApi.reorder(ids), ['categories']);
  const drag = useDragRows(move);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const del = useAction((id: string) => categoriesApi.remove(id), { success: 'Category deleted', invalidate: [['categories']], onSuccess: () => setRemoving(null) });
  return (
    <>
      <PageHeader title="Categories" actions={<Button variant="primary" onClick={() => setEditing('new')}>New category</Button>} />
      <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No categories" action={<Button variant="primary" onClick={() => setEditing('new')}>Add category</Button>} />}>
        {() => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Order</Th><Th>Name</Th><Th>Slug</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id} {...drag(i)} className="cursor-grab hover:bg-zinc-50">
                    <Td><MoveButtons index={i} count={list.length} onMove={move} label={c.name} /></Td>
                    <Td className="font-medium">{c.name}</Td><Td className="text-zinc-500">{c.slug}</Td>
                    <Td><Badge tone={c.active ? 'green' : 'gray'}>{c.active ? 'Active' : 'Hidden'}</Badge></Td>
                    <Td className="text-right whitespace-nowrap"><Button size="sm" onClick={() => setEditing(c)}>Edit</Button>{' '}<Button size="sm" variant="ghost" className="text-tomato" onClick={() => setRemoving(c)}>Delete</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && <CategoryForm cat={editing === 'new' ? null : editing} count={list.length} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} danger title="Delete category?" message={<>Delete “{removing?.name}”? Products in it must be moved first.</>} confirmLabel="Delete" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </>
  );
}

interface FV { name: string; slug: string; active: boolean }
function CategoryForm({ cat, count, onClose }: { cat: Category | null; count: number; onClose: () => void }) {
  const [touched, setTouched] = useState(!!cat);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FV>({
    resolver: sharedResolver<FV>(categorySchema, (v) => ({ ...v, sortOrder: cat?.sortOrder ?? count })),
    defaultValues: { name: cat?.name ?? '', slug: cat?.slug ?? '', active: cat?.active ?? true },
  });
  const name = watch('name');
  useEffect(() => { if (!touched) setValue('slug', slugify(name)); }, [name, touched, setValue]);
  const save = useAction((b: unknown) => (cat ? categoriesApi.update(cat.id, b) : categoriesApi.create(b)), { success: 'Category saved', invalidate: [['categories']], onSuccess: onClose });
  const busy = isSubmitting || save.isPending;
  return (
    <Modal open onClose={onClose} title={cat ? 'Edit category' : 'New category'}>
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate className="space-y-3">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
        <Field label="Slug" error={errors.slug?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('slug', { onChange: () => setTouched(true) })} />}</Field>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('active')} /> Active (visible on the storefront)</label>
        <div className="flex justify-end gap-2 border-t pt-3"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
