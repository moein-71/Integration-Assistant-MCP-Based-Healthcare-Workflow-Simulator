import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Resolve the server entry relative to this module (not to process.cwd()).
 * Supports both the TypeScript source and the compiled JavaScript output.
 */
export function resolveServerEntry(): string {
  const candidates = [
    fileURLToPath(new URL("../server/index.ts", import.meta.url)),
    fileURLToPath(new URL("../server/index.js", import.meta.url))
  ];

  const entry = candidates.find(candidate => existsSync(candidate));
  if (!entry) {
    throw new Error(`MCP server entry point not found. Tried: ${candidates.join(", ")}`);
  }
  return entry;
}

export function createServerTransport(): StdioClientTransport {
  const entry = resolveServerEntry();
  const args = entry.endsWith(".ts") ? ["--import", "tsx", entry] : [entry];

  return new StdioClientTransport({
    command: process.execPath,
    args,
    stderr: "inherit"
  });
}

export async function runSmoke(): Promise<{ childPid: number | null; serverName: string | undefined }> {
  const transport = createServerTransport();
  const client = new Client({ name: "integration-assistant-smoke-client", version: "0.1.0" });

  try {
    await client.connect(transport);
    await client.ping({ timeout: 5_000 });
    return { childPid: transport.pid, serverName: client.getServerVersion()?.name };
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const result = await runSmoke();
  console.log(
    `MCP stdio smoke test passed: ping OK (server pid ${result.childPid ?? "unknown"}, name: ${result.serverName ?? "unknown"})`
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    console.error("MCP stdio smoke test failed:", error);
    process.exitCode = 1;
  });
}
