import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import { maskSensitive } from './mask';

function isClientHttpError(e: unknown): e is { status?: number; statusCode?: number; type?: string } {
  const code = (e as { status?: unknown; statusCode?: unknown })?.status ?? (e as { statusCode?: unknown })?.statusCode;
  return e instanceof Error && typeof code === 'number' && code >= 400 && code < 500;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let statusCode = 500;
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'string' ? { message: r } : { ...(r as Record<string, unknown>) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') [statusCode, body] = [409, { message: 'That value already exists' }];
      else if (exception.code === 'P2025') [statusCode, body] = [404, { message: 'Not found' }];
      else if (exception.code === 'P2003') [statusCode, body] = [409, { message: 'Referenced record is in use or missing' }];
    } else if (isClientHttpError(exception)) {
      // body-parser / multer style errors (413 too large, 400 malformed JSON, ...)
      statusCode = exception.status ?? exception.statusCode ?? 400;
      body = { message: exception.type === 'entity.too.large' ? 'Request body is too large' : statusCode === 400 ? 'Malformed request body' : (STATUS_CODES[statusCode] ?? 'Error') };
    }

    if (statusCode >= 500) this.logger.error(maskSensitive(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)));
    if (res.headersSent) return;
    const { message, issues, code } = body as { message?: unknown; issues?: unknown; code?: unknown };
    res.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: Array.isArray(message) ? message.join('; ') : (message ?? 'Error'),
      ...(code ? { code } : {}),
      ...(issues ? { issues } : {}),
    });
  }
}
