import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RoutingConfigService } from '../config/routing-config.service.js';
import { OrderPayload } from './delivery.producer.js';

@Processor('order-delivery', { concurrency: 25 })
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(private readonly config: RoutingConfigService) {
    super();
  }

  async process(job: Job<OrderPayload>): Promise<void> {
    const { order_id, currency } = job.data;

    const webhookUrl = this.config.getWebhookUrl(currency);
    if (!webhookUrl) {
      throw new Error(`No webhook URL configured for currency: ${currency}`);
    }

    this.logger.log(
      `Delivering order ${order_id} → ${webhookUrl} (attempt ${job.attemptsMade + 1})`,
    );

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.data),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status} for order ${order_id}`);
    }

    this.logger.log(`Order ${order_id} delivered successfully`);
  }
}
