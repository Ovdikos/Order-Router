import { Injectable } from '@nestjs/common';

export interface OrderPayload {
  order_id: string;
  client_id: string;
  currency: string;
  amount: number;
  created_at: string;
}

@Injectable()
export class DeliveryProducer {
  async enqueue(_payload: OrderPayload): Promise<void> {
    // TODO: push to BullMQ queue
  }
}
