import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import type { SendResult } from './provider.types';

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger('EmailProvider');
  private transporter?: Transporter;

  get configured() {
    return Boolean(env.smtpUrl);
  }

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.log(`[logged] Email to ${to} | ${subject}: ${body}`);
      return { note: 'logged' };
    }
    this.transporter ??= createTransport(env.smtpUrl);
    await this.transporter.sendMail({ from: env.emailFrom, to, subject, text: body });
    return {};
  }
}
