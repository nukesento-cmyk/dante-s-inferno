import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { formatKes } from '@dantes/shared';
import { pricingApi } from '../../api/endpoints';
import type { PricingPayload } from '../../api/types';
import { Async, Button, Card, Input, MoneyInput, Table, Td, Th, Toggle } from '../../components/ui';
import { bpsToPercent, centsToKes, kesToCents, percentToBps } from '../../lib/money';
import { useAction } from '../../lib/hooks';

export interface PricingDraft {
  products: { id: string; name: string; prices: Record<string, string> }[];
  crusts: { id: string; name: string; adj: Record<string, string> }[];
  groups: { id: string; name: string; surcharge: string }[];
  ingredients: { id: string; name: string; groupId: string; surcharge: string }[];
  vatPercent: string;
  pricesIncludeVat: boolean;
  packaging: string;
}

export function toDraft(p: PricingPayload): PricingDraft {
  return {
    products: p.products.map((x) => ({ id: x.id, name: x.name, prices: Object.fromEntries(p.sizes.map((s) => [s.id, centsToKes(x.prices.find((y) => y.sizeId === s.id)?.priceCents)])) })),
    crusts: p.crusts.map((x) => ({ id: x.id, name: x.name, adj: Object.fromEntries(p.sizes.map((s) => [s.id, centsToKes(x.adjustments.find((y) => y.sizeId === s.id)?.adjustmentCents ?? 0)])) })),
    groups: p.toppingGroups.map((g) => ({ id: g.id, name: g.name, surcharge: centsToKes(g.surchargeCents) })),
    ingredients: p.ingredients.map((i) => ({ id: i.id, name: i.name, groupId: i.groupId, surcharge: centsToKes(i.surchargeCents) })),
    vatPercent: bpsToPercent(p.settings.vatRateBps),
    pricesIncludeVat: p.settings.pricesIncludeVat,
    packaging: centsToKes(p.settings.packagingFeeCents),
  };
}

/** Returns the PUT payload, or the set of invalid cell keys. */
export function toPayload(d: PricingDraft, sizes: PricingPayload['sizes']): { payload?: Partial<PricingPayload>; invalid: Set<string> } {
  const invalid = new Set<string>();
  const money = (key: string, v: string, blankIs: number | null | 'invalid') => {
    if (v.trim() === '') {
      if (blankIs === 'invalid') invalid.add(key);
      return blankIs === 'invalid' ? 0 : blankIs;
    }
    const c = kesToCents(v);
    if (c === null) invalid.add(key);
    return c ?? 0;
  };
  const products = d.products.map((p) => ({
    id: p.id,
    name: p.name,
    prices: sizes.flatMap((s) => {
      const v = p.prices[s.id] ?? '';
      return v.trim() === '' ? [] : [{ sizeId: s.id, priceCents: money(`p:${p.id}:${s.id}`, v, 'invalid') as number }];
    }),
  }));
  const crusts = d.crusts.map((c) => ({ id: c.id, name: c.name, adjustments: sizes.map((s) => ({ sizeId: s.id, adjustmentCents: money(`c:${c.id}:${s.id}`, c.adj[s.id] ?? '', 0) as number })) }));
  const toppingGroups = d.groups.map((g) => ({ id: g.id, name: g.name, surchargeCents: money(`g:${g.id}`, g.surcharge, 'invalid') as number }));
  const ingredients = d.ingredients.map((i) => ({ id: i.id, name: i.name, groupId: i.groupId, surchargeCents: money(`i:${i.id}`, i.surcharge, null) as number | null }));
  const bps = percentToBps(d.vatPercent);
  if (bps === null || bps > 5000) invalid.add('vat');
  const packagingFeeCents = money('packaging', d.packaging, 0) as number;
  if (invalid.size) return { invalid };
  return { invalid, payload: { products, crusts, toppingGroups, ingredients, settings: { vatRateBps: bps!, pricesIncludeVat: d.pricesIncludeVat, packagingFeeCents } } };
}

export function PricingTab({ readOnly }: { readOnly: boolean }) {
  const q = useQuery({ queryKey: ['pricing'], queryFn: pricingApi.get });
  return <Async q={q}>{(p) => <PricingEditor data={p} readOnly={readOnly} />}</Async>;
}

