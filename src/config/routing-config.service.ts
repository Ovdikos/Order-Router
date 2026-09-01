import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

const CurrencyRuleSchema = z.object({
  min: z.number(),
  max: z.number(),
}).refine((r) => r.min <= r.max, { message: 'min must be <= max' });

const RoutingRulesSchema = z.object({
  currencies: z.record(z.string(), CurrencyRuleSchema).refine(
    (c) => Object.keys(c).length > 0,
    { message: 'currencies must not be empty' },
  ),
  webhooks: z.record(z.string(), z.string()).optional(),
});

type RoutingRules = z.infer<typeof RoutingRulesSchema>;

@Injectable()
export class RoutingConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutingConfigService.name);

  private rules: RoutingRules = { currencies: {} };
  private intervalRef: NodeJS.Timeout | undefined;

  private readonly configPath: string = path.resolve(
    process.env['CONFIG_PATH'] ?? './config/routing-rules.yaml',
  );

  onModuleInit(): void {
    this.loadConfigOrThrow();
    this.intervalRef = setInterval(() => this.tryReloadConfig(), 10_000);
  }

  onModuleDestroy(): void {
    if (this.intervalRef !== undefined) {
      clearInterval(this.intervalRef);
    }
  }

  private parse(): RoutingRules {
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const parsed = yaml.load(raw);
    return RoutingRulesSchema.parse(parsed);
  }

  private loadConfigOrThrow(): void {
    try {
      this.rules = this.parse();
      this.logger.log(`Config loaded: ${Object.keys(this.rules.currencies).join(', ')}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Fatal: cannot start without valid config — ${message}`);
    }
  }

  private tryReloadConfig(): void {
    try {
      this.rules = this.parse();
      this.logger.log(`Config reloaded: ${Object.keys(this.rules.currencies).join(', ')}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Config reload failed, keeping previous rules: ${message}`);
    }
  }

  getRule(currency: string): { min: number; max: number } | undefined {
    return this.rules.currencies[currency];
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(this.rules.currencies);
  }

  getWebhookUrl(currency: string): string | undefined {
    return this.rules.webhooks?.[currency];
  }
}
