import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

const TOTAL_PREFIX = 'client:total:';
const REJECTED_PREFIX = 'client:rejected:';
const BLOCKED_SET = 'blocked_clients';

// 30 days in seconds
const COUNTERS_TTL_S = 30 * 24 * 60 * 60;

@Injectable()
export class BlockingService {
  private readonly logger = new Logger(BlockingService.name);

  constructor(private readonly redis: RedisService) {}

  async isBlocked(clientId: string): Promise<boolean> {
    const result = await this.redis.sismember(BLOCKED_SET, clientId);
    return result === 1;
  }

  async recordAccepted(clientId: string): Promise<void> {
    const totalKey = `${TOTAL_PREFIX}${clientId}`;
    await this.redis.incr(totalKey);
    await this.redis.expire(totalKey, COUNTERS_TTL_S);
  }

  async recordRejection(clientId: string): Promise<void> {
    const totalKey = `${TOTAL_PREFIX}${clientId}`;
    const rejectedKey = `${REJECTED_PREFIX}${clientId}`;

    // INCR returns the new value after increment — no separate GET needed.
    // Two sequential INCRs are not fully atomic, but the ±1 drift at the
    // threshold (100 orders / 30%) is an accepted trade-off over Lua complexity.
    const total = await this.redis.incr(totalKey);
    const rejected = await this.redis.incr(rejectedKey);

    await this.redis.expire(totalKey, COUNTERS_TTL_S);
    await this.redis.expire(rejectedKey, COUNTERS_TTL_S);

    if (total >= 100 && rejected / total > 0.3) {
      await this.redis.sadd(BLOCKED_SET, clientId);
      this.logger.warn(
        `Client ${clientId} blocked — total=${total}, rejected=${rejected} (${((rejected / total) * 100).toFixed(1)}%)`,
      );
    }
  }
}
