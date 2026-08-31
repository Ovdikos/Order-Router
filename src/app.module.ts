import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from './redis/redis.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env['REDIS_HOST'] ?? 'localhost',
          port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
        },
      }),
    }),
    RedisModule,
    DeliveryModule,
    OrdersModule,
  ],
})
export class AppModule {}

