import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

/** Starts a real server as a separate process for each test and always closes it. */
export async function withClient<T>(
  fn: (client: Client, transport: StdioClientTransport) => Promise<T>
): Promise<T> {
  const entry = fileURLToPath(new URL("../../src/server/index.ts", import.meta.url));
  if (!existsSync(entry)) {
    throw new Error("MCP server entry point not found");
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", entry],
    stderr: "inherit"
  });
  const client = new Client({ name: "integration-assistant-stage2-test-client", version: "0.2.0" });

  try {
    await client.connect(transport);
    return await fn(client, transport);
  } finally {
    await client.close();
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
