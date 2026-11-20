import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Errors from this module deliberately name only the data file, never a local path. */
export class DataStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataStoreError";
  }
}

export async function readJsonArray<T>(fileName: string): Promise<T[]> {
  let raw: string;
  try {
    // Relative to this module, so both src/ and dist/ builds resolve data/ at the project root.
    raw = await readFile(fileURLToPath(new URL(`../../data/${fileName}`, import.meta.url)), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DataStoreError(`Synthetic data file '${fileName}' is missing.`);
    }
    throw new DataStoreError(`Synthetic data file '${fileName}' could not be read.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DataStoreError(`Synthetic data file '${fileName}' contains malformed JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new DataStoreError(`Synthetic data file '${fileName}' must contain a JSON array.`);
  }
  return parsed as T[];
}
