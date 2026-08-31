import { Test } from '@nestjs/testing';
import { RoutingConfigService } from '../../src/config/routing-config.service.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';

const VALID_YAML = `
currencies:
  ARS:
    min: 2000
    max: 10000000
  INR:
    min: 200
    max: 100000

webhooks:
  ARS: 'https://webhook.site/ars-test'
  INR: 'https://webhook.site/inr-test'
`.trim();

const INVALID_YAML = `{}`;

async function buildService(): Promise<RoutingConfigService> {
  vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);

  const module = await Test.createTestingModule({
    providers: [RoutingConfigService],
  }).compile();

  const service = module.get(RoutingConfigService);
  service.onModuleInit();

  return service;
}

describe('RoutingConfigService', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('parses currency rules from YAML', async () => {
    const service = await buildService();

    expect(service.getRule('ARS')).toEqual({ min: 2000, max: 10000000 });
    expect(service.getRule('INR')).toEqual({ min: 200, max: 100000 });
  });

  it('returns undefined for unknown currency', async () => {
    const service = await buildService();

    expect(service.getRule('USD')).toBeUndefined();
  });

  it('returns webhook URL for known currency', async () => {
    const service = await buildService();

    expect(service.getWebhookUrl('ARS')).toBe('https://webhook.site/ars-test');
  });

  it('returns undefined webhook URL for unknown currency', async () => {
    const service = await buildService();

    expect(service.getWebhookUrl('USD')).toBeUndefined();
  });

  it('returns all supported currencies', async () => {
    const service = await buildService();

    expect(service.getSupportedCurrencies()).toEqual(
      expect.arrayContaining(['ARS', 'INR']),
    );
  });

  it('throws on startup when config is invalid', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(INVALID_YAML);

    const module = await Test.createTestingModule({
      providers: [RoutingConfigService],
    }).compile();

    const service = module.get(RoutingConfigService);

    expect(() => service.onModuleInit()).toThrow(/Fatal/);
  });
});
