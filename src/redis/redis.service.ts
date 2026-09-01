import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.client.status === 'wait') {
      try {
        await this.client.connect();
      } catch (err: any) {
        if (err.message !== 'Redis is already connecting/connected') {
          throw err;
        }
      }
    }
    this.logger.log(
      `Connected to Redis at ${this.client.options.host}:${this.client.options.port}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  sadd(key: string, member: string): Promise<number> {
    return this.client.sadd(key, member);
  }

  sismember(key: string, member: string): Promise<number> {
    return this.client.sismember(key, member);
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
