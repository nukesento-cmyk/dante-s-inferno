import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatKes } from '@dantes/shared';
import { useMenu, useSettings } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { addCartItem } from '../services/cart';
import { crustsForSize, maxExtras, previewPrice } from '../customizer/preview';
import { hasWebGL } from '../lib/webgl';
import { optimizedImage, fallbackToOriginal } from '../lib/images';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ErrorBox, Loading } from '../components/States';

// three.js is only loaded here and on the homepage.
const CustomizerView = lazy(() => import('../customizer/CustomizerView'));

export default function Customize() {
  const { productId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: menu, isLoading, error, refetch } = useMenu();
  const { data: settings } = useSettings();
  const product = menu?.products.find((p) => p.id === productId);
  useTitle(product ? `Customise ${product.name}` : 'Customise');

  const [sizeId, setSizeId] = useState('');
  const [crustId, setCrustId] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const webgl = useMemo(() => hasWebGL(), []);

  const sizes = useMemo(() => (menu && product ? menu.sizes.filter((s) => product.prices.some((p) => p.sizeId === s.id)) : []), [menu, product]);
  useEffect(() => {
    if (sizes.length && !sizes.some((s) => s.id === sizeId)) setSizeId((sizes.find((s) => s.code === 'M') ?? sizes[0]!).id);
  }, [sizes, sizeId]);

  const crusts = useMemo(() => (menu && sizeId ? crustsForSize(menu.crusts, sizeId) : []), [menu, sizeId]);
  const crust = crusts.find((c) => c.id === crustId) ?? crusts[0];

  const addAllowed = product ? maxExtras(product, settings?.defaultMaxExtraToppings ?? 3) : 0;
  const addedIngs = product?.extraIngredients.filter((i) => added.includes(i.id)) ?? [];
  const activeDefaults = product?.defaultIngredients.filter((i) => !removed.includes(i.id)) ?? [];
  const toppings = useMemo(() => [...activeDefaults, ...addedIngs].map((i) => ({ modelKey: i.modelKey, color: i.color })), [activeDefaults, addedIngs]);
  const size = sizes.find((s) => s.id === sizeId);

  const price = product && sizeId ? previewPrice({ product, sizeId, crust, added: addedIngs, quantity: qty }) : null;

  const add = useMutation({
    mutationFn: () =>
      addCartItem({
        productId: product!.id,
        sizeId,
        crustId: crust!.id,
        quantity: qty,
        addIngredientIds: added,
        removeIngredientIds: removed,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      nav('/cart');
    },
  });

  if (isLoading) return <div className="page container-x"><Loading /></div>;
  if (error) return <div className="page container-x"><ErrorBox error={error} onRetry={() => refetch()} /></div>;
  if (!product) return <div className="page container-x"><ErrorBox error={new Error('We could not find that pizza.')} /><Link className="btn btn-ghost" to="/menu">Back to menu</Link></div>;

  const toggleAdd = (id: string) => setAdded((a) => (a.includes(id) ? a.filter((x) => x !== id) : a.length < addAllowed ? [...a, id] : a));
  const toggleRemove = (id: string) => setRemoved((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const fallbackImg = product.imageUrl ? <img src={optimizedImage(product.imageUrl)} onError={fallbackToOriginal(product.imageUrl)} alt={`${product.name} pizza`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="img-fallback">DP</div>;

  return (
    <div className="page container-x" style={{ paddingBottom: 0 }}>
      <Link to="/menu" className="muted">← Menu</Link>
      <h1 style={{ marginTop: 8 }}>{product.name}</h1>
      <div className="cust">
        <div className="cust-view-wrap">
          <div className="cust-view" role="img" aria-label={`Live preview of your ${product.name} with ${toppings.length} toppings`}>
            {webgl ? (
              <ErrorBoundary fallback={fallbackImg}>
                <Suspense fallback={<Loading label="Heating the oven…" />}>
                  <CustomizerView toppings={toppings} inches={size?.inches ?? 12} />
                </Suspense>
              </ErrorBoundary>
            ) : (
              fallbackImg
            )}
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>Drag to rotate</p>
        </div>

        <div>
          <p className="muted">{product.description}</p>
          <section className="group" aria-labelledby="c-size">
            <h3 id="c-size">Size</h3>
            <div className="chips" role="radiogroup" aria-labelledby="c-size">
              {sizes.map((s) => {
                const p = product.prices.find((x) => x.sizeId === s.id)!;
                return (
                  <button key={s.id} type="button" role="radio" aria-checked={sizeId === s.id} className="chip" onClick={() => setSizeId(s.id)}>
                    {s.name} {s.inches}"<small>{formatKes(p.priceCents)}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="group" aria-labelledby="c-crust">
            <h3 id="c-crust">Crust</h3>
            {crusts.length === 0 ? <p className="muted">No crusts available for this size.</p> : (
              <div className="chips" role="radiogroup" aria-labelledby="c-crust">
                {crusts.map((c) => {
                  const adj = c.adjustments.find((a) => a.sizeId === sizeId)?.adjustmentCents ?? 0;
                  return (
                    <button key={c.id} type="button" role="radio" aria-checked={crust?.id === c.id} className="chip" title={c.description} onClick={() => setCrustId(c.id)}>
                      {c.name}{adj > 0 && <small>+{formatKes(adj)}</small>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {product.extraIngredients.length > 0 && (
            <section className="group" aria-labelledby="c-extra">
              <h3 id="c-extra">Extra toppings <span className="muted" style={{ fontFamily: 'var(--font-body)', textTransform: 'none' }}>({added.length}/{addAllowed})</span></h3>
              {addAllowed === 0 ? <p className="muted">This pizza is already perfect: no extras.</p> : (
                <div className="chips">
                  {product.extraIngredients.map((i) => {
                    const on = added.includes(i.id);
                    return (
                      <button key={i.id} type="button" className="chip" aria-pressed={on} disabled={!on && added.length >= addAllowed} onClick={() => toggleAdd(i.id)}>
                        {i.name}<small>+{formatKes(i.surchargeCents)}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {added.length >= addAllowed && addAllowed > 0 && <p className="hint">You have reached the extra-topping limit.</p>}
            </section>
          )}

          {product.defaultIngredients.length > 0 && (
            <section className="group" aria-labelledby="c-remove">
              <h3 id="c-remove">Included toppings</h3>
              <p className="hint">Tap to remove what you do not want.</p>
              <div className="chips">
                {product.defaultIngredients.map((i) => (
                  <button key={i.id} type="button" className="chip" aria-pressed={!removed.includes(i.id)} onClick={() => toggleRemove(i.id)}>
                    {removed.includes(i.id) ? <s>{i.name}</s> : i.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="field">
            <label htmlFor="c-notes">Notes for the kitchen (optional)</label>
            <textarea id="c-notes" rows={2} maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {add.error && <ErrorBox error={add.error} />}
        </div>
      </div>

      <div className="cust-bar">
        <div className="qty" role="group" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span aria-live="polite">{qty}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</button>
        </div>
        <div aria-live="polite">
          <strong style={{ fontSize: '1.2rem' }}>{price ? formatKes(price.lineTotalCents) : '–'}</strong>
          <span className="hint" style={{ display: 'block' }}>Estimate; final price confirmed in your cart</span>
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={!crust || !sizeId || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? 'Adding…' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
