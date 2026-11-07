import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatKes, type OrderStatus, type PaymentMethod } from '@dantes/shared';
import { ApiError } from '../lib/api';
import { getOrder, getPaymentStatus, mockCompletePayment, retryPayment } from '../services/orders';
import { recallOrderPhone, recallPaymentId, rememberOrderPhone, rememberPaymentId } from '../services/session';
import { useSettings } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { validatePhoneInput } from '../lib/phone';
import { PhoneField } from '../components/PhoneField';
import { ErrorBox, Loading } from '../components/States';
import type { OrderPublic } from '../services/types';

const RANK: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0, PAYMENT_FAILED: 0, PAID: 1, ACCEPTED: 2, PREPARING: 3, READY: 4, OUT_FOR_DELIVERY: 5, COMPLETED: 6, CANCELLED: -1,
};

function steps(order: OrderPublic): { label: string; rank: number; at?: string }[] {
  const delivery = order.fulfilment === 'DELIVERY';
  const at = (s: OrderStatus) => order.history.find((h) => h.toStatus === s)?.createdAt;
  return [
    { label: 'Order placed', rank: 0, at: order.createdAt },
    { label: 'Payment received', rank: 1, at: at('PAID') },
    { label: 'Accepted by the kitchen', rank: 2, at: at('ACCEPTED') },
    { label: 'Being prepared', rank: 3, at: at('PREPARING') },
    delivery ? { label: 'Out for delivery', rank: 5, at: at('OUT_FOR_DELIVERY') } : { label: 'Ready for collection', rank: 4, at: at('READY') },
    { label: delivery ? 'Delivered' : 'Collected', rank: 6, at: at('COMPLETED') },
  ];
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '');

function PhoneLookup({ reference, onSubmit, failed }: { reference: string; onSubmit: (p: string) => void; failed: boolean }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  function go(e: FormEvent) {
    e.preventDefault();
    const r = validatePhoneInput(v);
    if (r.error || !r.value) return setErr(r.error);
    rememberOrderPhone(reference, r.value);
    onSubmit(r.value);
  }
  return (
    <form className="panel" onSubmit={go} style={{ maxWidth: 460 }} noValidate>
      <h2 style={{ fontSize: '1.1rem' }}>Find your order</h2>
      <p className="muted">Enter the phone number you used at checkout to view order {reference}.</p>
      {failed && <p className="err" role="alert">We could not find that order with this number.</p>}
      <PhoneField label="Phone" value={v} onChange={setV} error={err} />
      <button className="btn btn-primary" type="submit">View order</button>
    </form>
  );
}

