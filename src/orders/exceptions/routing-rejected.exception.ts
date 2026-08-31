export type RejectionReason = 'UNKNOWN_CURRENCY' | 'AMOUNT_OUT_OF_RANGE';

export interface RejectionDetails {
  reason: RejectionReason;
  currency: string;
  allowed_range?: { min: number; max: number };
}

export class RoutingRejectedException extends Error {
  constructor(public readonly details: RejectionDetails) {
    super(`Routing rejected: ${details.reason}`);
    this.name = 'RoutingRejectedException';
  }
}
