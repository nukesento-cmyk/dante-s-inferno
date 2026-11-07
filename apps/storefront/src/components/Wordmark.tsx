import { Link } from 'react-router';

export function Wordmark({ tagline = false, large = false }: { tagline?: boolean; large?: boolean }) {
  return (
    <Link to="/" className="wordmark" aria-label="Dante's Pizza, home">
      <span className={large ? 'wm-top wm-large' : 'wm-top'}>DANTE'S</span>
      <span className={large ? 'wm-bottom wm-large' : 'wm-bottom'}>PIZZA</span>
      {tagline && <span className="wm-tag">FRESHLY MADE. BOLDLY DIFFERENT.</span>}
    </Link>
  );
}
