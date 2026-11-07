import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const testUrl = process.env.DATABASE_URL_TEST ?? 'postgresql://dantes@localhost:5434/dantes_test';
if (!testUrl.endsWith('/dantes_test')) throw new Error('Refusing to run tests against a non-test database');

process.env.DATABASE_URL = testUrl;
process.env.PAYMENTS_MODE = 'mock';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit';
process.env.NODE_ENV = 'test';
