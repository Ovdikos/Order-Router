import { Module } from '@nestjs/common';
import { RoutingConfigService } from './routing-config.service.js';

@Module({
  providers: [RoutingConfigService],
  exports: [RoutingConfigService],
})
export class ConfigModule {}
