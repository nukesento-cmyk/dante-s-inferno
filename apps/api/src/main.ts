import 'reflect-metadata';
import { env, validateEnv } from './config/env';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { JsonLogger } from './common/json-logger';

async function main() {
  validateEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(new JsonLogger());
  configureApp(app, { swagger: !env.isProduction, requestLog: true });
  app.enableShutdownHooks();
  await app.listen(env.port);
  new Logger('Bootstrap').log(`API listening on :${env.port} (payments: ${env.paymentsMode})`);
}

void main();
