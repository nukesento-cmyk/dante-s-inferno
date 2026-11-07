import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

for (const file of [resolve(process.cwd(), '.env'), resolve(__dirname, '../../.env')]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const str = (key: string, fallback = '') => process.env[key] || fallback;

/** On Vercel the production domain is known; use it when the URL variables are not set explicitly. */
const vercelOrigin = () => (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');

export const env = {
  get nodeEnv() { return str('NODE_ENV', 'development'); },
  get isProduction() { return this.nodeEnv === 'production'; },
  get port() { return Number(str('API_PORT', '4000')); },
  get publicApiUrl() { return str('PUBLIC_API_URL', vercelOrigin() || 'http://localhost:4000'); },
  get storefrontUrl() { return str('STOREFRONT_URL', vercelOrigin() || 'http://localhost:5173'); },
  get adminUrl() { return str('ADMIN_URL', vercelOrigin() ? `${vercelOrigin()}/admin` : 'http://localhost:5174'); },
  get jwtSecret() { return str('JWT_SECRET', 'dev-secret'); },
  get paymentsMode() { return str('PAYMENTS_MODE', 'mock') === 'live' ? ('live' as const) : ('mock' as const); },
  get loginRateLimit() { return Number(str('LOGIN_RATE_LIMIT', '10')); },
  /** Requests per minute per IP for checkout and payment retries. */
  get checkoutRateLimit() { return Number(str('CHECKOUT_RATE_LIMIT', '10')); },
  /** Requests per minute per IP for guest order lookups and payment polling. */
  get lookupRateLimit() { return Number(str('LOOKUP_RATE_LIMIT', '30')); },
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

const WEAK_SECRETS = /^(change-?me|dev-secret|secret|password|jwt|test)/i;
// Empty counts as unset: the value is then derived (Vercel domain) or defaulted.
const url = z.union([z.literal(''), z.string().url()]);
const optionalNumber = z.string().regex(/^\d+$/, 'must be a whole number').optional();

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    API_PORT: z.string().regex(/^\d+$/, 'must be a port number').optional(),
    PUBLIC_API_URL: url.optional(),
    STOREFRONT_URL: url.optional(),
    ADMIN_URL: url.optional(),
    JWT_SECRET: z.string().optional(),
    PAYMENTS_MODE: z.enum(['mock', 'live']).optional(),
    ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: z.enum(['true', 'false']).optional(),
    LOGIN_RATE_LIMIT: optionalNumber,
    CHECKOUT_RATE_LIMIT: optionalNumber,
    LOOKUP_RATE_LIMIT: optionalNumber,
    MPESA_ENV: z.enum(['sandbox', 'production']).optional(),
    MPESA_CALLBACK_SECRET: z.string().optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  })
  .passthrough()
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.NODE_ENV !== 'production') return;
    const secret = v.JWT_SECRET ?? '';
    if (secret.length < 32 || WEAK_SECRETS.test(secret)) issue('JWT_SECRET', 'must be a random value of at least 32 characters in production (e.g. openssl rand -base64 48)');
    for (const key of ['STOREFRONT_URL', 'ADMIN_URL'] as const) {
      if (!v[key] && v.VERCEL_PROJECT_PRODUCTION_URL) continue; // derived from the Vercel production domain
      if (!v[key]) issue(key, 'is required in production (it is the only allowed CORS origin)');
      else if (!v[key]!.startsWith('https://')) issue(key, 'must be an https:// URL in production');
    }
    if (v.PAYMENTS_MODE !== 'live' && v.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== 'true') {
      issue('PAYMENTS_MODE', 'mock payments let any buyer mark their own order paid; set PAYMENTS_MODE=live in production');
    }
    if (v.PAYMENTS_MODE === 'live') {
      if ((v.MPESA_CALLBACK_SECRET ?? '').length < 24 || WEAK_SECRETS.test(v.MPESA_CALLBACK_SECRET ?? '')) {
        issue('MPESA_CALLBACK_SECRET', 'must be a random value of at least 24 characters when PAYMENTS_MODE=live');
      }
      if (!v.PAYSTACK_SECRET_KEY) issue('PAYSTACK_SECRET_KEY', 'is required when PAYMENTS_MODE=live');
    }
  });

/** Validates the process environment. Throws one readable error listing every problem. Never prints secret values. */
export function validateEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
