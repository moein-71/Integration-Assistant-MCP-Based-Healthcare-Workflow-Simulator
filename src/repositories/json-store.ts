import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Errors from this module deliberately name only the data file, never a local path. */
export class DataStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataStoreError";
  }
}

/**
 * Default data location stays relative to this module (works from src/ and dist/).
 * MCP_DATA_DIR allows tests to point every spawned server at an isolated copy.
 */
function dataFilePath(fileName: string): string {
  const override = process.env.MCP_DATA_DIR;
  return override ? join(override, fileName) : fileURLToPath(new URL(`../../data/${fileName}`, import.meta.url));
}

export async function dataFileExists(fileName: string): Promise<boolean> {
  try {
    await access(dataFilePath(fileName));
    return true;
  } catch {
    return false;
  }
}

export async function readJsonArray<T>(fileName: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(dataFilePath(fileName), "utf8");
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

/** Writes to a temporary file first, then renames it into place (atomic replace). */
export async function writeJsonArray<T>(fileName: string, value: T[]): Promise<void> {
  const target = dataFilePath(fileName);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new DataStoreError(`Synthetic data file '${fileName}' could not be written.`);
  }
}
