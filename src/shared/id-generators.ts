import { ulid } from "ulid";

export function prefixedUuid(prefix: string): string {
  // We use ULID for better sortability and cloud-sync readiness
  return `${prefix}_${ulid()}`;
}
