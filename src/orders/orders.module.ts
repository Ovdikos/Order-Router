import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '../config/config.module.js';
import { BlockingModule } from '../blocking/blocking.module.js';
import { DeliveryProducer } from '../delivery/delivery.producer.js';
import { OrdersController } from './orders.controller.js';
import { RouteOrderHandler } from './handlers/route-order.handler.js';

@Module({
  imports: [
    CqrsModule,
    ConfigModule,
    BlockingModule,
  ],
  controllers: [OrdersController],
  providers: [
    RouteOrderHandler,
    DeliveryProducer,
  ],
})
export class OrdersModule {}
