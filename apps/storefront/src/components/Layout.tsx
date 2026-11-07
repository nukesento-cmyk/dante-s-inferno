import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { formatKenyanPhone } from '@dantes/shared';
import { useCart, useSettings } from '../hooks/queries';
import { useCartStore } from '../store/cartStore';
import { weeklyHours } from '../lib/hours';
import { IdleScreen } from './IdleScreen';
import { OpenBadge } from './OpenBadge';
import { Wordmark } from './Wordmark';

const waLink = (p: string) => `https://wa.me/${p.replace(/^\+/, '')}`;

function Header() {
  const { data: s } = useSettings();
  useCart();
  const count = useCartStore((st) => st.count);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const home = loc.pathname === '/';
  const close = () => setOpen(false);
  return (
    <header className={`site-header ${home ? 'site-header-home' : ''}`}>
      <div className="topbar">
        <OpenBadge settings={s} />
        {s && (
          <span className="topbar-contact">
            <a href={`tel:${s.phone}`}>{formatKenyanPhone(s.phone)}</a>
            {s.whatsappPhone && (
              <a href={waLink(s.whatsappPhone)} target="_blank" rel="noreferrer">
                WhatsApp {formatKenyanPhone(s.whatsappPhone)}
              </a>
            )}
          </span>
        )}
      </div>
      <div className="navbar">
        <Wordmark />
        <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Menu'}
        </button>
        <nav id="main-nav" className={`nav ${open ? 'nav-open' : ''}`} aria-label="Main">
          <NavLink to="/menu" onClick={close}>Menu</NavLink>
          <NavLink to="/our-story" onClick={close}>Our story</NavLink>
          <NavLink to="/contact" onClick={close}>Contact</NavLink>
          <NavLink to="/account" onClick={close}>Account</NavLink>
          <Link to="/cart" className="btn btn-primary btn-sm" onClick={close} aria-label={`Cart, ${count} items`}>
            Cart{count > 0 ? ` (${count})` : ''}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const { data: s } = useSettings();
  return (
    <footer className="site-footer">
      <div className="container-x footer-grid">
        <div>
          <Wordmark tagline />
          {s && <p className="muted mt-3">{s.address}</p>}
        </div>
        <div>
          <h2 className="footer-h">Talk to us</h2>
          {s ? (
            <ul className="plain">
              <li><a href={`tel:${s.phone}`}>Call {formatKenyanPhone(s.phone)}</a></li>
              {s.whatsappPhone && <li><a href={waLink(s.whatsappPhone)} target="_blank" rel="noreferrer">WhatsApp {formatKenyanPhone(s.whatsappPhone)}</a></li>}
              <li><a href={`mailto:${s.email}`}>{s.email}</a></li>
              <li><OpenBadge settings={s} /></li>
            </ul>
          ) : (
            <p className="muted">Contact details load with the menu.</p>
          )}
        </div>
        <div>
          <h2 className="footer-h">Opening hours</h2>
          {s ? (
            <ul className="plain hours">
              {weeklyHours(s.hours).map((h) => (
                <li key={h.day}><span>{h.day}</span><span>{h.text}</span></li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <h2 className="footer-h">Explore</h2>
          <ul className="plain">
            <li><Link to="/menu">Menu</Link></li>
            <li><Link to="/our-story">Our story</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/privacy">Privacy</Link></li>
            <li><Link to="/terms">Terms</Link></li>
          </ul>
        </div>
      </div>
      <p className="container-x copyright">© {new Date().getFullYear()} Dante's Pizza. All prices in KES.</p>
    </footer>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const home = pathname === '/';
  const { data: settings } = useSettings();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      {/* the homepage renders its own final section footer */}
      {!home && <Footer />}
      <IdleScreen badge={<OpenBadge settings={settings} />} />
    </>
  );
}
