export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data };
}

export function fail(error: string): OperationResult<never> {
  return { ok: false, error };
}
