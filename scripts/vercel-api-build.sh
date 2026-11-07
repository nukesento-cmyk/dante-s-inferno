#!/usr/bin/env bash
# Vercel build step for the API service (runs from apps/api).
# Builds @dantes/shared and the API (prisma generate + nest build) and, on production
# deployments only, applies pending migrations to Neon.
set -euo pipefail
cd "$(dirname "$0")/.."
PNPM="npx --yes pnpm@12.16.1"
$PNPM turbo run build --filter=@dantes/api
if [ "${VERCEL_ENV:-}" = "production" ]; then
  # Migrations need a direct (unpooled) connection; the Neon integration provides DATABASE_URL_UNPOOLED.
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DIRECT_URL:-$DATABASE_URL}}" $PNPM --filter @dantes/api exec prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi
