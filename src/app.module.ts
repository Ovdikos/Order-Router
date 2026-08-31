import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    RedisModule,
    OrdersModule,
  ],
})
export class AppModule {}
