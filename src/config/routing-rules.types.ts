export interface CurrencyRule {
  min: number;
  max: number;
}

export interface RoutingRules {
  currencies: Record<string, CurrencyRule>;
  webhooks?: Record<string, string>;
}
