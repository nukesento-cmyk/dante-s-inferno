import { LoggerService } from '@nestjs/common';
import { maskSensitive } from './mask';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

export class JsonLogger implements LoggerService {
  private write(level: Level, message: unknown, context?: string, extra?: unknown) {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      context,
      msg: typeof message === 'string' ? maskSensitive(message) : message instanceof Error ? maskSensitive(message.message) : message,
      ...(extra ? { extra: JSON.parse(maskSensitive(JSON.stringify(extra))) } : {}),
    });
    (level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(line + '\n');
  }

  private split(optional: unknown[]) {
    const context = typeof optional[optional.length - 1] === 'string' ? (optional[optional.length - 1] as string) : undefined;
    return { context, rest: context ? optional.slice(0, -1) : optional };
  }

  log(message: unknown, ...o: unknown[]) { this.write('log', message, this.split(o).context); }
  warn(message: unknown, ...o: unknown[]) { this.write('warn', message, this.split(o).context); }
  debug(message: unknown, ...o: unknown[]) { this.write('debug', message, this.split(o).context); }
  verbose(message: unknown, ...o: unknown[]) { this.write('verbose', message, this.split(o).context); }
  fatal(message: unknown, ...o: unknown[]) { this.write('fatal', message, this.split(o).context); }
  error(message: unknown, ...o: unknown[]) {
    const { context, rest } = this.split(o);
    this.write('error', message, context, rest.length ? rest : undefined);
  }
}
