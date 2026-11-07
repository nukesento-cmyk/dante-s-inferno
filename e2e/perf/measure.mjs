// Storefront performance harness. Usage: node perf/measure.mjs <label> [runs]
// Starts the API (:4100, dantes_e2e), builds the storefront, serves it with `vite preview` (:5273) and
// measures LCP / CLS / TBT approximations and JS transferred for /, /menu and /checkout on a cold cache.
// Set SF_DIST=<dir> to build into / serve that directory (used to keep a "before" build around).
// Profiles: desktop (no throttling) and mobile (Pixel 7, CPU 4x slowdown, Fast 3G).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, request } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const DIST = process.env.SF_DIST;
const distArgs = DIST ? ['--outDir', DIST] : [];
const label = process.argv[2] ?? 'run';
const RUNS = Number(process.argv[3] ?? 3);
const API = 'http://localhost:4100';
const SF = 'http://localhost:5273';
const DB = 'postgresql://dantes@localhost:5434/dantes_e2e';

const children = [];
const start = (cmd, args, env, cwd = root) => {
  const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  c.stderr.on('data', (d) => process.env.PERF_DEBUG && process.stderr.write(d));
  children.push(c);
  return c;
};
const waitFor = async (url, ms = 120000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
};
// Each child leads its own process group (pnpm -> vite), so kill the whole group.
const stopAll = () => children.forEach((c) => { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* gone */ } });
process.on('exit', stopAll);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const OBSERVERS = `
(() => {
  window.__perf = { lcp: 0, cls: 0, longTasks: [], fcp: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
})();`;

async function measure(browser, profile, route, token) {
  const ctx = await browser.newContext(profile.ctx);
  await ctx.addInitScript(OBSERVERS);
  if (token) await ctx.addInitScript((t) => localStorage.setItem('dp_cart_token', t), token);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.net) await cdp.send('Network.emulateNetworkConditions', profile.net);
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type }));
  const sizes = new Map();
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
  await page.goto(SF + route, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(profile.cpu > 1 ? 12000 : 4000);
  const p = await page.evaluate(() => window.__perf);
  let js = 0, img = 0, total = 0, jsFiles = 0;
  for (const [id, r] of reqs) {
    const n = sizes.get(id) ?? 0;
    total += n;
    if (r.type === 'Script') { js += n; jsFiles++; }
    if (r.type === 'Image') img += n;
  }
  // TBT approximation: blocking time of long tasks between FCP and the end of the observation window.
  const tbt = p.longTasks.filter(([s]) => s >= p.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  await ctx.close();
  return { lcp: Math.round(p.lcp), cls: +p.cls.toFixed(4), tbt: Math.round(tbt), jsKB: +(js / 1024).toFixed(1), jsFiles, imgKB: +(img / 1024).toFixed(1), totalKB: +(total / 1024).toFixed(1) };
}

try {
  console.log('building storefront...');
  execFileSync('pnpm', ['--filter', '@dantes/storefront', 'exec', 'vite', 'build', ...distArgs, ...(DIST ? ['--emptyOutDir'] : [])], { cwd: root, stdio: 'ignore' });
  start('node', ['apps/api/dist/main.js'], { API_PORT: '4100', DATABASE_URL: DB, PAYMENTS_MODE: 'mock', STOREFRONT_URL: SF, ADMIN_URL: 'http://localhost:5274', PUBLIC_API_URL: API, LOGIN_RATE_LIMIT: '100000', CHECKOUT_RATE_LIMIT: '100000', LOOKUP_RATE_LIMIT: '100000' });
  start('pnpm', ['--filter', '@dantes/storefront', 'exec', 'vite', 'preview', '--port', '5273', '--strictPort', ...distArgs], { API_PROXY_TARGET: API });
  await waitFor(`${API}/api/v1/health`);
  await waitFor(SF);

  // A cart with one item so /checkout renders the real form.
  const api = await request.newContext({ baseURL: API + '/api/v1/' });
  const menu = await (await api.get('public/menu')).json();
  const cart = await (await api.post('cart')).json();
  const p = menu.products[0];
  const size = menu.sizes.find((s) => p.prices.some((x) => x.sizeId === s.id));
  await api.post('cart/items', { headers: { 'X-Cart-Token': cart.token }, data: { productId: p.id, sizeId: size.id, crustId: menu.crusts[0].id, quantity: 1, addIngredientIds: [], removeIngredientIds: [] } });

  const profiles = {
    desktop: { ctx: { ...devices['Desktop Chrome'], channel: undefined, viewport: { width: 1280, height: 800 } }, cpu: 1, net: null },
    mobile: {
      ctx: { ...devices['Pixel 7'] },
      cpu: 4,
      // Lighthouse "Fast 3G": 150 ms RTT x 3.75 = 562.5 ms, 1.6 Mbps down, 750 kbps up (bytes/s below).
      net: { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    },
  };
  const browser = await chromium.launch({ channel: 'chrome' });
  const out = { label, runs: RUNS, results: {} };
  for (const [pn, prof] of Object.entries(profiles)) {
    for (const route of ['/', '/menu', '/checkout']) {
      const samples = [];
      for (let i = 0; i < RUNS; i++) samples.push(await measure(browser, prof, route, route === '/checkout' ? cart.token : null));
      const m = Object.fromEntries(Object.keys(samples[0]).map((k) => [k, +median(samples.map((s) => s[k])).toFixed(4)]));
      out.results[`${pn} ${route}`] = m;
      console.log(`${pn.padEnd(7)} ${route.padEnd(10)}`, JSON.stringify(m));
    }
  }
  await browser.close();
  await api.dispose();
  mkdirSync(resolve(here, 'results'), { recursive: true });
  writeFileSync(resolve(here, 'results', `${label}.json`), JSON.stringify(out, null, 2));
} finally {
  stopAll();
}
