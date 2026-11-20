export type Lookup<T> = { found: true; data: T } | { found: false; message: string };

export function found<T>(data: T): Lookup<T> {
  return { found: true, data };
}

export function notFound(entity: string, id: string): Lookup<never> {
  return {
    found: false,
    message: `${entity} with id '${id}' was not found in the synthetic dataset.`
  };
}
