import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface OrderEvent {
  type: 'order.created' | 'order.updated';
  data: { id: string; reference: string; status: string; fulfilment: string; totalCents: number };
}

@Injectable()
export class OrderEventsService {
  readonly stream = new Subject<OrderEvent>();

  emit(type: OrderEvent['type'], order: OrderEvent['data'] & Record<string, unknown>) {
    const { id, reference, status, fulfilment, totalCents } = order;
    this.stream.next({ type, data: { id, reference, status, fulfilment, totalCents } });
  }
}
