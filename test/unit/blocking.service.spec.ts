import { Test } from '@nestjs/testing';
import { BlockingService } from '../../src/blocking/blocking.service.js';
import { RedisService } from '../../src/redis/redis.service.js';

const CLIENT_ID = 'cl_testclient';

function makeRedisMock() {
  return {
    sismember: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    get: vi.fn(),
  };
}

async function buildService(redisMock: ReturnType<typeof makeRedisMock>) {
  const module = await Test.createTestingModule({
    providers: [
      BlockingService,
      { provide: RedisService, useValue: redisMock },
    ],
  }).compile();

  return module.get(BlockingService);
}

describe('BlockingService', () => {
  describe('isBlocked', () => {
    it('returns true when sismember returns 1', async () => {
      const redis = makeRedisMock();
      redis.sismember.mockResolvedValue(1);
      const service = await buildService(redis);

      expect(await service.isBlocked(CLIENT_ID)).toBe(true);
      expect(redis.sismember).toHaveBeenCalledWith('blocked_clients', CLIENT_ID);
    });

    it('returns false when sismember returns 0', async () => {
      const redis = makeRedisMock();
      redis.sismember.mockResolvedValue(0);
      const service = await buildService(redis);

      expect(await service.isBlocked(CLIENT_ID)).toBe(false);
    });
  });

  describe('recordRejection', () => {
    it('does NOT block when total < 100', async () => {
      const redis = makeRedisMock();
      redis.incr
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(20); // rejected
      const service = await buildService(redis);

      await service.recordRejection(CLIENT_ID);

      expect(redis.sadd).not.toHaveBeenCalled();
    });

    it('does NOT block when total >= 100 but ratio <= 30%', async () => {
      const redis = makeRedisMock();
      redis.incr
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20); // rejected = 20%
      const service = await buildService(redis);

      await service.recordRejection(CLIENT_ID);

      expect(redis.sadd).not.toHaveBeenCalled();
    });

    it('blocks client when total >= 100 and ratio > 30%', async () => {
      const redis = makeRedisMock();
      redis.incr
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(31); // rejected = 31%
      const service = await buildService(redis);

      await service.recordRejection(CLIENT_ID);

      expect(redis.sadd).toHaveBeenCalledWith('blocked_clients', CLIENT_ID);
    });
  });
});
