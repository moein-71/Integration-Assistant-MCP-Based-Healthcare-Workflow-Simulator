import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "vitest";

function resolveServerEntry(): string {
  const candidates = [
    fileURLToPath(new URL("../../src/server/index.ts", import.meta.url)),
    fileURLToPath(new URL("../../dist/server/index.js", import.meta.url))
  ];

  const entry = candidates.find(candidate => existsSync(candidate));
  if (!entry) {
    throw new Error(`MCP server entry point not found. Tried: ${candidates.join(", ")}`);
  }
  return entry;
}

test("real MCP client pings a real stdio server process", async () => {
  const entry = resolveServerEntry();
  const args = entry.endsWith(".ts") ? ["--import", "tsx", entry] : [entry];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    stderr: "inherit"
  });
  const client = new Client({ name: "integration-assistant-test-client", version: "0.1.0" });

  try {
    await client.connect(transport);

    // The transport spawns a distinct child process; a pid proves it is not an in-process call.
    expect(transport.pid, "server must run as a separate child process").not.toBeNull();
    expect(client.getServerVersion()?.name).toBe("integration-assistant");
    await expect(client.ping({ timeout: 5_000 })).resolves.toBeDefined();
  } finally {
    await client.close();
  }
}, 20_000);
