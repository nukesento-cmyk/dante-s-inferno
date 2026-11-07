# End-to-end, accessibility and performance test report (Sprint 10)

## How to run

```bash
bash scripts/db.sh start                 # Postgres on :5434 (once)
pnpm --filter @dantes/api build          # the e2e API runs from apps/api/dist
pnpm e2e                                 # = pnpm --filter @dantes/e2e test (desktop + mobile)
pnpm --filter @dantes/e2e test:headed    # watch it
pnpm --filter @dantes/e2e exec playwright test tests/guest.spec.ts --project=desktop   # one spec
pnpm --filter @dantes/e2e perf           # performance harness, see performance-report.md
```

Requires Google Chrome installed (`channel: 'chrome'`).

**Isolation.** `e2e/playwright.config.ts` starts its own stack and never touches the dev servers or database:

| Piece | Port | Notes |
| --- | --- | --- |
| API (`node apps/api/dist/main.js`) | 4100 | database `dantes_e2e`, `PAYMENTS_MODE=mock`, rate limits raised (`LOGIN/CHECKOUT/LOOKUP_RATE_LIMIT=100000`) |
| Storefront (`vite build` + `vite preview`) | 5273 | `API_PROXY_TARGET=http://localhost:4100` |
| Admin (`vite build` + `vite preview`) | 5274 | base `/admin/`, same proxy variable |

`reuseExistingServer` is false, so the run fails fast if those ports are taken. `support/global-setup.ts` refuses to run against anything but `dantes_e2e`, truncates every table except `_prisma_migrations`, runs `pnpm db:seed`, and sets every weekday to 00:00-23:59 with a 0 minute last-order cut-off so the suite passes at any time of day.

`apps/storefront/vite.config.ts` and `apps/admin/vite.config.ts` read `process.env.API_PROXY_TARGET ?? 'http://localhost:4000'` (server and preview), so the default dev setup is unchanged.

The suite shares one database and mutates global settings, so it runs with `workers: 1`; every spec that changes shared state (pause, hours, phone, price, zone fee, availability) restores it in `afterEach` through the API.

## Suites

Each spec runs on both projects: `desktop` (Desktop Chrome 1280x800) and `mobile` (Pixel 7 emulation on Chrome). 26 tests per project, 52 total.

| Spec | Tests | What it proves |
| --- | --- | --- |
| `guest.spec.ts` | 5 | Delivery order with customised Margherita (Large, Thin crust, +Mushrooms, -Tomato): cart total equals shared `priceLine`, checkout summary equals shared `priceOrder` (fee + VAT), phone typed as `0712345678`, "Simulate success" shows PAID, itemised receipt and VAT. Collection + card mock. M-Pesa failure, retry, success. Below-minimum zone message with "Switch to collection". Order lookup with wrong phone denied, right phone accepted. |
| `account.spec.ts` | 2 | Register, logout, login, order while logged in, order listed in `/account/orders`. Cart persists across reload. |
| `admin-orders.spec.ts` | 1 | Owner login; guest order appears in Orders (live/<=25 s); PAID -> ACCEPTED -> PREPARING -> OUT_FOR_DELIVERY -> COMPLETED; the customer's order page follows each stage without reload. |
| `admin-settings.spec.ts` | 5 | Phone and opening-hours change visible in storefront header, contact page and footer. Pause ordering blocks checkout with the message, unpause restores. Margherita Large price change shows on the menu while an existing order keeps its price. Delivery zone fee change at checkout. Product availability off: hidden from menu, flagged in cart and checkout blocked. |
| `admin-staff.spec.ts` | 1 | Owner creates a KITCHEN user. KITCHEN sees only Orders, `/admin/settings` redirects away, `GET /admin/settings` and `/admin/pricing` return 403, only "Mark preparing" then "Mark ready" are offered. |
| `fallbacks.spec.ts` | 2 | `prefers-reduced-motion` and no-WebGL (init script makes `getContext('webgl'/'webgl2')` return null): homepage has no `<canvas>`, photos load, menu, customizer and checkout complete an order. |
| `idle.spec.ts` | 2 | `/?idle=3` shows the showcase dialog and a key dismisses it. Never shown on `/checkout`, `/cart`, `/account`. |
| `keyboard.spec.ts` | 2 | Tab order through the header nav (incl. the mobile toggle) and a keyboard-only add-to-cart on the customizer (size, crust, topping, quantity, Add to cart). |
| `a11y.spec.ts` | 6 | axe-core `wcag2a` + `wcag2aa` on: home (reduced motion and full WebGL motion), menu, product, customize, cart, checkout (delivery and with validation errors), order (unpaid with mock panel), order lookup, account (login and register), contact, admin login, admin orders and the five admin settings tabs (Pricing, Contact, Opening hours, Notifications, General). |

