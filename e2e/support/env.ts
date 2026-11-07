export const API_PORT = 4100;
export const STOREFRONT_PORT = 5273;
export const ADMIN_PORT = 5274;
export const STOREFRONT_URL = `http://localhost:${STOREFRONT_PORT}`;
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;
/** Never the `dantes` development database. */
export const E2E_DATABASE_URL = 'postgresql://dantes@localhost:5434/dantes_e2e';
export const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@dantespizza.co.ke';
export const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'change-me-now';
