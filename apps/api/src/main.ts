import 'reflect-metadata';
import { env } from './config/env';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { JsonLogger } from './common/json-logger';

async function main() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(new JsonLogger());
  configureApp(app, { swagger: true, requestLog: true });
  app.enableShutdownHooks();
  await app.listen(env.port);
  new Logger('Bootstrap').log(`API listening on :${env.port} (payments: ${env.paymentsMode})`);
}

void main();
