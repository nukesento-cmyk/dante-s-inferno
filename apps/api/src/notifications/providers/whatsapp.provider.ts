import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import type { SendResult } from './provider.types';

@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger('WhatsAppProvider');

  get configured() {
    return Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId);
  }

  async send(to: string, body: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.log(`[logged] WhatsApp to ${to}: ${body}`);
      return { note: 'logged' };
    }
    const { token, phoneNumberId } = env.whatsapp;
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body } }),
    });
    if (!res.ok) throw new Error(`WhatsApp Cloud API responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return {};
  }
}
