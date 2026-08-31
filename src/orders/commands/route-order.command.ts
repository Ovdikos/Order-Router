export class RouteOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly clientId: string,
    public readonly currency: string,
    public readonly amount: number,
  ) {}
}