export default function OrderPage() {
  const { reference = '' } = useParams();
  useTitle(`Order ${reference}`);
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [phone, setPhone] = useState<string | null>(() => recallOrderPhone(reference));
  const [paymentId, setPaymentId] = useState<string | null>(() => recallPaymentId(reference));
  const [retryMethod, setRetryMethod] = useState<PaymentMethod>('MPESA');
  const [retryPhone, setRetryPhone] = useState('');

  const orderQ = useQuery({ queryKey: ['order', reference, phone], queryFn: () => getOrder(reference, phone), retry: false });
  const order = orderQ.data;
  const unpaid = order?.status === 'PENDING_PAYMENT' || order?.status === 'PAYMENT_FAILED';

  const statusQ = useQuery({
    queryKey: ['pay-status', reference],
    queryFn: () => getPaymentStatus(reference),
    enabled: !!order,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED' ? false : 3000;
    },
  });
  const ps = statusQ.data;
  useEffect(() => {
    if (ps && order && ps.orderStatus !== order.status) qc.invalidateQueries({ queryKey: ['order', reference] });
  }, [ps, order, qc, reference]);
  useEffect(() => {
    if (ps?.paymentId) setPaymentId(ps.paymentId);
    else if (order?.paymentId) setPaymentId(order.paymentId);
  }, [ps?.paymentId, order?.paymentId]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['order', reference] });
    qc.invalidateQueries({ queryKey: ['pay-status', reference] });
  };
  const mock = useMutation({ mutationFn: (ok: boolean) => mockCompletePayment(paymentId!, ok), onSuccess: refreshAll });
  const retry = useMutation({
    mutationFn: () => {
      const r = validatePhoneInput(retryPhone || phone || '', { required: retryMethod === 'MPESA' });
      if (retryMethod === 'MPESA' && r.error) throw new Error(r.error);
      return retryPayment(reference, { method: retryMethod, mpesaPhone: retryMethod === 'MPESA' ? r.value ?? undefined : undefined });
    },
    onSuccess: (res) => {
      const p = res.payment ?? res;
      if (p.id) {
        setPaymentId(p.id);
        rememberPaymentId(reference, p.id);
      }
      if (p.redirectUrl) window.location.assign(p.redirectUrl);
      else refreshAll();
    },
  });

  if (orderQ.isLoading) return <div className="page container-x"><Loading label="Finding your order…" /></div>;
  if (orderQ.error || !order) {
    const e = orderQ.error;
    const lookupable = e instanceof ApiError && [400, 401, 403, 404].includes(e.status);
    return (
      <div className="page container-x">
        <h1>Order {reference}</h1>
        {lookupable ? <PhoneLookup reference={reference} failed={!!phone} onSubmit={(p) => setPhone(p)} /> : <ErrorBox error={e} onRetry={() => orderQ.refetch()} />}
      </div>
    );
  }

  const failed = order.status === 'PAYMENT_FAILED' || ps?.status === 'FAILED';
  const cancelled = order.status === 'CANCELLED';
  const waitingMpesa = order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'MPESA' && !failed;
  const paid = RANK[order.status] >= 1;
  const rank = RANK[order.status];
  const addr = typeof order.address === 'string' ? order.address : order.address ? [order.address.line1, order.address.landmark].filter(Boolean).join(', ') : '';

  return (
    <div className="page container-x">
      <p className="eyebrow">Order</p>
      <h1>{order.reference}</h1>

      <div role="status" aria-live="polite">
        {paid && !cancelled && <div className="notice notice-ok"><strong>Payment confirmed.</strong> Thank you! We are on it.</div>}
        {waitingMpesa && <div className="notice notice-warn"><strong>Check your phone for the M-Pesa prompt.</strong> Enter your PIN to pay {formatKes(order.totalCents)}. This page updates by itself.</div>}
        {order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'CARD' && <div className="notice notice-warn">Waiting for your card payment to be confirmed.</div>}
        {failed && !cancelled && <div className="notice notice-error"><strong>Payment failed.</strong> You can try again below.</div>}
        {cancelled && <div className="notice notice-error"><strong>This order was cancelled.</strong></div>}
      </div>

      {order.etaMinMinutes && paid && !cancelled && rank < 6 && <p className="muted">Estimated {order.fulfilment === 'DELIVERY' ? 'delivery' : 'ready'} in {order.etaMinMinutes}–{order.etaMaxMinutes} min.</p>}

      {settings?.paymentsMode === 'mock' && unpaid && (
        <div className="panel group" aria-label="Mock payment">
          <h3>Test payments (mock mode)</h3>
          <div className="chips">
            <button type="button" className="btn btn-primary btn-sm" disabled={!paymentId || mock.isPending} onClick={() => mock.mutate(true)}>Simulate success</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!paymentId || mock.isPending} onClick={() => mock.mutate(false)}>Simulate failure</button>
          </div>
          {!paymentId && <p className="hint">No payment id known for this order in this browser session.</p>}
          {mock.error && <ErrorBox error={mock.error} />}
        </div>
      )}

      <div className="split">
        <div>
          <section className="panel group" aria-labelledby="h-status">
            <h2 id="h-status" style={{ fontSize: '1.1rem' }}>Status</h2>
            <ol className="timeline">
              {steps(order).map((s) => {
                const done = !cancelled && rank >= s.rank && !(s.rank === 1 && failed && rank < 1);
                const current = done && (rank === s.rank || (s.rank === 4 && rank === 4));
                return (
                  <li key={s.label} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`} aria-current={current ? 'step' : undefined}>
                    {s.label} {done && s.at && <span className="muted">· {time(s.at)}</span>}
                  </li>
                );
              })}
            </ol>
          </section>

          {unpaid && (
            <section className="panel group" aria-labelledby="h-retry">
              <h2 id="h-retry" style={{ fontSize: '1.1rem' }}>{failed ? 'Retry payment' : 'Change payment method'}</h2>
              <div className="chips" role="radiogroup" aria-label="Payment method">
                <button type="button" role="radio" aria-checked={retryMethod === 'MPESA'} className="chip" onClick={() => setRetryMethod('MPESA')}>M-Pesa</button>
                <button type="button" role="radio" aria-checked={retryMethod === 'CARD'} className="chip" onClick={() => setRetryMethod('CARD')}>Card</button>
              </div>
              {retryMethod === 'MPESA' && <div className="mt-3"><PhoneField label="M-Pesa number" value={retryPhone || phone || ''} onChange={setRetryPhone} /></div>}
              {retry.error && <ErrorBox error={retry.error} />}
              <button type="button" className="btn btn-primary" onClick={() => retry.mutate()} disabled={retry.isPending}>
                {retry.isPending ? 'Starting payment…' : 'Pay now'}
              </button>
            </section>
          )}
        </div>

        <aside className="panel" aria-labelledby="h-receipt">
          <h2 id="h-receipt" style={{ fontSize: '1.1rem' }}>Receipt</h2>
          <p className="muted">{order.fulfilment === 'DELIVERY' ? `Delivery${order.zoneName ? ' to ' + order.zoneName : ''}${addr ? ' · ' + addr : ''}` : 'Collection'}</p>
          <table className="table-lines">
            <tbody>
              {order.items.map((i, idx) => {
                const tops = Array.isArray(i.toppings) ? i.toppings.join(', ') : i.toppings;
                return (
                  <tr key={idx}>
                    <td>
                      {i.quantity} × {i.productName}
                      <div className="muted" style={{ fontSize: '.8rem' }}>{i.sizeName} · {i.crustName}{tops ? ` · ${tops}` : ''}</div>
                    </td>
                    <td>{formatKes(i.lineTotalCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="sum-row mt-3"><span>Subtotal</span><span>{formatKes(order.subtotalCents)}</span></div>
          {order.fulfilment === 'DELIVERY' && <div className="sum-row"><span>Delivery</span><span>{order.deliveryFeeCents ? formatKes(order.deliveryFeeCents) : 'Free'}</span></div>}
          <div className="sum-row"><span>Packaging</span><span>{formatKes(order.packagingFeeCents)}</span></div>
          <div className="sum-row muted"><span>VAT</span><span>{formatKes(order.vatCents)}</span></div>
          <div className="sum-row sum-total"><span>Total</span><span>{formatKes(order.totalCents)}</span></div>
          <p className="hint">Paid by {order.paymentMethod === 'CARD' ? 'card' : order.paymentMethod === 'MPESA' ? 'M-Pesa' : 'pending'} · Placed {new Date(order.createdAt).toLocaleString('en-KE')}</p>
          <Link to="/menu" className="btn btn-ghost btn-sm">Order again</Link>
        </aside>
      </div>
    </div>
  );
}
