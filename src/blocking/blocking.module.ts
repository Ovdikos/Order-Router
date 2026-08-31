import { Module } from '@nestjs/common';
import { BlockingService } from './blocking.service.js';

@Module({
  providers: [BlockingService],
  exports: [BlockingService],
})
export class BlockingModule {}
