import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { RedisModule } from './redis/redis.module.js';
import { RedisService } from './redis/redis.service.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        connection: redis.getClient(),
      }),
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    DeliveryModule,
    OrdersModule,
  ],
})
export class AppModule {}
