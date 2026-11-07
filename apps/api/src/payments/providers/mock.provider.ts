import { Injectable } from '@nestjs/common';
import { formatKes } from '@dantes/shared';
import type { Payment } from '@prisma/client';
import type { InitiateContext, InitiateResult, PaymentProvider, VerifyResult } from './payment-provider';

@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  async initiate({ payment }: InitiateContext): Promise<InitiateResult> {
    return {
      providerRef: `mock_${payment.id}`,
      instructions: `Mock payment of ${formatKes(payment.amountCents)}: use the "Simulate payment" buttons to approve or fail it.`,
    };
  }

  async verify(payment: Payment): Promise<VerifyResult> {
    return { outcome: 'PENDING', amountCents: payment.amountCents, currency: payment.currency };
  }
}
