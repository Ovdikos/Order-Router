import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { RouteOrderCommand } from '../commands/route-order.command.js';
import { RoutingConfigService } from '../../config/routing-config.service.js';
import { BlockingService } from '../../blocking/blocking.service.js';
import { DeliveryProducer } from '../../delivery/delivery.producer.js';
import { RedisService } from '../../redis/redis.service.js';
import { extractCreatedAtFromUuidV7 } from '../utils/uuid-v7.utils.js';
import { ClientBlockedException } from '../exceptions/client-blocked.exception.js';
import { RoutingRejectedException } from '../exceptions/routing-rejected.exception.js';

const ORDER_SEEN_TTL_S = 86_400;

@CommandHandler(RouteOrderCommand)
export class RouteOrderHandler implements ICommandHandler<RouteOrderCommand> {
  private readonly logger = new Logger(RouteOrderHandler.name);

  constructor(
    private readonly config: RoutingConfigService,
    private readonly blocking: BlockingService,
    private readonly delivery: DeliveryProducer,
    private readonly redis: RedisService,
  ) {}

  async execute(command: RouteOrderCommand): Promise<{ status: string; order_id: string }> {
    const { orderId, clientId, currency, amount } = command;

    const isNew = await this.redis.setNx(`order:seen:${orderId}`, '1', ORDER_SEEN_TTL_S);
    if (!isNew) {
      return { status: 'accepted', order_id: orderId };
    }

    if (await this.blocking.isBlocked(clientId)) {
      throw new ClientBlockedException(clientId);
    }

    const rule = this.config.getRule(currency);

    if (!rule) {
      await this.blocking.recordRejection(clientId);
      throw new RoutingRejectedException({ reason: 'UNKNOWN_CURRENCY', currency });
    }

    if (amount < rule.min || amount > rule.max) {
      await this.blocking.recordRejection(clientId);
      throw new RoutingRejectedException({
        reason: 'AMOUNT_OUT_OF_RANGE',
        currency,
        allowed_range: { min: rule.min, max: rule.max },
      });
    }

    const createdAt = extractCreatedAtFromUuidV7(orderId);

    try {
      await this.delivery.enqueue({
        order_id: orderId,
        client_id: clientId,
        currency,
        amount,
        created_at: createdAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue order ${orderId}: ${message}`);
      throw new ServiceUnavailableException({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Delivery queue temporarily unavailable. Please retry.',
        order_id: orderId,
      });
    }

    await this.blocking.recordAccepted(clientId);

    return { status: 'accepted', order_id: orderId };
  }
}
