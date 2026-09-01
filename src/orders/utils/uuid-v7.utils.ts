import { InvalidOrderDateException } from '../exceptions/invalid-order-date.exception.js';

const MIN_TIMESTAMP_MS = new Date('2020-01-01T00:00:00.000Z').getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function extractCreatedAtFromUuidV7(uuid: string): string {
  const hex = uuid.replace(/-/g, '').substring(0, 12);
  const timestampMs = parseInt(hex, 16);

  const maxTimestampMs = Date.now() + ONE_DAY_MS;

  if (timestampMs < MIN_TIMESTAMP_MS || timestampMs > maxTimestampMs) {
    throw new InvalidOrderDateException(uuid, new Date(timestampMs).toISOString());
  }

  return new Date(timestampMs).toISOString();
}
