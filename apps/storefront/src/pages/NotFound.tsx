import { Link } from 'react-router';
import { useTitle } from '../hooks/useTitle';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <div className="page container-x state">
      <h1>404</h1>
      <p>That page is not on the menu.</p>
      <Link to="/menu" className="btn btn-primary">See the menu</Link>
    </div>
  );
}
