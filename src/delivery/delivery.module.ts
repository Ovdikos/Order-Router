import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '../config/config.module.js';
import { DeliveryProducer } from './delivery.producer.js';
import { DeliveryProcessor } from './delivery.processor.js';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'order-delivery' }),
    ConfigModule, BullBoardModule.forFeature({
      name: 'order-delivery',
      adapter: BullMQAdapter,
    }),
  ],
  providers: [DeliveryProducer, DeliveryProcessor],
  exports: [DeliveryProducer],
})
export class DeliveryModule { }
