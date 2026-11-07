import { useMemo, useState } from 'react';
import { useMenu } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { Empty, ErrorBox, Loading } from '../components/States';
import { ProductCard } from '../components/ProductCard';

export default function Menu() {
  useTitle('Menu');
  const { data, isLoading, error, refetch } = useMenu();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) =>
        (cat === 'all' || p.categoryId === cat) &&
        (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term) || p.defaultIngredients.some((i) => i.name.toLowerCase().includes(term))),
    );
  }, [data, cat, q]);

  return (
    <div className="page container-x">
      <p className="eyebrow">The menu</p>
      <h1>Pick your fire</h1>
      {isLoading && <Loading label="Loading the menu…" />}
      {error && <ErrorBox error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <div className="row-2" style={{ alignItems: 'end', marginBottom: 20 }}>
            <div className="chips" role="group" aria-label="Filter by category">
              <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
              {data.categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
              ))}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="menu-search">Search</label>
              <input id="menu-search" type="search" placeholder="Pepperoni, mushroom…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <p className="muted" aria-live="polite">{products.length} {products.length === 1 ? 'pizza' : 'pizzas'}</p>
          {products.length === 0 ? (
            <Empty title="Nothing matches">
              <button type="button" className="btn btn-ghost" onClick={() => { setQ(''); setCat('all'); }}>Clear filters</button>
            </Empty>
          ) : (
            <div className="grid-products">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
