import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { CurrencyRule, RoutingRules } from './routing-rules.types.js';

@Injectable()
export class RoutingConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutingConfigService.name);

  private rules: RoutingRules = { currencies: {} };
  private intervalRef: NodeJS.Timeout | undefined;

  private readonly configPath: string = path.resolve(
    process.env['CONFIG_PATH'] ?? './config/routing-rules.yaml',
  );

  onModuleInit(): void {
    // First load is strict: missing or invalid config prevents startup.
    this.loadConfig(true);

    // Reload every 10 seconds. Broken config during hot-reload is logged
    // but the service keeps running with the previous valid rules.
    // We avoid chokidar here because it has known issues with Docker on
    // Windows / macOS (inotify / FSEvents differences).
    this.intervalRef = setInterval(() => this.loadConfig(false), 10_000);
  }

  onModuleDestroy(): void {
    if (this.intervalRef !== undefined) {
      clearInterval(this.intervalRef);
    }
  }

  /**
   * Reads and parses the YAML config file.
   *
   * @param failOnError - When true (startup), an invalid config throws and
   *   prevents the application from starting. When false (hot-reload), errors
   *   are only logged and the previous valid rules are kept in memory.
   */
  private loadConfig(failOnError: boolean): void {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = yaml.load(raw) as unknown;

      if (!this.isValidConfig(parsed)) {
        throw new Error(
          'Invalid config structure: "currencies" must be a non-empty object where every entry has numeric min <= max',
        );
      }

      this.rules = parsed;
      this.logger.log(
        `Config loaded: ${Object.keys(parsed.currencies).join(', ')}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (failOnError) {
        // Rethrow so NestJS lifecycle hooks abort the bootstrap.
        throw new Error(`Fatal: cannot start without valid config — ${message}`);
      }

      // Hot-reload failure: keep previous rules, do not crash.
      this.logger.error(`Config reload failed, keeping previous rules: ${message}`);
    }
  }

  /**
   * Type-guard that validates the shape of a parsed YAML object.
   * Checks:
   *  - top-level `currencies` key is a non-empty plain object
   *  - every currency entry has numeric `min` and `max` with min <= max
   */
  private isValidConfig(config: unknown): config is RoutingRules {
    if (config === null || typeof config !== 'object') return false;

    const candidate = config as Record<string, unknown>;

    if (
      candidate['currencies'] === null ||
      typeof candidate['currencies'] !== 'object' ||
      Array.isArray(candidate['currencies'])
    ) {
      return false;
    }

    const currencies = candidate['currencies'] as Record<string, unknown>;

    if (Object.keys(currencies).length === 0) return false;

    for (const rule of Object.values(currencies)) {
      if (rule === null || typeof rule !== 'object') return false;

      const r = rule as Record<string, unknown>;

      if (typeof r['min'] !== 'number' || typeof r['max'] !== 'number') return false;
      if (r['min'] > r['max']) return false;
    }

    return true;
  }

  getRule(currency: string): CurrencyRule | undefined {
    return this.rules.currencies[currency];
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(this.rules.currencies);
  }

  getWebhookUrl(currency: string): string | undefined {
    return this.rules.webhooks?.[currency];
  }
}
