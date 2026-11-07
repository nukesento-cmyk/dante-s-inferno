import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkoutInputSchema, formatKes, type FulfilmentType, type PaymentMethod } from '@dantes/shared';
import { useCart, useSettings, useZones } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { quoteCart } from '../services/cart';
import { checkout } from '../services/orders';
import { rememberOrderPhone, rememberPaymentId } from '../services/session';
import { ApiError, issuesToFieldErrors } from '../lib/api';
import { closedReason, nextOpeningText } from '../lib/hours';
import { PhoneField } from '../components/PhoneField';
import { Empty, ErrorBox, Loading } from '../components/States';
import { useCartStore } from '../store/cartStore';

export default function Checkout() {
  useTitle('Checkout');
  const nav = useNavigate();
  const qc = useQueryClient();
  const token = useCartStore((s) => s.token);
  const { data: settings, isLoading: sLoading, error: sError } = useSettings();
  const { data: cart, isLoading: cLoading } = useCart();
  const { data: zones } = useZones();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fulfilment, setFulfilment] = useState<FulfilmentType | null>(null);
  const [zoneId, setZoneId] = useState('');
  const [line1, setLine1] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [mpesaPhone, setMpesaPhone] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const options = useMemo(() => {
    const o: FulfilmentType[] = [];
    if (settings?.deliveryEnabled) o.push('DELIVERY');
    if (settings?.collectionEnabled) o.push('COLLECTION');
    return o;
  }, [settings]);
  useEffect(() => {
    if (options.length && (!fulfilment || !options.includes(fulfilment))) setFulfilment(options[0]!);
  }, [options, fulfilment]);

  const zone = zones?.find((z) => z.id === zoneId);
  const hasItems = !!cart && cart.items.length > 0;
  const quoteEnabled = hasItems && !!fulfilment && (fulfilment === 'COLLECTION' || !!zoneId);
  const quote = useQuery({
    queryKey: ['quote', token, cart?.subtotalCents, fulfilment, zoneId],
    queryFn: () => quoteCart(fulfilment!, fulfilment === 'DELIVERY' ? zoneId : undefined),
    enabled: quoteEnabled,
  });
  const q = quoteEnabled ? quote.data : undefined;
  const belowMin = !!q?.problems.includes('BELOW_MINIMUM');
  const open = settings?.ordering.open ?? false;

  const submit = useMutation({
    mutationFn: checkout,
    onSuccess: (res, vars) => {
      rememberOrderPhone(res.order.reference, vars.customer.phone);
      rememberPaymentId(res.order.reference, res.payment.id);
      qc.invalidateQueries({ queryKey: ['cart'] });
      if (res.payment.method === 'CARD' && res.payment.redirectUrl) {
        window.location.assign(res.payment.redirectUrl);
        return;
      }
      nav(`/order/${res.order.reference}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(issuesToFieldErrors(e.issues));
        setFormError(e.message);
      } else setFormError('Something went wrong. Please try again.');
    },
  });

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const raw = {
      customer: { name: name.trim(), phone, email: email.trim() },
      fulfilment: fulfilment ?? undefined,
      deliveryZoneId: fulfilment === 'DELIVERY' ? zoneId || undefined : undefined,
      address:
        fulfilment === 'DELIVERY'
          ? { line1: line1.trim(), landmark: landmark.trim() || undefined, notes: notes.trim() || undefined }
          : undefined,
      paymentMethod: method,
      mpesaPhone: method === 'MPESA' ? (mpesaPhone ?? phone) : undefined,
    };
    const parsed = checkoutInputSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path.join('.');
        if (!(k in errs)) errs[k] = i.message;
      }
      setErrors(errs);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    submit.mutate(parsed.data);
  }

  if (sLoading || cLoading) return <div className="page container-x"><Loading /></div>;
  if (sError || !settings) return <div className="page container-x"><ErrorBox error={sError ?? new Error('Settings unavailable')} /></div>;
  if (!hasItems)
    return (
      <div className="page container-x">
        <Empty title="Your cart is empty"><Link to="/menu" className="btn btn-primary">Browse the menu</Link></Empty>
      </div>
    );

  const next = nextOpeningText(settings.ordering);
  const err = (k: string) => errors[k] ?? null;
  const freeLeft = q?.remainingForFreeDeliveryCents ?? null;

  return (
    <div className="page container-x">
      <h1>Checkout</h1>
      {!open && (
        <div className="notice notice-warn" role="alert">
          <strong>Ordering is closed right now.</strong> {closedReason(settings.ordering, settings.pauseMessage)}
          {next && <> We open again {next}.</>}
        </div>
      )}
      {options.length === 0 && <div className="notice notice-error" role="alert">Delivery and collection are both unavailable at the moment.</div>}
      <form className="split" onSubmit={onSubmit} noValidate>
        <div>
          <section className="panel group" aria-labelledby="h-you">
            <h2 id="h-you" style={{ fontSize: '1.1rem' }}>Your details</h2>
            <div className="field">
              <label htmlFor="co-name">Name</label>
              <input id="co-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err('customer.name')} />
              {err('customer.name') && <p className="err" role="alert">{err('customer.name')}</p>}
            </div>
            <PhoneField label="Phone" name="phone" value={phone} onChange={setPhone} error={err('customer.phone')} hint="We text you about your order." />
            <div className="field">
              <label htmlFor="co-email">Email (optional)</label>
              <input id="co-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err('customer.email')} />
              {err('customer.email') && <p className="err" role="alert">{err('customer.email')}</p>}
            </div>
          </section>

          <section className="panel group" aria-labelledby="h-ful">
            <h2 id="h-ful" style={{ fontSize: '1.1rem' }}>Delivery or collection</h2>
            <div className="chips" role="radiogroup" aria-label="Fulfilment">
              {options.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={fulfilment === o} className="chip" onClick={() => setFulfilment(o)}>
                  {o === 'DELIVERY' ? 'Delivery' : 'Collection'}
                </button>
              ))}
            </div>
            {fulfilment === 'COLLECTION' && <p className="muted mt-3">Collect from {settings.address}.</p>}
            {fulfilment === 'DELIVERY' && (
              <div className="mt-3">
                <div className="field">
                  <label htmlFor="co-zone">Delivery area</label>
                  <select id="co-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-invalid={!!err('deliveryZoneId')}>
                    <option value="">Choose your area…</option>
                    {zones?.map((z) => <option key={z.id} value={z.id}>{z.name} ({formatKes(z.feeCents)})</option>)}
                  </select>
                  {err('deliveryZoneId') && <p className="err" role="alert">{err('deliveryZoneId')}</p>}
                </div>
                {zone && (
                  <div className="notice" aria-live="polite">
                    <p style={{ margin: 0 }}>
                      Fee {q ? (q.deliveryFeeCents === 0 ? 'FREE' : formatKes(q.deliveryFeeCents)) : formatKes(zone.feeCents)} · Minimum order {formatKes(zone.minOrderCents)} · ETA {zone.etaMinMinutes}–{zone.etaMaxMinutes} min
                    </p>
                    {freeLeft !== null && freeLeft > 0 && <p style={{ margin: '6px 0 0' }}>Add {formatKes(freeLeft)} more for free delivery.</p>}
                    {zone.freeDeliveryFromCents !== null && freeLeft === null && q && <p style={{ margin: '6px 0 0' }}>You have free delivery.</p>}
                  </div>
                )}
                {belowMin && q && (
                  <div className="notice notice-warn" role="alert">
                    <p style={{ margin: 0 }}>
                      The minimum for {zone?.name ?? 'this area'} is {formatKes(zone?.minOrderCents ?? 0)}. Add {formatKes(q.shortfallToMinimumCents)} more
                      {settings.collectionEnabled ? ' or switch to collection.' : '.'}
                    </p>
                    <div className="chips mt-3">
                      <Link to="/menu" className="btn btn-ghost btn-sm">Add more pizza</Link>
                      {settings.collectionEnabled && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFulfilment('COLLECTION')}>Switch to collection</button>}
                    </div>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="co-line1">Address</label>
                  <input id="co-line1" autoComplete="street-address" value={line1} onChange={(e) => setLine1(e.target.value)} aria-invalid={!!(err('address.line1') || err('address'))} />
                  {(err('address.line1') || err('address')) && <p className="err" role="alert">{err('address.line1') ?? err('address')}</p>}
                </div>
                <div className="field">
                  <label htmlFor="co-landmark">Landmark (optional)</label>
                  <input id="co-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="co-notes">Delivery notes (optional)</label>
                  <textarea id="co-notes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </section>

          <section className="panel group" aria-labelledby="h-pay">
            <h2 id="h-pay" style={{ fontSize: '1.1rem' }}>Payment</h2>
            <div className="chips" role="radiogroup" aria-label="Payment method">
              <button type="button" role="radio" aria-checked={method === 'MPESA'} className="chip" onClick={() => setMethod('MPESA')}>M-Pesa</button>
              <button type="button" role="radio" aria-checked={method === 'CARD'} className="chip" onClick={() => setMethod('CARD')}>Card</button>
            </div>
            {method === 'MPESA' ? (
              <div className="mt-3">
                <PhoneField label="M-Pesa number" name="mpesa" value={mpesaPhone ?? phone} onChange={setMpesaPhone} error={err('mpesaPhone')} hint="You will get an STK prompt on this phone." />
              </div>
            ) : (
              <p className="muted mt-3">You will be redirected to our secure card payment page.</p>
            )}
          </section>
        </div>

        <aside className="panel sticky-panel" aria-label="Order summary">
          <h2 style={{ fontSize: '1.1rem' }}>Summary</h2>
          <ul className="plain" style={{ marginBottom: 12 }}>
            {cart.items.map((i) => (
              <li key={i.id} className="sum-row"><span>{i.quantity} × {i.productName} <span className="muted">({i.sizeName})</span></span><span>{formatKes(i.lineTotalCents)}</span></li>
            ))}
          </ul>
          <div className="sum-row"><span>Subtotal</span><span>{formatKes(q?.subtotalCents ?? cart.subtotalCents)}</span></div>
          {q ? (
            <>
              {fulfilment === 'DELIVERY' && <div className="sum-row"><span>Delivery</span><span>{q.deliveryFeeCents === 0 ? 'Free' : formatKes(q.deliveryFeeCents)}</span></div>}
              <div className="sum-row"><span>Packaging</span><span>{formatKes(q.packagingFeeCents)}</span></div>
              <div className="sum-row muted"><span>{settings.pricesIncludeVat ? 'Includes VAT' : 'VAT'}</span><span>{formatKes(q.vatCents)}</span></div>
              <div className="sum-row sum-total"><span>Total</span><span>{formatKes(q.totalCents)}</span></div>
            </>
          ) : (
            <p className="hint">{fulfilment === 'DELIVERY' && !zoneId ? 'Choose a delivery area to see your total.' : quote.isFetching ? 'Calculating…' : ''}</p>
          )}
          {quote.error && <ErrorBox error={quote.error} />}
          {formError && <p className="err" role="alert">{formError}</p>}
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 12 }} disabled={!open || submit.isPending || options.length === 0 || belowMin || !q}>
            {submit.isPending ? 'Placing order…' : method === 'MPESA' ? 'Place order & pay with M-Pesa' : 'Place order & pay by card'}
          </button>
          {!open && <p className="hint mt-3">Checkout is blocked while we are closed.</p>}
        </aside>
      </form>
    </div>
  );
}
