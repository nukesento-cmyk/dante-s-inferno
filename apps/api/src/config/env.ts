import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of [resolve(process.cwd(), '.env'), resolve(__dirname, '../../.env')]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const str = (key: string, fallback = '') => process.env[key] ?? fallback;

export const env = {
  get nodeEnv() { return str('NODE_ENV', 'development'); },
  get isProduction() { return this.nodeEnv === 'production'; },
  get port() { return Number(str('API_PORT', '4000')); },
  get publicApiUrl() { return str('PUBLIC_API_URL', 'http://localhost:4000'); },
  get storefrontUrl() { return str('STOREFRONT_URL', 'http://localhost:5173'); },
  get adminUrl() { return str('ADMIN_URL', 'http://localhost:5174'); },
  get jwtSecret() { return str('JWT_SECRET', 'dev-secret'); },
  get paymentsMode() { return str('PAYMENTS_MODE', 'mock') === 'live' ? ('live' as const) : ('mock' as const); },
  get loginRateLimit() { return Number(str('LOGIN_RATE_LIMIT', '10')); },
  get mpesa() {
    return {
      env: str('MPESA_ENV', 'sandbox'),
      key: str('MPESA_CONSUMER_KEY'),
      secret: str('MPESA_CONSUMER_SECRET'),
      shortcode: str('MPESA_SHORTCODE', '174379'),
      passkey: str('MPESA_PASSKEY'),
      callbackSecret: str('MPESA_CALLBACK_SECRET'),
    };
  },
  get paystackSecret() { return str('PAYSTACK_SECRET_KEY'); },
  get at() {
    return { username: str('AFRICASTALKING_USERNAME'), apiKey: str('AFRICASTALKING_API_KEY'), senderId: str('AFRICASTALKING_SENDER_ID') };
  },
  get whatsapp() {
    return { token: str('WHATSAPP_TOKEN'), phoneNumberId: str('WHATSAPP_PHONE_NUMBER_ID') };
  },
  get smtpUrl() { return str('SMTP_URL'); },
  get emailFrom() { return str('EMAIL_FROM', "Dante's Pizza <orders@dantespizza.co.ke>"); },
};
