import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '../config/config.module.js';
import { DeliveryProducer } from './delivery.producer.js';
import { DeliveryProcessor } from './delivery.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'order-delivery' }),
    ConfigModule,
  ],
  providers: [DeliveryProducer, DeliveryProcessor],
  exports: [DeliveryProducer],
})
export class DeliveryModule {}
