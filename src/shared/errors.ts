export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function domainError(message: string) {
  return new DomainError(message);
}
