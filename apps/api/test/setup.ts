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
process.env.CHECKOUT_RATE_LIMIT = '100000';
process.env.LOOKUP_RATE_LIMIT = '100000';
process.env.MPESA_CALLBACK_SECRET = 'test-mpesa-path-secret-0123456789';
// Never talk to real SMS/WhatsApp/SMTP providers from tests, whatever is in .env
for (const key of ['AFRICASTALKING_USERNAME', 'AFRICASTALKING_API_KEY', 'AFRICASTALKING_SENDER_ID', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'SMTP_URL', 'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET']) process.env[key] = '';
