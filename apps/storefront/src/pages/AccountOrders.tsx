import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatKes } from '@dantes/shared';
import { getAccountOrders } from '../services/orders';
import { useMe } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { Empty, ErrorBox, Loading } from '../components/States';

export default function AccountOrders() {
  useTitle('My orders');
  const { data: me, isLoading: meLoading } = useMe();
  const q = useQuery({ queryKey: ['account-orders'], queryFn: getAccountOrders, enabled: !!me });
  if (meLoading) return <div className="page container-x"><Loading /></div>;
  if (!me)
    return (
      <div className="page container-x">
        <Empty title="Log in to see your orders"><Link className="btn btn-primary" to="/account">Log in</Link></Empty>
      </div>
    );
  return (
    <div className="page container-x">
      <h1>My orders</h1>
      {q.isLoading && <Loading />}
      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <Empty title="No orders yet"><Link className="btn btn-primary" to="/menu">Order a pizza</Link></Empty>}
      <ul className="plain">
        {q.data?.map((o) => (
          <li key={o.reference} className="panel card-foot">
            <div>
              <Link to={`/order/${o.reference}`}><strong>{o.reference}</strong></Link>
              <p className="muted" style={{ margin: 0 }}>{new Date(o.createdAt).toLocaleString('en-KE')} · {o.items.length} item{o.items.length === 1 ? '' : 's'} · {o.status.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
            <strong>{formatKes(o.totalCents)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