function PricingEditor({ data, readOnly }: { data: PricingPayload; readOnly: boolean }) {
  const baseline = useMemo(() => toDraft(data), [data]);
  const [draft, setDraft] = useState<PricingDraft>(baseline);
  const [showErrors, setShowErrors] = useState(false);
  useEffect(() => { setDraft(baseline); setShowErrors(false); }, [baseline]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const { invalid, payload } = useMemo(() => toPayload(draft, data.sizes), [draft, data.sizes]);
  const save = useAction((b: unknown) => pricingApi.put(b), { success: 'Pricing saved', invalidate: [['pricing'], ['products'], ['crusts'], ['ingredients'], ['topping-groups']] });
  const err = (k: string) => showErrors && invalid.has(k);

  function onSave() {
    setShowErrors(true);
    if (payload) save.mutate(payload);
  }
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (fn: (d: PricingDraft) => void) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; });
  const cell = (key: string, value: string, onChange: (v: string) => void, label: string) => (
    <MoneyInput aria-label={label} aria-invalid={err(key)} className={err(key) ? '!border-tomato' : ''} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <fieldset disabled={readOnly || save.isPending} className="space-y-4 pb-20">
      <Card title="Pizza prices (KES, per size)">
        <p className="mb-2 text-xs text-zinc-500">Leave a cell blank if the product is not sold in that size.</p>
        <Table>
          <thead><tr><Th>Product</Th>{data.sizes.map((s) => <Th key={s.id} className="text-right">{s.name}{s.inches ? ` (${s.inches}")` : ''}</Th>)}</tr></thead>
          <tbody>
            {draft.products.map((p, pi) => (
              <tr key={p.id}><Td className="font-medium">{p.name}</Td>
                {data.sizes.map((s) => <Td key={s.id} className="min-w-32">{cell(`p:${p.id}:${s.id}`, p.prices[s.id] ?? '', (v) => set((d) => { d.products[pi]!.prices[s.id] = v; }), `${p.name} ${s.name} price`)}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Crust price adjustments (added to the pizza price, per size)">
        <Table>
          <thead><tr><Th>Crust</Th>{data.sizes.map((s) => <Th key={s.id} className="text-right">{s.name}</Th>)}</tr></thead>
          <tbody>
            {draft.crusts.map((c, ci) => (
              <tr key={c.id}><Td className="font-medium">{c.name}</Td>
                {data.sizes.map((s) => <Td key={s.id} className="min-w-32">{cell(`c:${c.id}:${s.id}`, c.adj[s.id] ?? '', (v) => set((d) => { d.crusts[ci]!.adj[s.id] = v; }), `${c.name} ${s.name} adjustment`)}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Topping surcharges">
        <p className="mb-2 text-xs text-zinc-500">Each group sets a price. Override an ingredient to charge differently; leave blank to use the group price.</p>
        <div className="space-y-3">
          {draft.groups.map((g, gi) => (
            <details key={g.id} className="rounded-lg border border-zinc-200" open>
              <summary className="cursor-pointer bg-zinc-50 px-3 py-2 font-semibold">{g.name}</summary>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2 text-sm">
                <span>Group price (default for every ingredient below)</span>
                <span className="w-44">{cell(`g:${g.id}`, g.surcharge, (v) => set((d) => { d.groups[gi]!.surcharge = v; }), `${g.name} group surcharge`)}</span>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {draft.ingredients.map((i, ii) => i.groupId !== g.id ? null : (
                  <label key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{i.name}</span>
                    <span className="w-36">
                      <MoneyInput aria-label={`${i.name} surcharge override`} placeholder={centsToKes(kesToCents(g.surcharge)) || 'group'} aria-invalid={err(`i:${i.id}`)} className={err(`i:${i.id}`) ? '!border-tomato' : ''} value={i.surcharge} onChange={(e) => set((d) => { d.ingredients[ii]!.surcharge = e.target.value; })} />
                    </span>
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Packaging & VAT">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
          <label className="block text-xs font-semibold uppercase text-zinc-600">Packaging fee
            <div className="mt-1">{cell('packaging', draft.packaging, (v) => set((d) => { d.packaging = v; }), 'Packaging fee')}</div>
            <span className="font-normal normal-case text-zinc-500">0 = disabled</span></label>
          <label className="block text-xs font-semibold uppercase text-zinc-600">VAT rate (%)
            <Input className={`mt-1 ${err('vat') ? '!border-tomato' : ''}`} inputMode="decimal" value={draft.vatPercent} aria-invalid={err('vat')} onChange={(e) => set((d) => { d.vatPercent = e.target.value; })} />
            {err('vat') && <span role="alert" className="font-normal normal-case text-tomato">Enter 0–50</span>}</label>
          <div className="flex items-end gap-2"><Toggle label="Menu prices include VAT" checked={draft.pricesIncludeVat} onChange={(v) => set((d) => { d.pricesIncludeVat = v; })} /><span className="pb-1 text-sm">Prices include VAT</span></div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Packaging currently {formatKes(data.settings.packagingFeeCents)}. Delivery fees are managed under Delivery.</p>
      </Card>

      {dirty && !readOnly && (
        <div role="region" aria-label="Unsaved changes" className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-brand bg-graphite px-6 py-3 text-white lg:left-60">
          <span>{showErrors && invalid.size ? `${invalid.size} field(s) need fixing before you can save.` : 'You have unsaved pricing changes.'}</span>
          <span className="flex gap-2">
            <Button onClick={() => { setDraft(baseline); setShowErrors(false); }} disabled={save.isPending}>Discard</Button>
            <Button variant="primary" onClick={onSave} loading={save.isPending}>Save all prices</Button>
          </span>
        </div>
      )}
    </fieldset>
  );
}
