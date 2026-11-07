import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { authApi } from '../api/endpoints';
import { useMe } from '../lib/auth';
import { navForRole } from '../lib/roles';
import { useSound } from '../store/sound';
import { Button, Loading, cx } from './ui';
import { humanize } from '../lib/format';

export function Layout() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { muted, toggle } = useSound();
  const items = navForRole(me.role);

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      qc.clear();
      nav('/login');
    }
  }

  return (
    <div className="flex min-h-full">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-graphite text-zinc-200 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-5 py-4">
          <div className="text-lg font-extrabold leading-tight text-white">
            DANTE'S <span className="text-brand-light">PIZZA</span>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400">Admin Command Centre</div>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm', isActive ? 'bg-brand font-semibold text-white' : 'text-zinc-300 hover:bg-graphite-soft hover:text-white')
              }
            >
              <span aria-hidden className="w-5 text-center">
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-xs">
          <div className="truncate font-semibold text-white">{me.name}</div>
          <div className="mb-2 text-zinc-400">{humanize(me.role)}</div>
          <Button size="sm" className="w-full" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
          <button type="button" className="rounded p-2 text-lg hover:bg-zinc-100 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            ☰
          </button>
          <div className="hidden text-sm text-zinc-500 lg:block">Africa/Nairobi · KES</div>
          <button type="button" onClick={toggle} aria-pressed={muted} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50">
            {muted ? '🔇 Alerts muted' : '🔔 Alerts on'}
          </button>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 lg:p-6">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
