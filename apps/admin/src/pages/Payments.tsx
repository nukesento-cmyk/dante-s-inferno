import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatKes, PAYMENT_METHODS, PAYMENT_STATUSES } from '@dantes/shared';
import { paymentsApi } from '../api/endpoints';
import type { PaymentRow } from '../api/types';
import { Pager, pageInfo } from '../components/Pager';
import { statusTone } from '../components/StatusActions';
import { Async, Badge, Card, Drawer, EmptyState, ErrorState, Input, Loading, PageHeader, Select, Table, Tabs, Td, Th } from '../components/ui';
import { fmtDateTime, humanize, todayISO } from '../lib/format';
import { useDebounced } from '../lib/hooks';

export function PaymentsPage() {
  const [tab, setTab] = useState<'list' | 'recon'>('list');
  return (
    <>
      <PageHeader title="Payments" subtitle="Provider records, raw events and daily reconciliation" />
      <Tabs label="Payments sections" value={tab} onChange={setTab} tabs={[{ key: 'list', label: 'All payments' }, { key: 'recon', label: 'Reconciliation' }]} />
      <div className="mt-4">{tab === 'list' ? <PaymentList /> : <Recon />}</div>
    </>
  );
}

function PaymentList() {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['payments', { status, method, from, to, q, page }], queryFn: () => paymentsApi.list({ status, method, from, to, q, page }), placeholderData: (p) => p });
  const { rows, pages } = pageInfo<PaymentRow>(query.data);
  const r = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input aria-label="Search payments" placeholder="Search reference or provider ID" value={search} onChange={(e) => r(setSearch)(e.target.value)} />
        <Select aria-label="Status" value={status} onChange={(e) => r(setStatus)(e.target.value)}><option value="">Any status</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Select aria-label="Method" value={method} onChange={(e) => r(setMethod)(e.target.value)}><option value="">Any method</option>{PAYMENT_METHODS.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Input aria-label="From date" type="date" value={from} onChange={(e) => r(setFrom)(e.target.value)} />
        <Input aria-label="To date" type="date" value={to} onChange={(e) => r(setTo)(e.target.value)} />
      </div>
      <Card className="!p-0">
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : rows.length === 0 ? <div className="p-4"><EmptyState title="No payments match" /></div> : (
          <Table>
            <thead><tr><Th>Time</Th><Th>Order</Th><Th>Method</Th><Th>Status</Th><Th>Provider ref</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setOpen(p.id)}>
                  <Td>{fmtDateTime(p.createdAt)}</Td>
                  <Td><button className="font-semibold text-brand hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(p.id); }}>{p.orderReference ?? p.id.slice(0, 8)}</button></Td>
                  <Td>{humanize(p.method)}</Td><Td><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></Td>
                  <Td className="text-xs text-zinc-500">{p.providerRef ?? '—'}</Td><Td className="text-right tabular-nums">{formatKes(p.amountCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Pager page={page} pages={pages} onPage={setPage} />
      <PaymentDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function PaymentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => paymentsApi.get(id!), enabled: !!id });
  return (
    <Drawer open={!!id} onClose={onClose} title="Payment detail">
      <Async q={q}>
        {(p) => (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-zinc-500">Order</dt><dd>{p.orderReference ?? '—'}</dd>
              <dt className="text-zinc-500">Method</dt><dd>{humanize(p.method)}</dd>
              <dt className="text-zinc-500">Status</dt><dd><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></dd>
              <dt className="text-zinc-500">Amount</dt><dd className="tabular-nums">{formatKes(p.amountCents)}</dd>
              <dt className="text-zinc-500">Provider ref</dt><dd>{p.providerRef ?? '—'}</dd>
              <dt className="text-zinc-500">Created</dt><dd>{fmtDateTime(p.createdAt)}</dd>
            </dl>
            <h3 className="font-semibold">Raw provider events</h3>
            {p.events?.length ? p.events.map((e) => (
              <details key={e.id} className="rounded border border-zinc-200 p-2">
                <summary className="cursor-pointer">{e.type ?? 'event'} <span className="text-xs text-zinc-500">{fmtDateTime(e.createdAt)}</span></summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-graphite p-2 text-xs text-zinc-100">{JSON.stringify(e.payload ?? e, null, 2)}</pre>
              </details>
            )) : <p className="text-zinc-500">No events recorded.</p>}
          </div>
        )}
      </Async>
    </Drawer>
  );
}

function Recon() {
  const [date, setDate] = useState(todayISO());
  const q = useQuery({ queryKey: ['recon', date], queryFn: () => paymentsApi.reconciliation(date) });
  return (
    <div className="space-y-4">
      <div className="max-w-xs"><label className="mb-1 block text-xs font-semibold uppercase text-zinc-600" htmlFor="recon-date">Date</label><Input id="recon-date" type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
      <Async q={q}>
        {(r) => (
          <>
            <Card title="Totals by method">
              {r.byMethod.length === 0 ? <EmptyState title="No payments on this date" /> : (
                <Table><thead><tr><Th>Method</Th><Th className="text-right">Payments</Th><Th className="text-right">Amount</Th></tr></thead>
                  <tbody>{r.byMethod.map((m) => <tr key={m.method}><Td>{humanize(m.method)}</Td><Td className="text-right">{m.count}</Td><Td className="text-right tabular-nums">{formatKes(m.amountCents)}</Td></tr>)}
                    <tr className="font-bold"><Td>Total</Td><Td className="text-right">{r.byMethod.reduce((a, m) => a + m.count, 0)}</Td><Td className="text-right tabular-nums">{formatKes(r.byMethod.reduce((a, m) => a + m.amountCents, 0))}</Td></tr></tbody></Table>
              )}
            </Card>
            <Card title={`Unmatched payments (${r.unmatched.length})`}>
              {r.unmatched.length === 0 ? <p className="text-zinc-500">Everything matches.</p> : <ul className="space-y-1">{r.unmatched.map((p) => <li key={p.id} className="flex justify-between"><span>{humanize(p.method)} · {p.providerRef ?? p.id} · {humanize(p.status)}</span><span className="tabular-nums">{formatKes(p.amountCents)}</span></li>)}</ul>}
            </Card>
            <Card title={`Paid orders without a payment (${r.paidOrdersWithoutPayment.length})`}>
              {r.paidOrdersWithoutPayment.length === 0 ? <p className="text-zinc-500">None.</p> : <ul className="space-y-1">{r.paidOrdersWithoutPayment.map((o, i) => <li key={o.id ?? i} className="flex justify-between"><span>{o.reference ?? o.id}</span><span className="tabular-nums">{o.totalCents !== undefined && formatKes(o.totalCents)}</span></li>)}</ul>}
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}
