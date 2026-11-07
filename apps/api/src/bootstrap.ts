import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express, NextFunction, Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { env } from './config/env';
import { UPLOADS_DIR } from './catalogue/admin-catalogue.controller';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { maskSensitive } from './common/mask';

export const JSON_BODY_LIMIT = '100kb';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Routes that legitimately receive non-JSON bodies: the image upload (multipart) and provider webhooks. */
const NON_JSON_ROUTES = [/^\/api\/v1\/admin\/uploads\/image$/, /^\/api\/v1\/payments\/mpesa\/callback\//, /^\/api\/v1\/payments\/paystack\/webhook$/];
const SENSITIVE_NO_STORE = /^\/api\/v1\/(admin|auth|account|orders|checkout|cart)(\/|$)/;

export function allowedOrigins() {
  return [env.storefrontUrl, env.adminUrl].map((u) => u.replace(/\/$/, ''));
}

function reject(res: Response, statusCode: number, message: string) {
  res.status(statusCode).json({ statusCode, error: STATUS_CODES[statusCode], message });
}

/**
 * CSRF defence in depth on top of SameSite=Lax cookies:
 *  - a browser-supplied Origin on a state-changing request must be one of ours;
 *  - a request that carries a body must be application/json (a cross-site HTML form cannot send that without a CORS preflight).
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE.has(req.method) || !req.path.startsWith('/api/')) return next();
  const exempt = NON_JSON_ROUTES.some((r) => r.test(req.path));
  const origin = req.headers.origin;
  if (origin && !exempt && !allowedOrigins().includes(origin) && origin !== env.publicApiUrl.replace(/\/$/, '')) {
    return reject(res, 403, 'Origin not allowed');
  }
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !exempt && !req.is('application/json')) return reject(res, 415, 'Content-Type must be application/json');
  next();
}

export function configureApp(app: INestApplication, opts: { swagger?: boolean; requestLog?: boolean } = {}) {
  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable('x-powered-by');
  if (env.isProduction) http.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');

  // JSON API: no inline content, no framing, no sniffing, HSTS in production. Uploaded images are embedded by the storefront.
  app.use(
    helmet({
      contentSecurityPolicy: opts.swagger ? false : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use('/uploads', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SENSITIVE_NO_STORE.test(req.path)) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Strict CORS: only the storefront and admin origins, never a wildcard, never reflecting arbitrary origins.
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, !origin || allowedOrigins().includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Cart-Token'],
    maxAge: 600,
  });

  app.use(cookieParser());
  app.use(csrfGuard);
  const nest = app as NestExpressApplication;
  nest.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  nest.useBodyParser('urlencoded', { extended: false, limit: JSON_BODY_LIMIT });
  // Errors raised by the body parsers happen outside Nest's filters: answer with the standard error shape, no stack.
  app.use((err: { status?: number; statusCode?: number; type?: string } | undefined, _req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    const statusCode = err.status ?? err.statusCode ?? 500;
    const message = err.type === 'entity.too.large' ? 'Request body is too large' : statusCode === 500 ? 'Internal server error' : 'Malformed request body';
    if (statusCode >= 500) new Logger('http').error(maskSensitive(String((err as Error).stack ?? err)));
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ statusCode, error: STATUS_CODES[statusCode] ?? 'Error', message });
  });

  nest.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads', maxAge: '7d', index: false, dotfiles: 'deny' });
  app.useGlobalFilters(new AllExceptionsFilter());

  if (opts.requestLog) {
    const logger = new Logger('http');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const started = Date.now();
      res.on('finish', () => logger.log(`${req.method} ${req.originalUrl.split('?')[0]!.replace(/(\/mpesa\/callback\/)[^/]+/, '$1***')} ${res.statusCode} ${Date.now() - started}ms`));
      next();
    });
  }

  if (opts.swagger) {
    const config = new DocumentBuilder().setTitle("Dante's Pizza API").setVersion('1').addCookieAuth('dp_staff').addApiKey({ type: 'apiKey', name: 'X-Cart-Token', in: 'header' }, 'cart-token').build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  return app;
}
