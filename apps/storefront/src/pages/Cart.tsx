import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatKes } from '@dantes/shared';
import { useCart } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { removeCartItem, updateCartItem } from '../services/cart';
import { optimizedImage, fallbackToOriginal } from '../lib/images';
import { Empty, ErrorBox, Loading } from '../components/States';

export default function CartPage() {
  useTitle('Your cart');
  const qc = useQueryClient();
  const { data: cart, isLoading, error, refetch } = useCart();
  const refresh = () => qc.invalidateQueries({ queryKey: ['cart'] });
  const update = useMutation({ mutationFn: (v: { id: string; quantity: number }) => updateCartItem(v.id, { quantity: v.quantity }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => removeCartItem(id), onSuccess: refresh });
  const mutErr = update.error ?? remove.error;
  const blocked = !!cart?.items.some((i) => i.unavailable);

  return (
    <div className="page container-x">
      <h1>Your cart</h1>
      {isLoading && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => refetch()} />}
      {cart && cart.items.length === 0 && (
        <Empty title="Your cart is empty">
          <Link to="/menu" className="btn btn-primary">Browse the menu</Link>
        </Empty>
      )}
      {cart && cart.items.length > 0 && (
        <div className="split">
          <div>
            {mutErr && <ErrorBox error={mutErr} />}
            <ul className="plain">
              {cart.items.map((i) => (
                <li key={i.id} className="cart-line">
                  {i.imageUrl ? <img src={optimizedImage(i.imageUrl)} onError={fallbackToOriginal(i.imageUrl)} alt={i.productName} /> : <div className="img-fallback" style={{ width: 84, height: 84 }}>DP</div>}
                  <div>
                    <h3 style={{ marginBottom: 4 }}>{i.productName}</h3>
                    <p className="muted" style={{ margin: 0 }}>{i.sizeName} · {i.crustName}</p>
                    {i.added.length > 0 && <p className="muted" style={{ margin: 0 }}>Extra: {i.added.map((x) => x.name).join(', ')}</p>}
                    {i.removed.length > 0 && <p className="muted" style={{ margin: 0 }}>No: {i.removed.map((x) => x.name).join(', ')}</p>}
                    {i.unavailable && <p className="err" role="alert">No longer available. Remove it to continue.</p>}
                    <div className="card-foot" style={{ marginTop: 8 }}>
                      <div className="qty" role="group" aria-label={`Quantity of ${i.productName}`}>
                        <button type="button" aria-label="Decrease quantity" disabled={i.quantity <= 1 || update.isPending} onClick={() => update.mutate({ id: i.id, quantity: i.quantity - 1 })}>−</button>
                        <span aria-live="polite">{i.quantity}</span>
                        <button type="button" aria-label="Increase quantity" disabled={i.quantity >= 20 || update.isPending} onClick={() => update.mutate({ id: i.id, quantity: i.quantity + 1 })}>+</button>
                      </div>
                      <strong>{formatKes(i.lineTotalCents)}</strong>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove.mutate(i.id)} disabled={remove.isPending}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <aside className="panel sticky-panel" aria-label="Order summary">
            <div className="sum-row sum-total"><span>Subtotal</span><span>{formatKes(cart.subtotalCents)}</span></div>
            <p className="hint">Delivery, packaging and VAT are confirmed at checkout.</p>
            {blocked ? (
              <button type="button" className="btn btn-primary" disabled>Checkout</button>
            ) : (
              <Link to="/checkout" className="btn btn-primary" style={{ width: '100%' }}>Checkout</Link>
            )}
            <Link to="/menu" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }}>Add more</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
