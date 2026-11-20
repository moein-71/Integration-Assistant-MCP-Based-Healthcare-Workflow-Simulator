import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWorkflow, listWorkflows } from "../../services/workflow.service.js";
import { fromLookup, jsonResult } from "./tool-result.js";

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    "get_workflow",
    {
      title: "Get synthetic workflow example",
      description:
        "Look up one static example workflow by ID. Returns its status, title, steps, and references to synthetic patients/appointments/lab results. This is read-only demonstration data: no workflow is created, validated, submitted, approved, or executed. Returns a not-found error for an unknown ID.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Synthetic workflow ID, for example WF-SYN-001.")
      }
    },
    async ({ workflow_id }) => fromLookup(await getWorkflow(workflow_id))
  );

  server.registerTool(
    "list_workflows",
    {
      title: "List synthetic workflow examples",
      description:
        "List the static example workflow records, optionally filtered by status. Use this to discover available demonstration workflows. Returns a JSON array (empty when nothing matches). Valid statuses: draft, awaiting_review, completed. This tool is read-only and does not run workflows.",
      inputSchema: {
        status: z
          .enum(["draft", "awaiting_review", "completed"])
          .optional()
          .describe("Optional workflow status filter.")
      }
    },
    async ({ status }) => jsonResult(await listWorkflows(status))
  );
}
