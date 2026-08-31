export class InvalidOrderDateException extends Error {
  constructor(
    public readonly orderId: string,
    public readonly extractedDate: string,
  ) {
    super(`Invalid created_at extracted from UUID: ${extractedDate}`);
    this.name = 'InvalidOrderDateException';
  }
}
