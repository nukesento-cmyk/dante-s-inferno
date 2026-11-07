import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE_URL, OWNER_EMAIL, OWNER_PASSWORD } from './env';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function psql(sql: string) {
  execFileSync('psql', [E2E_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'inherit' });
}

/** Truncate every table except _prisma_migrations, re-seed, then make "now" always inside opening hours. */
export default async function globalSetup() {
  if (!E2E_DATABASE_URL.endsWith('/dantes_e2e')) throw new Error('Refusing to reset a database that is not dantes_e2e');
  psql(`DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
    END LOOP; END $$;`);
  execFileSync('pnpm', ['--filter', '@dantes/api', 'db:seed'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, SEED_OWNER_EMAIL: OWNER_EMAIL, SEED_OWNER_PASSWORD: OWNER_PASSWORD },
  });
  psql(`UPDATE "OpeningHours" SET "openTime" = '00:00', "closeTime" = '23:59', closed = false;
        UPDATE "RestaurantSettings" SET "lastOrderMinutesBeforeClose" = 0;`);
}
