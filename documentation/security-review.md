# Security review: Dante's Pizza API (Sprint 10)

Scope: `apps/api` (NestJS 11, Prisma 6, Postgres). Method: read every controller, guard and service, then wrote tests that attack each area (`apps/api/test/security.test.ts`, `roles.test.ts`, `uploads-sse-limits.test.ts`, `customer.test.ts`, `payments-extra.test.ts`, `contract.test.ts`). Status values: **Fixed** (code and test), **Mitigated** (reduced, residual noted), **Open** (recommendation, outside this sprint's ownership), **OK** (reviewed, no change needed).

## Findings

| # | Severity | Area | Finding | Fix or recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Critical | Config | `PAYMENTS_MODE=mock` exposes `POST /payments/mock/:id/complete`, which lets any buyer mark their own order paid. Nothing stopped a production deploy with mock mode on. | `validateEnv()` refuses to boot in production unless `PAYMENTS_MODE=live` (escape hatch for staging demos: `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true`). The route also 404s when not in mock mode. | Fixed |
| 2 | High | Config | `JWT_SECRET` defaulted to `dev-secret`; only a `change-me` prefix was refused in production, and never the length. A guessable secret allows forging staff sessions. | Env is validated with zod at boot (`src/config/env.ts`). In production the secret must be at least 32 characters and not start with `change-me`, `dev-secret`, `secret`, etc. The M-Pesa callback secret needs 24+ characters when live, origins must be `https://`, and the error never echoes values. Tested, including a failed app boot. | Fixed |
| 3 | High | Payments | The M-Pesa callback with a wrong path secret answered `200 {ResultCode:0}`, so probing was indistinguishable from success and attempts were not visible. | Wrong or unconfigured secret now returns `404` and records nothing (no PaymentEvent, no provider call). Comparison stays `timingSafeEqual`. The request log redacts the secret segment. | Fixed |
| 4 | High | Uploads | Upload trusted the client `Content-Type`; a file named `x.jpg` with arbitrary bytes was stored under `uploads/` and served. | Memory storage, magic-byte sniffing (JPEG, PNG, GIF, WebP, AVIF), the extension is derived from the bytes, the file name is a server-generated UUID (no path traversal possible), 5 MB cap (413), `wx` write flag, upload is audited. Static files are served with `nosniff` (helmet) and `dotfiles: deny`. SVG and HTML are rejected. | Fixed |
| 5 | Medium | HTTP | No security headers. | `helmet` for an API: CSP `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS in production, CORP `same-site` (`cross-origin` only for `/uploads`), `x-powered-by` removed. `Cache-Control: no-store` on admin, auth, account, order, cart and checkout responses. | Fixed |
| 6 | Medium | CORS | `enableCors({ origin: [..] })` was already an allow-list but allowed all methods and headers. | Function-based allow-list (`STOREFRONT_URL`, `ADMIN_URL` only, never a wildcard or reflected origin), credentials on, explicit methods and headers (`Content-Type`, `X-Cart-Token`). Foreign origins get no `Access-Control-Allow-Origin`. | Fixed |
| 7 | Medium | CSRF | Cookie-authenticated, state-changing routes relied on SameSite alone. | Defence in depth (`csrfGuard` in `src/bootstrap.ts`): a browser `Origin` on POST/PUT/PATCH/DELETE must be an allowed origin (403), and any request that carries a body must be `application/json` (415). Exempt: the multipart upload (still needs the cookie plus an allowed Origin) and the two provider webhooks. Bodiless POSTs (logout, deactivate) rely on the Origin rule and SameSite=Lax. | Fixed |
| 8 | Medium | Abuse | Only the login endpoints were rate limited. | Per-IP limits: login/register/forgot/reset `LOGIN_RATE_LIMIT` (10/min), checkout and retry-payment `CHECKOUT_RATE_LIMIT` (10/min), guest order lookup `LOOKUP_RATE_LIMIT` (30/min), payment polling 4x that. In-memory storage: see residual risks. | Fixed (single instance) |
| 9 | Medium | Robustness | `GET /orders/:reference?phone=a&phone=b` (array query) crashed with a 500 inside the phone normaliser. Body-parser errors (too large, bad JSON) bypassed the exception filter and, outside production, Express would print a stack trace. | Lookup only accepts a string phone. JSON body limit 100 kb (413). A dedicated error middleware and a filter branch turn parser errors into the standard `{statusCode,error,message}` shape with no stack. | Fixed |
| 10 | Medium | Auth | Login skipped argon2 verification for unknown emails, so response time revealed which emails have accounts. Forgot-password awaited the email send for known users only (same oracle). | One argon2 verification always runs (against a dummy hash for unknown users); the reset email is sent without awaiting. Responses are byte-identical (tested). Registration still returns 409 for an existing email (see residual risks). | Fixed |
| 11 | Medium | Auth | Passwords: only `min(8)`. Hashes used library defaults. | Policy (`src/common/password-policy.ts`) on register, reset and staff create/update: 8-128 chars, no single repeated character, no common-password list, must not contain the email or phone. argon2id with explicit params (64 MiB, 3 passes, 1 lane); old hashes are rehashed on login. | Fixed |
| 12 | Medium | Sessions | `tokenVersion` revocation. | Verified: bumped on password reset, staff password change, role change, and deactivation; every request re-reads the user and compares `tv`, `active` and `kind`. Customer and staff cookies are not interchangeable (tested both ways). Logout only clears the cookie; the 12 h (staff) / 30 d (customer) JWT stays valid until `tv` changes. | OK / residual |
| 13 | Medium | Logs | Logs could contain phone numbers (notification providers log `SMS to +2547...`), reset links, and the M-Pesa path secret (request log). | `maskSensitive()` is applied to every log line and `extra`: phones become `+2547******78`, 13-19 digit runs become `[card?]`, `Bearer ...` and `dp_*` cookies are redacted, reset tokens are redacted in production. Request log drops the query string and the callback secret. The DB `Notification` table keeps the full recipient and body (needed for support). | Fixed |
| 14 | Low | Errors | Prisma and unexpected errors. | The global filter returns `{statusCode:500,error,message:'Internal server error'}` for anything that is not an HttpException or a mapped Prisma code (P2002, P2025, P2003). Stack traces go to the server log only. Tested with a poisoned Prisma error. | OK (tested) |
| 15 | Low | Audit | `POST /admin/uploads/image` and `POST /admin/settings/notifications/test` mutated state or sent messages without an audit row. | Both now write audit entries (the test-send entry omits the recipient). A test exercises every admin mutation and asserts that the audit count rises. | Fixed |
| 16 | Low | Reports | CSV export wrote customer-controlled names straight into cells (`=HYPERLINK(...)` formula injection when the owner opens it in Excel). | Cells starting with `=`, `@`, tab, CR, or `+`/`-` not followed by a digit are prefixed with `'`. Tested. | Fixed |
| 17 | Low | Data exposure | `GET /admin/customers/:id` returned the raw Prisma row (`userId`, `updatedAt`) and lacked `orderCount`/`totalSpentCents` from the contract. | Returns the contract fields only. | Fixed |
| 18 | Low | Health | `/health` returned 200 `{status:'degraded'}` when the DB was down, so load balancers kept routing. | 503 when the database does not answer within 2 s. New `GET /health/ready` also checks that the settings row exists (migrated and seeded). | Fixed |
| 19 | Low | Swagger | `/api/docs` is served by `main.ts`. | Disabled when `NODE_ENV=production`. | Fixed |
| 20 | Info | IDOR | Every `:id` / `:reference` route. | Admin `:id` routes sit behind role guards (401/403 tests for all 65 admin route/method pairs). Cart items are resolved inside the caller's own cart (404 across tokens). Guest lookup requires reference plus phone and returns the same 404 body for wrong reference, wrong phone, missing phone and junk. `/account/orders` is filtered by the cookie's customer id. A guest order is never attached to an account by phone. SSE needs staff auth (customer cookie gets 401). | OK (tested) |
| 21 | Info | Mass assignment | Unknown fields. | All bodies go through zod object schemas, which strip unknown keys. Verified for registration (role/kind/tokenVersion ignored), staff creation, cart items (client prices ignored) and checkout (client totals and status ignored). No `.passthrough()` is used on request schemas. | OK (tested) |
| 22 | Info | Webhooks | Raw-body handling and signatures. | `rawBody: true` is kept and the body parsers are re-registered with the size limit (raw bytes still captured). Paystack: HMAC-SHA512 over the exact raw bytes with `timingSafeEqual` (length checked first); missing, wrong, truncated and body-mismatched signatures return 401 without calling Paystack. Amount, currency and reference are checked before a payment succeeds; events are idempotent on `eventKey`. A success is never undone by a later failure. | OK (tested) |
| 23 | Info | Authorization | Roles. | Matrix test over every admin route and role: MANAGER can GET but not PUT settings; only OWNER manages staff; KITCHEN only reaches orders and may only set PREPARING/READY; an owner cannot demote or deactivate themselves. | OK (tested) |
| 24 | Low | Payments | `retry-payment` and `payment-status` are keyed by the order reference alone (6 characters from a 31 character alphabet, about 887 million values). Anyone who learns a reference can start a new payment attempt (an M-Pesa push to a phone they supply) on that order. | Rate limited (finding 8). Recommendation: require the order phone for retry (storefront change: send `phone` from the confirmation page) and cap attempts per order. | Mitigated |

## Residual risks

- **Rate limiting is per process, in memory.** With more than one API instance the effective limit multiplies, and a restart resets it. Put the limit at the edge (Cloudflare or the load balancer) and/or move the Throttler storage to Redis before scaling out. Behind a proxy `trust proxy` is `1`; make sure the proxy overwrites `X-Forwarded-For`, otherwise clients can pick their own IP bucket.
- **Stateless JWT sessions.** Logout only clears the cookie. A stolen cookie works until it expires (12 h staff) or the user's `tokenVersion` changes. Consider revoking on logout for staff, and a "sign out everywhere" button for customers.
- **Account enumeration at registration.** `POST /auth/customer/register` answers 409 when an email exists. This is the usual UX trade-off; it is rate limited. Fixing it needs email verification before account creation.
- **No account lockout or CAPTCHA.** Brute force is slowed by IP rate limits and argon2 cost only. Consider per-account backoff and a CAPTCHA on registration and forgot-password if abuse appears.
- **Guest lookup passes the phone in the query string.** It can end up in proxy access logs (the API's own log strips the query). Proxies should not log query strings for `/api/v1/orders/*`.
- **A success arriving for a cancelled order** marks the payment `SUCCEEDED` (money was received) and leaves the order `CANCELLED`; it appears in `GET /admin/payments/reconciliation` as unmatched. Refunds are manual.
- **Password strength** is a policy plus a short deny-list, not a breach-corpus check. `password123` is intentionally not on the deny-list (existing fixtures use it); add it once the e2e suite no longer does.
- **Uploads** are validated by magic bytes but not re-encoded, so a polyglot file with a valid image header can still carry extra bytes. They are served with `nosniff` and never executed. Re-encoding with an image library (sharp) would also strip EXIF location data.
- **The `Notification` table stores full phone numbers and message bodies** (including customer names). Apply a retention job (for example delete after 90 days).
- **`pg_dump` backups contain customer PII and password hashes.** Encrypt them at rest and restrict access (see `documentation/backup-restore.md`).
- **Dependencies**: run `pnpm audit` in CI; lockfile changes were out of scope.

## Production checklist

**Secrets and config**
- [ ] `NODE_ENV=production`, `PAYMENTS_MODE=live` (the API refuses to boot otherwise).
- [ ] `JWT_SECRET`: `openssl rand -base64 48`; unique per environment; stored in the host's secret manager, not in the repo.
- [ ] `MPESA_CALLBACK_SECRET`: random, 24+ characters; the Daraja callback URL is `https://api.<domain>/api/v1/payments/mpesa/callback/<secret>`. Rotate if it ever appears in a log.
- [ ] `PAYSTACK_SECRET_KEY` is the live key; the webhook URL is registered in the Paystack dashboard (and IP-allow-listed if the plan supports it).
- [ ] `STOREFRONT_URL` and `ADMIN_URL` are the exact `https://` origins (CORS and the CSRF Origin check use them). `PUBLIC_API_URL` is the public API origin.
- [ ] Change `SEED_OWNER_PASSWORD` before the first seed, or change the owner password immediately; do not run the seed with the default.
- [ ] Review rate limit env vars (`LOGIN_RATE_LIMIT`, `CHECKOUT_RATE_LIMIT`, `LOOKUP_RATE_LIMIT`) for your traffic.

**Transport**
- [ ] HTTPS everywhere with HSTS (the API sends it in production); redirect HTTP to HTTPS at the edge. Cookies are `Secure` in production, so HTTP logins would silently fail.
- [ ] The reverse proxy sets `X-Forwarded-For` and `X-Forwarded-Proto` and overwrites client-supplied values.
- [ ] Admin app on its own origin; consider an IP allow-list or SSO in front of it.

**Database**
- [ ] `DATABASE_URL` uses TLS (`?sslmode=require`, or `verify-full` with the provider CA).
- [ ] The application role has only the privileges it needs (no superuser, cannot create roles); migrations run with a separate role.
- [ ] Postgres is not reachable from the internet (private network or allow-list).
- [ ] Automated backups verified by a restore drill (see the runbook), and point-in-time recovery enabled on the managed database.

**Operations**
- [ ] `/api/v1/health` for liveness, `/api/v1/health/ready` for readiness (503 when not ready) wired into the platform.
- [ ] Logs shipped to a store with access control; alerts on 5xx rate and on `M-Pesa callback with a bad secret rejected`.
- [ ] `uploads/` is on persistent storage (or object storage) and backed up; it is not part of `pg_dump`.
- [ ] `pnpm audit` / Dependabot in CI; `pnpm test` and `pnpm typecheck` gate deploys.
- [ ] Staff accounts: unique emails, KITCHEN and ORDER_STAFF roles for floor staff, deactivate leavers (this revokes sessions at once).
