import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { RouteOrderHandler } from '../../src/orders/handlers/route-order.handler.js';
import { BlockingService } from '../../src/blocking/blocking.service.js';
import { RoutingConfigService } from '../../src/config/routing-config.service.js';
import { DeliveryProducer } from '../../src/delivery/delivery.producer.js';
import { RouteOrderCommand } from '../../src/orders/commands/route-order.command.js';
import { ClientBlockedException } from '../../src/orders/exceptions/client-blocked.exception.js';
import { RoutingRejectedException } from '../../src/orders/exceptions/routing-rejected.exception.js';

const VALID_UUID_V7 = '018d3b5c-1234-7abc-8def-000000000001';
const CLIENT_ID = 'cl_test123';
const CURRENCY = 'ARS';
const VALID_AMOUNT = 50_000;
const ARS_RULE = { min: 2000, max: 10_000_000 };

vi.mock('../../src/shared/uuid-v7.utils.js', () => ({
  extractCreatedAtFromUuidV7: vi.fn().mockReturnValue('2024-01-15T10:00:00.000Z'),
}));

function makeBlockingMock() {
  return {
    isBlocked: vi.fn().mockResolvedValue(false),
    recordAccepted: vi.fn().mockResolvedValue(undefined),
    recordRejection: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConfigMock() {
  return {
    getRule: vi.fn().mockReturnValue(ARS_RULE),
    getWebhookUrl: vi.fn().mockReturnValue('https://webhook.site/test'),
    getSupportedCurrencies: vi.fn().mockReturnValue([CURRENCY]),
  };
}

function makeDeliveryMock() {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
  };
}

async function buildHandler(overrides?: {
  blocking?: Partial<ReturnType<typeof makeBlockingMock>>;
  config?: Partial<ReturnType<typeof makeConfigMock>>;
  delivery?: Partial<ReturnType<typeof makeDeliveryMock>>;
}) {
  const blockingMock = { ...makeBlockingMock(), ...overrides?.blocking };
  const configMock = { ...makeConfigMock(), ...overrides?.config };
  const deliveryMock = { ...makeDeliveryMock(), ...overrides?.delivery };

  const module = await Test.createTestingModule({
    providers: [
      RouteOrderHandler,
      { provide: BlockingService, useValue: blockingMock },
      { provide: RoutingConfigService, useValue: configMock },
      { provide: DeliveryProducer, useValue: deliveryMock },
    ],
  }).compile();

  return {
    handler: module.get(RouteOrderHandler),
    blocking: blockingMock,
    config: configMock,
    delivery: deliveryMock,
  };
}

function makeCommand(overrides?: Partial<RouteOrderCommand>): RouteOrderCommand {
  return new RouteOrderCommand(
    overrides?.orderId ?? VALID_UUID_V7,
    overrides?.clientId ?? CLIENT_ID,
    overrides?.currency ?? CURRENCY,
    overrides?.amount ?? VALID_AMOUNT,
  );
}

describe('RouteOrderHandler', () => {
  describe('execute', () => {
    it('throws ClientBlockedException when client is blocked', async () => {
      const { handler } = await buildHandler({
        blocking: { isBlocked: vi.fn().mockResolvedValue(true) },
      });

      await expect(handler.execute(makeCommand())).rejects.toThrow(ClientBlockedException);
    });

    it('calls recordRejection and throws RoutingRejectedException for unknown currency', async () => {
      const { handler, blocking } = await buildHandler({
        config: { getRule: vi.fn().mockReturnValue(undefined) },
      });

      await expect(
        handler.execute(makeCommand({ currency: 'XYZ' })),
      ).rejects.toThrow(RoutingRejectedException);

      expect(blocking.recordRejection).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('rejects with UNKNOWN_CURRENCY reason', async () => {
      const { handler } = await buildHandler({
        config: { getRule: vi.fn().mockReturnValue(undefined) },
      });

      const err = await handler.execute(makeCommand({ currency: 'XYZ' })).catch((e) => e);

      expect(err).toBeInstanceOf(RoutingRejectedException);
      expect((err as RoutingRejectedException).details.reason).toBe('UNKNOWN_CURRENCY');
    });

    it('calls recordRejection and throws RoutingRejectedException when amount < min', async () => {
      const { handler, blocking } = await buildHandler();

      await expect(
        handler.execute(makeCommand({ amount: 100 })), // ARS min is 2000
      ).rejects.toThrow(RoutingRejectedException);

      expect(blocking.recordRejection).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('calls recordRejection and throws RoutingRejectedException when amount > max', async () => {
      const { handler, blocking } = await buildHandler();

      await expect(
        handler.execute(makeCommand({ amount: 999_999_999 })), // ARS max is 10_000_000
      ).rejects.toThrow(RoutingRejectedException);

      expect(blocking.recordRejection).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('rejects with AMOUNT_OUT_OF_RANGE reason and correct allowed_range', async () => {
      const { handler } = await buildHandler();

      const err = await handler.execute(makeCommand({ amount: 100 })).catch((e) => e);

      expect(err).toBeInstanceOf(RoutingRejectedException);
      expect((err as RoutingRejectedException).details.reason).toBe('AMOUNT_OUT_OF_RANGE');
      expect((err as RoutingRejectedException).details.allowed_range).toEqual(ARS_RULE);
    });

    it('happy path: calls recordAccepted, enqueues payload, and returns accepted', async () => {
      const { handler, blocking, delivery } = await buildHandler();

      const result = await handler.execute(makeCommand());

      expect(blocking.recordAccepted).toHaveBeenCalledWith(CLIENT_ID);
      expect(delivery.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: VALID_UUID_V7,
          client_id: CLIENT_ID,
          currency: CURRENCY,
          amount: VALID_AMOUNT,
          created_at: '2024-01-15T10:00:00.000Z',
        }),
      );
      expect(result).toEqual({ status: 'accepted', order_id: VALID_UUID_V7 });
    });

    it('throws ServiceUnavailableException when enqueue fails', async () => {
      const { handler } = await buildHandler({
        delivery: { enqueue: vi.fn().mockRejectedValue(new Error('Redis down')) },
      });

      await expect(handler.execute(makeCommand())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
