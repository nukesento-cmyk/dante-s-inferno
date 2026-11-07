import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatKes } from '@dantes/shared';
import { dashboardApi } from '../api/endpoints';
import type { Overview } from '../api/types';
import { Async, Card, EmptyState, PageHeader, Table, Td, Th } from '../components/ui';
import { fmtDate, todayISO } from '../lib/format';

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${accent ? 'border-brand/40 bg-cream' : 'border-zinc-200 bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-graphite">{value}</div>
    </div>
  );
}

export function OverviewPage() {
  const from = todayISO(-13);
  const to = todayISO();
  const q = useQuery({ queryKey: ['overview', from, to], queryFn: () => dashboardApi.overview({ from, to }), refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="Overview" subtitle="Today's operations at a glance" />
      <Async q={q}>
        {(o: Overview) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="Orders today" value={String(o.ordersToday)} />
              <Kpi label="Revenue today" value={formatKes(o.revenueTodayCents)} accent />
              <Kpi label="Active orders" value={String(o.activeOrders)} />
              <Kpi label="Pending payments" value={String(o.pendingPayments)} />
              <Kpi label="Avg order value" value={formatKes(o.avgOrderValueCents)} />
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card title="Revenue by day (last 14 days)" className="xl:col-span-2">
                {o.revenueByDay.length === 0 ? (
                  <EmptyState title="No revenue yet" hint="Paid orders will appear here." />
                ) : (
                  <div className="h-72" role="img" aria-label="Bar chart of revenue per day">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={o.revenueByDay.map((d) => ({ ...d, revenue: d.revenueCents / 100 }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                        <Tooltip formatter={(v) => formatKes(Math.round(Number(v) * 100))} labelFormatter={(l) => fmtDate(String(l))} />
                        <Bar dataKey="revenue" name="Revenue" fill="#FF6A00" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card title="Top products">
                {o.topProducts.length === 0 ? (
                  <EmptyState title="No sales yet" />
                ) : (
                  <Table className="">
                    <thead>
                      <tr>
                        <Th>Product</Th>
                        <Th className="text-right">Qty</Th>
                        <Th className="text-right">Revenue</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.topProducts.map((p) => (
                        <tr key={p.name}>
                          <Td>{p.name}</Td>
                          <Td className="text-right tabular-nums">{p.quantity}</Td>
                          <Td className="text-right tabular-nums">{formatKes(p.revenueCents)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
