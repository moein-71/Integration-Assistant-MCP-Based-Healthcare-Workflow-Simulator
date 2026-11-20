import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppointmentTools } from "./tools/appointment.tools.js";
import { registerLabResultTools } from "./tools/lab-result.tools.js";
import { registerPatientTools } from "./tools/patient.tools.js";
import { registerWorkflowTools } from "./tools/workflow.tools.js";

// Read-only tools plus draft creation/validation/submission/revision over synthetic data.
// Approval, rejection, execution, resources and prompts are intentionally absent.
const server = new McpServer({ name: "integration-assistant", version: "0.3.0" });
registerPatientTools(server);
registerAppointmentTools(server);
registerLabResultTools(server);
registerWorkflowTools(server);

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
