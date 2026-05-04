export function parsePositiveIntegerStrict(value: string, flagName: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

export function parseNonEmptyString(value: string, flagName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flagName} must be a non-empty string`);
  }
  return trimmed;
}
