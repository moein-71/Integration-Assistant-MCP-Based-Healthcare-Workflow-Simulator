import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// No tools, resources or prompts are registered in Stage 1.
// The SDK still answers the standard MCP `ping` request automatically.
const server = new McpServer({ name: "integration-assistant", version: "0.1.0" });

async function shutdown(signal: string): Promise<void> {
  try {
    await server.close();
  } catch (error) {
    console.error(`MCP server shutdown error (${signal}):`, error);
  } finally {
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved exclusively for MCP protocol messages.
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error("Failed to start integration-assistant MCP server:", error);
  process.exit(1);
});
