import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import type { SendResult } from './provider.types';

@Injectable()
export class SmsProvider {
  private readonly logger = new Logger('SmsProvider');

  get configured() {
    return Boolean(env.at.username && env.at.apiKey);
  }

  async send(to: string, body: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.log(`[logged] SMS to ${to}: ${body}`);
      return { note: 'logged' };
    }
    const { username, apiKey, senderId } = env.at;
    const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const form = new URLSearchParams({ username, to, message: body });
    if (senderId) form.set('from', senderId);
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new Error(`Africa's Talking responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { SMSMessageData?: { Recipients?: { status?: string }[] } };
    const status = data.SMSMessageData?.Recipients?.[0]?.status;
    if (status && status !== 'Success') throw new Error(`Africa's Talking: ${status}`);
    return {};
  }
}
