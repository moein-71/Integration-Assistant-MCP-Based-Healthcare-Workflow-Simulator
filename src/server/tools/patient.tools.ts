import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPatient, getPatientSummary } from "../../services/patient.service.js";
import { fromLookup } from "./tool-result.js";

export function registerPatientTools(server: McpServer): void {
  server.registerTool(
    "get_patient",
    {
      title: "Get synthetic patient",
      description:
        "Look up one synthetic patient by ID. Call this when you need the basic patient record (id, display name, date of birth, status). Returns the patient record as JSON, or a not-found error for an unknown ID. Does not return appointments or lab results.",
      inputSchema: {
        patient_id: z.string().min(1).describe("Synthetic patient ID, for example PAT-SYN-001.")
      }
    },
    async ({ patient_id }) => fromLookup(await getPatient(patient_id))
  );

  server.registerTool(
    "get_patient_summary",
    {
      title: "Get synthetic patient summary",
      description:
        "Retrieve one synthetic patient together with their recorded appointments and lab-style results in a single structured summary. Use this when you need an overview rather than a single record. The summary lists missing_information explicitly and never infers diagnoses or medical advice. Returns a not-found error for an unknown patient ID.",
      inputSchema: {
        patient_id: z.string().min(1).describe("Synthetic patient ID, for example PAT-SYN-001.")
      }
    },
    async ({ patient_id }) => fromLookup(await getPatientSummary(patient_id))
  );
}
