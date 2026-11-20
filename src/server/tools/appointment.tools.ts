import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAppointments } from "../../repositories/appointment.repository.js";
import { jsonResult } from "./tool-result.js";

export function registerAppointmentTools(server: McpServer): void {
  server.registerTool(
    "list_appointments",
    {
      title: "List synthetic appointments",
      description:
        "List synthetic appointments, optionally filtered by patient ID and/or status. Call this to discover scheduled, completed, or cancelled demonstration appointments. Returns a JSON array (empty when nothing matches); it never creates or changes appointments. Valid statuses: scheduled, completed, cancelled.",
      inputSchema: {
        patient_id: z.string().min(1).optional().describe("Optional synthetic patient ID filter, for example PAT-SYN-001."),
        status: z
          .enum(["scheduled", "completed", "cancelled"])
          .optional()
          .describe("Optional appointment status filter.")
      }
    },
    async ({ patient_id, status }) => {
      const appointments = await listAppointments({ patient_id, status });
      return jsonResult(appointments);
    }
  );
}
