import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listLabResults } from "../../repositories/lab-result.repository.js";
import { jsonResult } from "./tool-result.js";

export function registerLabResultTools(server: McpServer): void {
  server.registerTool(
    "get_lab_results",
    {
      title: "Get synthetic lab results",
      description:
        "List the available synthetic lab-style results for one patient. Each item includes test name, value, unit, demo reference range, status, and timestamps where present. Values are illustrative only and are not interpreted as a diagnosis. Returns an empty JSON array when the patient has no recorded results.",
      inputSchema: {
        patient_id: z.string().min(1).describe("Synthetic patient ID, for example PAT-SYN-001.")
      }
    },
    async ({ patient_id }) => jsonResult(await listLabResults(patient_id))
  );
}