## Results

Final state: two consecutive full runs of all 52 tests (desktop + mobile) passed with no retries and no flaky tests.

| Run | Result |
| --- | --- |
| Full run 1 (after first fixes) | 50 passed, 2 failed (admin axe, Pricing tab `<summary>` with focusable child), fixed |
| Full run 2 | 52 passed (10.8 min) |
| Full run 3 (`pnpm e2e`, final tree, back to back with run 2) | 52 passed (10.4 min), no retries |

Flaky notes: no retries are configured and none were needed in the passing runs. Things that were timing-sensitive and are handled explicitly: the client-rendered header (helpers wait for the `banner` before deciding whether the mobile menu toggle exists), the admin order list (SSE or the 20 s refetch, so the test allows 25 s), and the storefront order page poll (5 s, assertions allow 15 s). Idle tests need real wall-clock seconds (~25 s together).

Unit tests: storefront 21 passed, admin 19 passed (`pnpm --filter ... test`). `tsc --noEmit` clean for both apps and `e2e`.

## Bugs found and fixed

| Where | Bug | Fix |
| --- | --- | --- |
| `apps/storefront/src/pages/Order.tsx` | After payment succeeded the order page stopped polling, so ACCEPTED/PREPARING/... never appeared without reload. | Keep polling every 5 s until COMPLETED/CANCELLED. |
| `apps/storefront/src/styles.css` (`.page`) | Footer inside first viewport caused CLS 0.17-0.38 on menu and checkout. | `min-height: 100svh`. |
| Product image URLs (`lib/images.ts`, ProductCard, Cart, ProductDetail, Customize, OurStory) | `/menu` downloaded ~22 MB of originals. | Serve `/images/web/<name>-800.jpg` (generated), fall back to original on error. |
| `apps/admin/src/index.css`, `Layout.tsx` | Brand orange `#ff6a00` on white / white-on-orange buttons was 2.87:1; `text-zinc-500` on the page background 4.42:1. | `--color-brand: #c24a00` (4.9:1), `--color-brand-light` kept for dark surfaces, zinc-500 darkened to `#63636b`. |
| `apps/admin/src/pages/settings/Pricing.tsx` | `<summary>` contained an `<input>` (axe `nested-interactive`; clicking the input toggled the group). | Group price input moved into the details body. |
| `apps/storefront/src/pages/Home.tsx`, `scenes/*` | 3D chunk loaded during first paint and was 1.08 MB. | See performance-report.md. |

## Accessibility results

- Storefront: no axe WCAG 2 A/AA violations on any scanned page or state (no exceptions required).
- Admin: the violations above were fixed; none remain on login, orders and the five settings tabs.
- Not scanned with axe (covered by manual review only): other admin pages (products, categories, ingredients, customizations, delivery, payments, customers, reports, staff, audit), the idle screen, and modal/drawer states other than the ones exercised by the e2e flows. axe also cannot judge the 3D canvas, which is `aria-hidden` with equivalent text on the page.
- Keyboard: skip link first, header nav and mobile toggle reachable in order and operable, customizer controls operable with Tab/Space/Enter (verified), focus indicator present.
- Known exceptions list: `KNOWN` in `e2e/tests/a11y.spec.ts` is empty.

## API findings for the API worker

- `apps/api/prisma/seed.ts` stores multi-MB originals as `Product.imageUrl` (`/images/<name>.jpg`, up to 8 MB). Please point it at `/images/web/<name>-800.jpg` (files exist in `public/images/web`) and consider resizing admin uploads. The storefront works around it, see the performance report.
- No functional API defects were found by the suite. Role enforcement (KITCHEN 403 on settings and pricing), pricing consistency with `@dantes/shared`, wrong-phone lookup denial, mock payment retry and pause/hours blocking all behave per `documentation/api-contract.md`.

## Known gaps

- Real M-Pesa / Paystack redirects are not covered (mock mode only).
- SSE live delivery of new orders is not asserted separately from the 20 s polling fallback.
- Scheduled ordering, special closures, notifications settings, reports and the remaining admin CRUD pages are not exercised end to end.
- Chrome only (no Firefox/WebKit projects).
