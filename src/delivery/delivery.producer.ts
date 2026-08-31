import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface OrderPayload {
  order_id: string;
  client_id: string;
  currency: string;
  amount: number;
  created_at: string;
}

@Injectable()
export class DeliveryProducer {
  constructor(
    @InjectQueue('order-delivery') private readonly queue: Queue,
  ) {}

  async enqueue(payload: OrderPayload): Promise<void> {
    await this.queue.add('deliver', payload, {
      jobId: payload.order_id,
      attempts: 15,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  }
}
