import { Link } from 'react-router';
import { formatKes } from '@dantes/shared';
import type { ProductPublic } from '../services/types';

export const fromPrice = (p: ProductPublic) => (p.prices.length ? Math.min(...p.prices.map((x) => x.priceCents)) : 0);

export function ProductCard({ product }: { product: ProductPublic }) {
  return (
    <article className="card product-card">
      <Link to={`/menu/${product.slug}`} className="card-img" aria-label={`${product.name} details`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={`${product.name} pizza`} loading="lazy" />
        ) : (
          <div className="img-fallback" aria-hidden="true">DP</div>
        )}
      </Link>
      <div className="card-body">
        <h3>{product.name}</h3>
        <p className="muted clamp-2">{product.description}</p>
        <div className="card-foot">
          <span className="price">from {formatKes(fromPrice(product))}</span>
          <Link to={`/customize/${product.id}`} className="btn btn-primary btn-sm">Customise</Link>
        </div>
      </div>
    </article>
  );
}
