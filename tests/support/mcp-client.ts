import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

const DATA_FILES = ["patients.json", "appointments.json", "lab-results.json", "workflows.json"];
const SOURCE_DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

export async function createIsolatedDataDir(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "mcp-simulator-"));
  for (const file of DATA_FILES) {
    await copyFile(join(SOURCE_DATA_DIR, file), join(dataDir, file));
  }
  return dataDir;
}

export async function readDataFile(dataDir: string, fileName: string): Promise<string> {
  return readFile(join(dataDir, fileName), "utf8");
}

export async function writeDataFile(dataDir: string, fileName: string, contents: string): Promise<void> {
  await writeFile(join(dataDir, fileName), contents, "utf8");
}

export interface ClientTestOptions {
  seed?: (dataDir: string) => Promise<void> | void;
  /** Reuse an existing temporary directory, e.g. to verify persistence across restarts. */
  reuseDataDir?: string;
}

/** Starts a real server against an isolated copy of the fixtures; always cleans up. */
export async function withClient<T>(
  fn: (client: Client, transport: StdioClientTransport, dataDir: string) => Promise<T>,
  options: ClientTestOptions = {}
): Promise<T> {
  const entry = fileURLToPath(new URL("../../src/server/index.ts", import.meta.url));
  if (!existsSync(entry)) {
    throw new Error("MCP server entry point not found");
  }

  const ownsDataDir = options.reuseDataDir === undefined;
  const dataDir = options.reuseDataDir ?? (await createIsolatedDataDir());
  try {
    if (options.seed) {
      await options.seed(dataDir);
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", entry],
      env: { MCP_DATA_DIR: dataDir },
      stderr: "inherit"
    });
    const client = new Client({ name: "integration-assistant-stage3-test-client", version: "0.3.0" });

    try {
      await client.connect(transport);
      return await fn(client, transport, dataDir);
    } finally {
      await client.close();
    }
  } finally {
    if (ownsDataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  }
}

// callTool() can also return a task-style result; our tools never do that.
function requireCallToolResult(result: ToolCallResult): CallToolResult {
  if (!("content" in result)) {
    throw new Error("Tool returned an unexpected task-style result");
  }
  return result as CallToolResult;
}

export function isErrorOf(result: ToolCallResult): boolean {
  return requireCallToolResult(result).isError === true;
}

export function textOf(result: ToolCallResult): string {
  const callResult = requireCallToolResult(result);
  const item = callResult.content.find(content => content.type === "text");
  if (!item || item.type !== "text") {
    throw new Error("Tool result did not contain text content");
  }
  return item.text;
}

export function dataOf<T>(result: ToolCallResult): T {
  const parsed = JSON.parse(textOf(result)) as { notice?: string; data: T };
  return parsed.data;
}
