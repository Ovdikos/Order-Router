export class ClientBlockedException extends Error {
  constructor(public readonly clientId: string) {
    super(`Client ${clientId} is blocked`);
    this.name = 'ClientBlockedException';
  }
}
