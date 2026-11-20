/** Monotonic ISO 8601 timestamp relative to a previous value (avoids equal timestamps). */
export function nextTimestamp(previous: string): string {
  const previousTime = Date.parse(previous);
  const now = Date.now();
  return new Date(Number.isNaN(previousTime) ? now : Math.max(now, previousTime + 1)).toISOString();
}
