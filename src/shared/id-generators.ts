export function prefixedUuid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
