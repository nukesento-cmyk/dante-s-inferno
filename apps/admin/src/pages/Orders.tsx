import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { formatKes, formatKenyanPhone, ORDER_STATUSES, PAYMENT_STATUSES, type OrderStatus } from '@dantes/shared';
import { ordersApi } from '../api/endpoints';
import type { OrderDetail, OrderItem, OrderSummary } from '../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, ErrorState, Input, Loading, PageHeader, Select, Table, Tabs, Td, Th, cx } from '../components/ui';
import { StatusActions, statusTone } from '../components/StatusActions';
import { useMe } from '../lib/auth';
import { fmtDateTime, humanize, todayISO, toList } from '../lib/format';
import { useAction, useDebounced } from '../lib/hooks';
import { playNewOrderSound } from '../store/sound';
import { toast } from '../store/toast';

type Tab = 'new' | 'active' | 'history';
const TAB_STATUSES: Record<Tab, OrderStatus[]> = {
  new: ['PAID'],
  active: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
  history: ['COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'PENDING_PAYMENT'],
};

function customerOf(o: OrderSummary) {
  return { name: o.customerName ?? o.customer?.name ?? '—', phone: o.customerPhone ?? o.customer?.phone ?? '' };
}

/** SSE live updates with a polling fallback handled by react-query's refetchInterval. */
function useOrderStream(onCreated: (ref?: string) => void) {
  const qc = useQueryClient();
  const cb = useRef(onCreated);
  cb.current = onCreated;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(ordersApi.streamUrl, { withCredentials: true });
    const refresh = () => void qc.invalidateQueries({ queryKey: ['orders'] });
    es.addEventListener('order.created', (e) => {
      let ref: string | undefined;
      try {
        ref = (JSON.parse((e as MessageEvent).data) as { reference?: string }).reference;
      } catch {
        /* payload optional */
      }
      refresh();
      cb.current(ref);
    });
    es.addEventListener('order.updated', refresh);
    return () => es.close();
  }, [qc]);
}

