import { Link, useParams } from 'react-router';
import { formatKes } from '@dantes/shared';
import { useMenu, useProduct } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { ErrorBox, Loading } from '../components/States';
import { optimizedImage, fallbackToOriginal } from '../lib/images';

export default function ProductDetail() {
  const { slug } = useParams();
  const { data: p, isLoading, error, refetch } = useProduct(slug);
  const { data: menu } = useMenu();
  useTitle(p?.name ?? 'Pizza');
  if (isLoading) return <div className="page container-x"><Loading /></div>;
  if (error || !p) return <div className="page container-x"><ErrorBox error={error ?? new Error('Pizza not found')} onRetry={() => refetch()} /><Link to="/menu" className="btn btn-ghost">Back to menu</Link></div>;
  return (
    <div className="page container-x">
      <Link to="/menu" className="muted">← All pizzas</Link>
      <div className="split split-eq" style={{ marginTop: 16 }}>
        <div className="card">
          {p.imageUrl ? <img src={optimizedImage(p.imageUrl)} onError={fallbackToOriginal(p.imageUrl)} alt={`${p.name} pizza`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} /> : <div className="img-fallback" style={{ aspectRatio: '4/3' }}>DP</div>}
        </div>
        <div>
          <h1>{p.name}</h1>
          <p className="muted">{p.description}</p>
          <h3>On it</h3>
          <div className="chips" style={{ marginBottom: 20 }}>
            {p.defaultIngredients.map((i) => <span key={i.id} className="chip" style={{ cursor: 'default' }} title={i.description}>{i.name}</span>)}
          </div>
          <h3>Sizes</h3>
          <ul className="plain" style={{ marginBottom: 24 }}>
            {p.prices.map((pr) => {
              const size = menu?.sizes.find((s) => s.id === pr.sizeId);
              return (
                <li key={pr.sizeId} className="sum-row">
                  <span>{size ? `${size.name} (${size.inches}")` : 'Size'}</span>
                  <strong>{formatKes(pr.priceCents)}</strong>
                </li>
              );
            })}
          </ul>
          <Link to={`/customize/${p.id}`} className="btn btn-primary btn-lg">Customise &amp; order</Link>
        </div>
      </div>
    </div>
  );
}
