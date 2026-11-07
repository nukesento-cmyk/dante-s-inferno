import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatKes, productSchema } from '@dantes/shared';
import { productsApi } from '../api/endpoints';
import { useCategories, useGroups, useIngredients, useProducts, useSizes } from '../api/queries';
import type { Ingredient, Product, ToppingGroup } from '../api/types';
import { errorMessage } from '../api/client';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, MoneyInput, MoveButtons, PageHeader, Select, Table, Td, Textarea, Th, Toggle, useDragRows } from '../components/ui';
import { centsToKes, kesToCents } from '../lib/money';
import { moveItem } from '../lib/format';
import { useAction } from '../lib/hooks';
import { sharedResolver, slugify } from '../lib/resolver';
import { toast } from '../store/toast';

export function ProductsPage() {
  const q = useProducts();
  const cats = useCategories();
  const sizes = useSizes();
  const [order, setOrder] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);

  useEffect(() => {
    if (q.data) setOrder(q.data.filter((p) => !p.archived));
  }, [q.data]);

  const reorder = useAction((ids: string[]) => productsApi.reorder(ids), { invalidate: [['products']], success: 'Order saved' });
  const avail = useAction((v: { id: string; available: boolean }) => productsApi.setAvailability(v.id, v.available), { invalidate: [['products']] });
  const archive = useAction((id: string) => productsApi.archive(id), { success: 'Product archived', invalidate: [['products']], onSuccess: () => setArchiving(null) });

  const move = (from: number, to: number) => {
    if (!order) return;
    const next = moveItem(order, from, to);
    setOrder(next);
    reorder.mutate(next.map((p) => p.id));
  };
  const drag = useDragRows(move);
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader title="Products" subtitle="Drag rows or use the arrows to change menu order" actions={<Button variant="primary" onClick={() => setEditing('new')}>New product</Button>} />
      <Async q={q} isEmpty={() => !order?.length && q.data?.length === 0} empty={<EmptyState title="No products yet" action={<Button variant="primary" onClick={() => setEditing('new')}>Create the first product</Button>} />}>
        {() => (
          <Card className="!p-0">
            <Table>
              <thead><tr><Th>Order</Th><Th>Product</Th><Th>Category</Th><Th>Prices</Th><Th>Available</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {(order ?? []).map((p, i) => (
                  <tr key={p.id} {...drag(i)} className="cursor-grab hover:bg-zinc-50">
                    <Td><MoveButtons index={i} count={order!.length} onMove={move} label={p.name} /></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-cream" aria-hidden />}
                        <div><div className="font-medium">{p.name}</div><div className="text-xs text-zinc-500">{p.slug}</div></div>
                        {p.featured && <Badge tone="orange">Featured</Badge>}
                      </div>
                    </Td>
                    <Td>{catName(p.categoryId)}</Td>
                    <Td className="text-xs tabular-nums">{p.prices.map((pr) => `${sizes.data?.find((s) => s.id === pr.sizeId)?.code ?? '?'} ${formatKes(pr.priceCents)}`).join(' · ') || '—'}</Td>
                    <Td><Toggle size="sm" label={`${p.name} available`} checked={p.available} onChange={(v) => avail.mutate({ id: p.id, available: v })} /></Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => setEditing(p)}>Edit</Button>{' '}
                      <Button size="sm" variant="ghost" className="text-tomato" onClick={() => setArchiving(p)}>Archive</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Async>
      {editing && <ProductEditor product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!archiving} danger title="Archive product?" message={<>“{archiving?.name}” will be removed from the storefront menu. Past orders are not affected.</>} confirmLabel="Archive" loading={archive.isPending} onCancel={() => setArchiving(null)} onConfirm={() => archiving && archive.mutate(archiving.id)} />
    </>
  );
}

interface FormValues {
  name: string; slug: string; description: string; categoryId: string; imageUrl: string | null;
  available: boolean; featured: boolean; maxExtra: string;
  prices: { sizeId: string; priceKes: string }[];
  defaultIngredientIds: string[]; extraIngredientIds: string[];
}

function ProductEditor({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const cats = useCategories();
  const sizes = useSizes();
  const ings = useIngredients();
  const groups = useGroups();
  const ready = cats.data && sizes.data && ings.data && groups.data;
  return (
    <Modal open wide onClose={onClose} title={product ? `Edit ${product.name}` : 'New product'}>
      {cats.isError || sizes.isError || ings.isError || groups.isError ? <p role="alert" className="text-tomato">Could not load catalogue data.</p>
        : !ready ? <p>Loading…</p>
        : <EditorForm product={product} onClose={onClose} cats={cats.data!} sizes={sizes.data!} ings={ings.data!} groups={groups.data!} />}
    </Modal>
  );
}

function EditorForm({ product, onClose, cats, sizes, ings, groups }: { product: Product | null; onClose: () => void; cats: { id: string; name: string }[]; sizes: { id: string; name: string; code: string }[]; ings: Ingredient[]; groups: ToppingGroup[] }) {
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [uploading, setUploading] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: sharedResolver<FormValues>(productSchema, (v) => ({
      name: v.name, slug: v.slug, description: v.description, categoryId: v.categoryId, imageUrl: v.imageUrl || null,
      available: v.available, featured: v.featured, sortOrder: product?.sortOrder ?? 0,
      maxExtraToppings: v.maxExtra.trim() === '' ? null : Number(v.maxExtra),
      prices: v.prices.filter((p) => p.priceKes.trim() !== '').map((p) => ({ sizeId: p.sizeId, priceCents: kesToCents(p.priceKes) ?? Number.NaN })),
      defaultIngredientIds: v.defaultIngredientIds, extraIngredientIds: v.extraIngredientIds,
    })),
    defaultValues: {
      name: product?.name ?? '', slug: product?.slug ?? '', description: product?.description ?? '', categoryId: product?.categoryId ?? cats[0]?.id ?? '',
      imageUrl: product?.imageUrl ?? null, available: product?.available ?? true, featured: product?.featured ?? false,
      maxExtra: product?.maxExtraToppings == null ? '' : String(product.maxExtraToppings),
      prices: sizes.map((s) => ({ sizeId: s.id, priceKes: centsToKes(product?.prices.find((p) => p.sizeId === s.id)?.priceCents) })),
      defaultIngredientIds: product?.defaultIngredientIds ?? [], extraIngredientIds: product?.extraIngredientIds ?? [],
    },
  });
  const name = watch('name');
  useEffect(() => { if (!slugTouched) setValue('slug', slugify(name)); }, [name, slugTouched, setValue]);
  const imageUrl = watch('imageUrl');
  const save = useAction((b: unknown) => (product ? productsApi.update(product.id, b) : productsApi.create(b)), { success: 'Product saved', invalidate: [['products']], onSuccess: onClose });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try { setValue('imageUrl', (await productsApi.uploadImage(file)).url, { shouldDirty: true }); } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(false); }
  }
  const busy = isSubmitting || save.isPending;

  return (
    <form onSubmit={handleSubmit((payload) => save.mutate(payload))} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.name} {...register('name')} />}</Field>
        <Field label="Slug" error={errors.slug?.message} hint="Auto-filled from the name">{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.slug} {...register('slug', { onChange: () => setSlugTouched(true) })} />}</Field>
        <Field label="Category" error={errors.categoryId?.message}>{(id) => <Select id={id} {...register('categoryId')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
        <Field label="Max extra toppings" hint="Blank = restaurant default" error={errors.maxExtra?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('maxExtra')} />}</Field>
      </div>
      <Field label="Description" error={errors.description?.message}>{(id) => <Textarea id={id} rows={3} {...register('description')} />}</Field>
      <div className="flex items-start gap-4">
        {imageUrl ? <img src={imageUrl} alt="Product preview" className="h-24 w-24 rounded-lg border object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-lg border border-dashed text-xs text-zinc-400">No image</div>}
        <div className="space-y-2">
          <Field label="Image">{(id) => <input id={id} type="file" accept="image/*" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} className="text-sm" />}</Field>
          {uploading && <p className="text-xs text-zinc-500">Uploading…</p>}
          {imageUrl && <Button size="sm" variant="ghost" onClick={() => setValue('imageUrl', null, { shouldDirty: true })}>Remove image</Button>}
        </div>
      </div>
      <fieldset className="rounded-lg border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase text-zinc-600">Price per size (leave blank if not sold)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {sizes.map((s, i) => (
            <Field key={s.id} label={`${s.name} (${s.code})`} error={errors.prices?.[i]?.priceKes?.message}>
              {(id, d) => <MoneyInput id={id} aria-describedby={d} aria-invalid={!!errors.prices?.[i]?.priceKes} {...register(`prices.${i}.priceKes`)} />}
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <IngredientPicker title="Default toppings" ings={ings} groups={groups} value={watch('defaultIngredientIds')} onChange={(v) => setValue('defaultIngredientIds', v, { shouldDirty: true })} />
        <IngredientPicker title="Allowed extra toppings" ings={ings} groups={groups} value={watch('extraIngredientIds')} onChange={(v) => setValue('extraIngredientIds', v, { shouldDirty: true })} />
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2"><input type="checkbox" {...register('featured')} /> Featured</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...register('available')} /> Available</label>
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Save product</Button>
      </div>
    </form>
  );
}

function IngredientPicker({ title, ings, groups, value, onChange }: { title: string; ings: Ingredient[]; groups: ToppingGroup[]; value: string[]; onChange: (v: string[]) => void }) {
  const set = new Set(value);
  const toggle = (id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); onChange([...n]); };
  return (
    <fieldset className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 p-3">
      <legend className="px-1 text-xs font-semibold uppercase text-zinc-600">{title} ({value.length})</legend>
      {groups.map((g) => {
        const list = ings.filter((i) => i.groupId === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id} className="mb-2">
            <div className="text-xs font-semibold text-zinc-500">{g.name}</div>
            {list.map((i) => (
              <label key={i.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={set.has(i.id)} onChange={() => toggle(i.id)} /> {i.name}</label>
            ))}
          </div>
        );
      })}
    </fieldset>
  );
}