export function OrdersPage() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>(me.role === 'KITCHEN' ? 'active' : 'new');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const q = useDebounced(search);

  useOrderStream((ref) => {
    playNewOrderSound();
    toast.info(ref ? `New order ${ref}` : 'New order received');
    if (ref) {
      setFresh((s) => new Set(s).add(ref));
      setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(ref); return n; }), 8000);
    }
  });

  const statusParam = status || TAB_STATUSES[tab].join(',');
  const query = useQuery({
    queryKey: ['orders', { statusParam, payment, from, to, q, page }],
    queryFn: () => ordersApi.list({ status: statusParam, payment, from, to, q, page }),
    refetchInterval: 20_000,
    placeholderData: (prev) => prev,
  });
  const rows = query.data ? toList<OrderSummary>(query.data) : [];
  const total = query.data && !Array.isArray(query.data) ? query.data.total : rows.length;
  const pageSize = query.data && !Array.isArray(query.data) ? query.data.pageSize : rows.length || 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader title="Orders" subtitle="Live feed — updates arrive automatically" />
      <Tabs
        label="Order queues"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setStatus('');
          reset();
        }}
        tabs={[
          { key: 'new', label: 'New' },
          { key: 'active', label: 'Active' },
          { key: 'history', label: 'History' },
        ]}
      />
      <div className="my-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input aria-label="Search orders" className="lg:col-span-2" placeholder="Search reference, name or phone" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} />
        <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="">All in this tab</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </Select>
        <Select aria-label="Filter by payment" value={payment} onChange={(e) => { setPayment(e.target.value); reset(); }}>
          <option value="">Any payment</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </Select>
        <Input aria-label="From date" type="date" value={from} max={todayISO()} onChange={(e) => { setFrom(e.target.value); reset(); }} />
        <Input aria-label="To date" type="date" value={to} max={todayISO()} onChange={(e) => { setTo(e.target.value); reset(); }} />
      </div>
      <Card className="!p-0">
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No orders here" hint="Try another tab or clear the filters." /></div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th><Th>Time</Th><Th>Customer</Th><Th>Type</Th><Th>Status</Th><Th>Payment</Th><Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const c = customerOf(o);
                return (
                  <tr key={o.id} className={cx('cursor-pointer hover:bg-zinc-50', fresh.has(o.reference) && 'row-new')} onClick={() => setOpenId(o.id)}>
                    <Td>
                      <button className="font-semibold text-brand hover:underline" onClick={(e) => { e.stopPropagation(); setOpenId(o.id); }}>{o.reference}</button>
                    </Td>
                    <Td>{fmtDateTime(o.createdAt)}</Td>
                    <Td>{c.name}<div className="text-xs text-zinc-500">{c.phone && formatKenyanPhone(c.phone)}</div></Td>
                    <Td>{humanize(o.fulfilment)}</Td>
                    <Td><Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge></Td>
                    <Td>{o.paymentStatus ? <Badge tone={statusTone(o.paymentStatus)}>{humanize(o.paymentStatus)}</Badge> : '—'}</Td>
                    <Td className="text-right tabular-nums">{formatKes(o.totalCents)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      <OrderDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function toppingLines(i: OrderItem): string[] {
  const out: string[] = [];
  i.toppings?.forEach((t) => out.push(typeof t === 'string' ? t : `${t.kind === 'removed' ? 'No ' : '+ '}${t.name}${t.surchargeCents ? ` (${formatKes(t.surchargeCents)})` : ''}`));
  i.addedToppings?.forEach((t) => out.push(`+ ${t.name}${t.surchargeCents ? ` (${formatKes(t.surchargeCents)})` : ''}`));
  i.removedToppings?.forEach((t) => out.push(`No ${t.name}`));
  return out;
}

function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const me = useMe();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => ordersApi.get(id!), enabled: !!id, refetchInterval: 20_000 });
  const [pending, setPending] = useState<{ status: OrderStatus; note: string } | null>(null);
  const m = useAction((v: { status: OrderStatus; note: string }) => ordersApi.setStatus(id!, v.status, v.note), {
    success: 'Order status updated',
    invalidate: [['orders'], ['order', id], ['overview']],
    onSuccess: () => setPending(null),
  });
  return (
    <Drawer open={!!id} onClose={onClose} title={q.data ? `Order ${q.data.reference}` : 'Order'}>
      <Async q={q}>
        {(o: OrderDetail) => (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
              <Badge>{humanize(o.fulfilment)}</Badge>
              <span className="text-zinc-500">{fmtDateTime(o.createdAt)}</span>
            </div>
            <section aria-label="Update status" className="rounded-lg bg-cream p-3">
              <h3 className="mb-2 font-semibold">Update status</h3>
              <StatusActions status={o.status} role={me.role} busy={m.isPending} onChange={(status, note) => (status === 'CANCELLED' ? setPending({ status, note }) : m.mutate({ status, note }))} />
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Items</h3>
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {o.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 p-3">
                    <div>
                      <div className="font-medium">{i.quantity} × {i.productName} <span className="text-zinc-500">{[i.sizeName, i.crustName].filter(Boolean).join(' · ')}</span></div>
                      {toppingLines(i).map((t, k) => (<div key={k} className="text-xs text-zinc-600">{t}</div>))}
                      {i.notes && <div className="text-xs italic text-tomato">Note: {i.notes}</div>}
                    </div>
                    <div className="text-right tabular-nums">{formatKes(i.lineTotalCents)}<div className="text-xs text-zinc-500">{formatKes(i.unitPriceCents)} ea</div></div>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-1 tabular-nums">
                {([['Subtotal', o.subtotalCents], ['Delivery', o.deliveryFeeCents], ['Packaging', o.packagingFeeCents]] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt>{k}</dt><dd>{formatKes(v ?? 0)}</dd></div>
                ))}
                <div className="flex justify-between text-zinc-500"><dt>VAT (included in total)</dt><dd>{formatKes(o.vatCents ?? 0)}</dd></div>
                <div className="flex justify-between border-t border-zinc-200 pt-1 text-base font-bold"><dt>Total</dt><dd>{formatKes(o.totalCents)}</dd></div>
              </dl>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Customer</h3>
              <p>{customerOf(o).name}</p>
              <p className="text-zinc-600">{customerOf(o).phone && formatKenyanPhone(customerOf(o).phone)} {o.customer?.email && `· ${o.customer.email}`}</p>
              {o.fulfilment === 'DELIVERY' && (
                <p className="mt-1 text-zinc-700">
                  {o.address?.line1}{o.address?.landmark && `, near ${o.address.landmark}`}{o.zoneName && ` — Zone: ${o.zoneName}`}
                  {o.address?.notes && <span className="block text-xs italic">{o.address.notes}</span>}
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Payments</h3>
              {o.payments?.length ? (
                <ul className="space-y-1">
                  {o.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded border border-zinc-200 px-3 py-1.5">
                      <span>{humanize(p.method)} <Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge>{p.providerRef && <span className="ml-2 text-xs text-zinc-500">{p.providerRef}</span>}</span>
                      <span className="tabular-nums">{formatKes(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-zinc-500">No payments recorded.</p>}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Status history</h3>
              {o.history?.length ? (
                <ol className="space-y-1 border-l-2 border-brand/40 pl-3">
                  {o.history.map((h, k) => (
                    <li key={k}><span className="font-medium">{humanize(h.toStatus)}</span> <span className="text-zinc-500">{fmtDateTime(h.createdAt)}{h.actorName && ` · ${h.actorName}`}</span>{h.note && <div className="text-xs text-zinc-600">{h.note}</div>}</li>
                  ))}
                </ol>
              ) : <p className="text-zinc-500">No history.</p>}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Notifications</h3>
              {o.notifications?.length ? (
                <ul className="space-y-1">
                  {o.notifications.map((n, k) => (
                    <li key={n.id ?? k} className="flex justify-between text-xs"><span>{humanize(n.channel)} · {humanize(n.event)}{n.recipient && ` → ${n.recipient}`}</span><Badge tone={n.status === 'SENT' ? 'green' : n.status === 'FAILED' ? 'red' : 'gray'}>{humanize(n.status)}</Badge></li>
                  ))}
                </ul>
              ) : <p className="text-zinc-500">No notifications sent.</p>}
            </section>
            <ConfirmDialog open={!!pending} danger title="Cancel this order?" message={`Order ${o.reference} will be cancelled. This cannot be undone.`} confirmLabel="Cancel order" loading={m.isPending} onCancel={() => setPending(null)} onConfirm={() => pending && m.mutate(pending)} />
          </div>
        )}
      </Async>
    </Drawer>
  );
}
