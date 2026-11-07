import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express, NextFunction, Request, Response } from 'express';
import { env } from './config/env';
import { UPLOADS_DIR } from './catalogue/admin-catalogue.controller';
import { AllExceptionsFilter } from './common/http-exception.filter';

export function configureApp(app: INestApplication, opts: { swagger?: boolean; requestLog?: boolean } = {}) {
  const http = app.getHttpAdapter().getInstance() as Express;
  if (env.isProduction) http.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  (app as NestExpressApplication).useStaticAssets(UPLOADS_DIR, { prefix: '/uploads', maxAge: '7d', index: false, dotfiles: 'deny' });
  app.enableCors({ origin: [env.storefrontUrl, env.adminUrl], credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());

  if (opts.requestLog) {
    const logger = new Logger('http');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const started = Date.now();
      res.on('finish', () => logger.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`));
      next();
    });
  }

  if (opts.swagger) {
    const config = new DocumentBuilder().setTitle("Dante's Pizza API").setVersion('1').addCookieAuth('dp_staff').addApiKey({ type: 'apiKey', name: 'X-Cart-Token', in: 'header' }, 'cart-token').build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  return app;
}
