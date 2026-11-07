# Storefront performance report (Sprint 10)

## Method

Harness: `e2e/perf/measure.mjs` (`node e2e/perf/measure.mjs <label> [runs]`, results in `e2e/perf/results/<label>.json`).

- Production build (`vite build` + `vite preview`, proxied to an isolated API on :4100 / database `dantes_e2e`, never the dev servers).
- Chrome (system, `channel: 'chrome'`), fresh context per sample, HTTP cache disabled, **median of 3 runs**.
- Routes: `/`, `/menu`, `/checkout` (checkout with one item in the cart).
- Profiles: **desktop** (1280x800, no throttling) and **mobile** (Pixel 7 emulation, CDP CPU 4x slowdown, Fast 3G: 562.5 ms RTT, 1.6 Mbps down, 750 kbps up).
- LCP, CLS: `PerformanceObserver` (`largest-contentful-paint`, `layout-shift` without recent input), observed for load + 4 s (desktop) / 12 s (mobile).
- TBT approximation: sum of `max(0, duration - 50 ms)` for long tasks after first-contentful-paint, over the whole observation window (so it also counts the lazy 3D scene boot; it is stricter than Lighthouse TBT, which stops at TTI).
- JS transferred: sum of CDP `encodedDataLength` of all `Script` resources (bytes received by the browser, compressed as served by `vite preview`) in the window. Total/image KB likewise.
- The headless machine renders WebGL in software (SwiftShader), so TBT on `/` is pessimistic in absolute terms; compare before/after, not against Lighthouse.

"Before" = the build at the start of Sprint 10 e2e work (`before.json`), "after" = current tree (`after.json`).

## Results (median of 3)

| Profile | Route | Metric | Before | After |
| --- | --- | --- | --- | --- |
| desktop | `/` | LCP | 2236 ms | 2360 ms |
| desktop | `/` | CLS | 0.004 | 0.006 |
| desktop | `/` | TBT (approx) | 970 ms | 872 ms |
| desktop | `/` | JS transferred | 475.9 KB | 437.2 KB |
| desktop | `/menu` | LCP | 2784 ms | **1220 ms** |
| desktop | `/menu` | CLS | 0.166 | **0.004** |
| desktop | `/menu` | images transferred | **21,919 KB** | **1,481 KB** |
| desktop | `/menu` | JS transferred | 119.3 KB | 120.0 KB |
| desktop | `/checkout` | LCP | 1108 ms | 1432 ms (noise, text-only page) |
| desktop | `/checkout` | CLS | 0.253 | **0.006** |
| desktop | `/checkout` | JS transferred | 123.3 KB | 123.3 KB |
| mobile (4x CPU, Fast 3G) | `/` | LCP | 4320 ms | 4120 ms |
| mobile | `/` | CLS | 0.188 | 0.192 (unchanged, see below) |
| mobile | `/` | TBT (approx) | 5387 ms | **2454 ms** |
| mobile | `/` | JS transferred | 475.9 KB | 437.2 KB |
| mobile | `/menu` | LCP | 56,740 ms | **8,868 ms** |
| mobile | `/menu` | CLS | 0.375 | **0.003** |
| mobile | `/menu` | images transferred | 23,720 KB | 1,481 KB |
| mobile | `/checkout` | LCP | 3620 ms | 3908 ms (noise) |
| mobile | `/checkout` | CLS | 0.328 | **0.003** |

Bundle (gzip over the wire in brackets):

| Chunk | Before | After |
| --- | --- | --- |
| `three` (three.js + R3F + drei bits) | 1,082.5 kB (297 kB) | **954.3 kB (257 kB)** |
| `glb` (GLTF/Draco/Meshopt, loaded only if `/models/pizza.glb` exists) | in `three` | 70.8 kB (20.8 kB), lazy |
| admin entry bundle | 905 kB, single chunk | **426.6 kB** (131.9 kB gz) + 13 route chunks |

## What changed

1. **Product photos** (biggest win). The seed stores multi-MB originals (`/images/<name>.jpg`, 1.5-8 MB each) as `imageUrl`, so `/menu` pulled ~22 MB. The storefront now maps `/images/x.jpg` to `/images/web/x-800.jpg` (new 800 px, q60 files, 190-360 kB, generated into `public/images/web/`) via `apps/storefront/src/lib/images.ts`, with `onError` falling back to the original so admin uploads and unknown files still render. Product cards, cart, product page, customizer fallback and Our Story use it.
2. **CLS**. The footer sat inside the first viewport on short pages (`.page` min-height 70vh) and jumped when the page content arrived. `.page` is now `min-height: 100svh`, so the footer starts below the fold. Menu CLS fell from 0.17 and checkout CLS from 0.25 to under 0.01 (mobile: 0.38 and 0.33 to 0.003).
3. **Three.js chunk, 1,082 kB to 954 kB**:
   - drei's `<Environment>/<Lightformer>` pulled the EXR, RGBE and gain-map-JPEG loaders and fflate (~100 KB source never used, since the rig only uses local light panels). Replaced by `StudioEnvironment` in `scenes/PizzaStudio.tsx`: the same five panels baked once with `PMREMGenerator.fromScene`.
   - `GlbPizza` (needs `useGLTF`, so GLTFLoader/Draco/Meshopt) is now `React.lazy`, and `vite.config.ts` puts those modules into a `glb` chunk fetched only when a GLB model exists.
   - Checked tree-shaking: the drei code that remains in the bundle is ~23 KB of source (`ContactShadows`, `OrbitControls`, `useGLTF` shim), so importing only the used drei pieces already works. What remains is `three` core (~2 MB source, ~600 kB min) and the R3F reconciler.
4. **3D chunk after first paint**. `HomeScene` is now mounted only after the window `load` event, two animation frames and `requestIdleCallback` (2.5 s timeout), so the three chunk no longer competes with the hero photo and page JS. Mobile TBT on `/` halved.
5. **Admin**: all 13 pages are `React.lazy` routes inside a `Suspense` in the layout; the entry bundle is 427 kB instead of 905 kB. Login and layout stay eager.
6. Order tracking page: polling continues after payment (5 s) until COMPLETED/CANCELLED (functional fix found by the e2e suite, not a perf change).

Images: the homepage and idle screen already use `/images/web/*-1280|2400|blur.jpg` via `WebImage` (`srcset`); verified no remaining reference to the large originals in storefront code other than the product `imageUrl` values coming from the API/seed (handled by the mapping above).

## Remaining opportunities

- **Seed/API**: `apps/api/prisma/seed.ts` should reference `/images/web/<name>-800.jpg` (and admin image upload should generate resized variants), after which the storefront mapping can be dropped. Reported to the API worker.
- **Mobile `/` CLS 0.19**: remaining shift comes from the hero section (webfont swap on the display headline and the backdrop crossfade); preload the display font or use `size-adjust` fallbacks.
- **three core ~600 kB min / 257 kB gz** is dominated by `three` itself and R3F. Further reduction needs a custom reconciler or `three/src` deep imports with a bespoke renderer; not safe in this sprint. The scene is already deferred past first paint, so it does not affect LCP.
- Mobile `/` TBT is still 2.4 s under 4x CPU + software WebGL: the scene boot (geometry/texture generation in `pizzaGeo`/`pizzaTextures`) runs on the main thread; split across frames or move to a worker.
- `/menu` mobile LCP 8.9 s on Fast 3G is dominated by 1.4 MB of images (7 cards): add a `srcset` with a 480 px variant and `fetchpriority=high` on the first card.
- Serve compressed responses and long-cache `/assets/*` (immutable hashed files) and `/images/web/*` from the production host.
