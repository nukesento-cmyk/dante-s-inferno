# Deployment: Vercel + Neon

One Vercel project serves everything from one domain (`vercel.json`, Vercel Services):

| Path | Service | Source |
| --- | --- | --- |
| `/api/*` | `api` (NestJS serverless function, 300 s max) | `apps/api` |
| `/admin`, `/admin/*` | `admin` (static Vite SPA) | `apps/admin` |
| everything else | `storefront` (static Vite SPA) | `apps/storefront` |

Same origin for all three: cookies are first-party and there is no CORS in production.

## One-time setup

1. **Create the project.** Import the GitHub repo in Vercel (or run `vercel link` in the repo root). Leave the
   root directory as the repo root; `vercel.json` defines the services and their build commands.
2. **Database.** Vercel → Storage → Create → Neon (or connect an existing Neon project). This sets
   `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). If you set them by hand, add
   `&pgbouncer=true&connection_limit=5` to the pooled URL.
3. **Image uploads.** Vercel → Storage → Create → Blob. This sets `BLOB_READ_WRITE_TOKEN`; admin uploads then
   go to Blob (serverless functions have no persistent disk).
4. **Environment variables** (Production, and Preview if you want working previews):
   - `NODE_ENV=production`
   - `JWT_SECRET` – `openssl rand -base64 48`
   - `PAYMENTS_MODE=live`, `MPESA_ENV=production`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
     `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_SECRET` (`openssl rand -hex 24`), `PAYSTACK_SECRET_KEY`
   - Until the live payment keys exist: `PAYMENTS_MODE=mock` **and** `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true`
     (testing only – anyone can mark their own order paid).
   - Optional: `AFRICASTALKING_*`, `WHATSAPP_*`, `SMTP_URL`, `EMAIL_FROM`, `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`
   - `STOREFRONT_URL`, `ADMIN_URL`, `PUBLIC_API_URL` are optional: they default to the production domain.
5. **Domain.** Vercel → Settings → Domains → add `dantespizza.co.ke` (and `www` redirect). Admin is at
   `https://dantespizza.co.ke/admin`.
6. **Webhooks.** Paystack dashboard → webhook URL `https://<domain>/api/v1/payments/paystack/webhook`.
   M-Pesa callbacks are generated from `PUBLIC_API_URL` automatically.

## Migrations and seed

- Production builds run `prisma migrate deploy` against `DATABASE_URL_UNPOOLED` (`scripts/vercel-api-build.sh`).
  Preview builds never migrate.
- Seed the first owner account and menu once, from your machine:

  ```bash
  DATABASE_URL="<neon direct url>" SEED_OWNER_EMAIL=you@example.com SEED_OWNER_PASSWORD='<strong>' \
    pnpm --filter @dantes/api db:seed
  ```
  Then sign in at `/admin` and change prices, phone, hours and notifications under **Settings**.

## Deploying

- Push to `main` → production deployment. Other branches/PRs → preview deployments.
- Local check of the exact Vercel build: `vercel build` (output in `.vercel/output`, git-ignored).

## Serverless notes / known limits

- **Rate limits** are in memory per function instance, so they are best-effort on Vercel. Add the Vercel
  Firewall rate-limit rule for `/api/v1/auth/*` and `/api/v1/checkout*` for a hard limit.
- **Admin live orders** use SSE from the instance that handled the change; other instances fall back to the
  20 s polling already in the admin Orders page.
- **Notifications** are sent after the response using `waitUntil`, so the function stays alive until they finish.
- **Backups:** Neon has point-in-time restore; `scripts/backup.sh` also works with `DATABASE_URL` set to the direct URL.
