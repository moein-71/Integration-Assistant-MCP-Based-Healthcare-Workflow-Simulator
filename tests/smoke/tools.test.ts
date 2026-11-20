import { describe, expect, test } from "vitest";
import type { Appointment, LabResult, Patient, PatientSummary, Workflow } from "../../src/domain/types.js";
import { dataOf, isErrorOf, textOf, withClient } from "../support/mcp-client.js";

const EXPECTED_TOOLS = [
  "get_patient",
  "get_patient_summary",
  "list_appointments",
  "get_lab_results",
  "get_workflow",
  "list_workflows"
];

describe("MCP read-only tools over stdio", () => {
  test("server is a separate process and exposes exactly the six expected tools", async () => {
    await withClient(async (client, transport) => {
      expect(transport.pid, "server must run as a separate child process").not.toBeNull();
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    });
  }, 30_000);

  test("get_patient returns a patient and handles unknown IDs", async () => {
    await withClient(async client => {
      const ok = await client.callTool({ name: "get_patient", arguments: { patient_id: "PAT-SYN-001" } });
      expect(isErrorOf(ok)).not.toBe(true);
      expect(dataOf<Patient>(ok).id).toBe("PAT-SYN-001");

      const missing = await client.callTool({ name: "get_patient", arguments: { patient_id: "PAT-SYN-999" } });
      expect(isErrorOf(missing)).toBe(true);
      expect(textOf(missing)).toContain("not found");
    });
  }, 30_000);

  test("get_patient_summary returns related data and states what is absent", async () => {
    await withClient(async client => {
      const result = await client.callTool({
        name: "get_patient_summary",
        arguments: { patient_id: "PAT-SYN-001" }
      });
      expect(isErrorOf(result)).not.toBe(true);
      const summary = dataOf<PatientSummary>(result);
      expect(summary.patient.id).toBe("PAT-SYN-001");
      expect(summary.appointments.length).toBe(2);
      expect(summary.lab_results.length).toBe(2);
      expect(summary.missing_information).toEqual([]);

      const sparse = await client.callTool({
        name: "get_patient_summary",
        arguments: { patient_id: "PAT-SYN-003" }
      });
      const sparseSummary = dataOf<PatientSummary>(sparse);
      expect(sparseSummary.appointments.length).toBe(1);
      expect(sparseSummary.lab_results).toEqual([]);
      expect(sparseSummary.missing_information.join(" ")).toContain("No lab results");

      const missing = await client.callTool({
        name: "get_patient_summary",
        arguments: { patient_id: "PAT-SYN-999" }
      });
      expect(isErrorOf(missing)).toBe(true);
    });
  }, 30_000);

  test("list_appointments supports patient and status filters", async () => {
    await withClient(async client => {
      const all = await client.callTool({ name: "list_appointments", arguments: {} });
      expect(dataOf<Appointment[]>(all).length).toBe(5);

      const byPatient = await client.callTool({
        name: "list_appointments",
        arguments: { patient_id: "PAT-SYN-001" }
      });
      expect(dataOf<Appointment[]>(byPatient).map(a => a.id).sort()).toEqual(["APT-SYN-001", "APT-SYN-002"]);

      const byStatus = await client.callTool({
        name: "list_appointments",
        arguments: { status: "scheduled" }
      });
      const scheduled = dataOf<Appointment[]>(byStatus);
      expect(scheduled.length).toBe(3);
      expect(scheduled.every(a => a.status === "scheduled")).toBe(true);

      const combined = await client.callTool({
        name: "list_appointments",
        arguments: { patient_id: "PAT-SYN-001", status: "scheduled" }
      });
      expect(dataOf<Appointment[]>(combined).map(a => a.id)).toEqual(["APT-SYN-001"]);

      const none = await client.callTool({
        name: "list_appointments",
        arguments: { patient_id: "PAT-SYN-999" }
      });
      expect(dataOf<Appointment[]>(none)).toEqual([]);
    });
  }, 30_000);

  test("get_lab_results returns result details and empty lists where appropriate", async () => {
    await withClient(async client => {
      const result = await client.callTool({
        name: "get_lab_results",
        arguments: { patient_id: "PAT-SYN-001" }
      });
      const labs = dataOf<LabResult[]>(result);
      expect(labs.length).toBe(2);
      expect(labs[0]).toHaveProperty("test_name");
      expect(labs[0]).toHaveProperty("result_value");
      expect(labs[0]).toHaveProperty("unit");
      expect(labs[0]).toHaveProperty("reference_range");
      expect(labs[0]).toHaveProperty("status");
      expect(labs[0]).toHaveProperty("reported_at");

      const empty = await client.callTool({
        name: "get_lab_results",
        arguments: { patient_id: "PAT-SYN-003" }
      });
      expect(dataOf<LabResult[]>(empty)).toEqual([]);
    });
  }, 30_000);

  test("get_workflow returns an example and handles unknown IDs", async () => {
    await withClient(async client => {
      const ok = await client.callTool({ name: "get_workflow", arguments: { workflow_id: "WF-SYN-002" } });
      const workflow = dataOf<Workflow>(ok);
      expect(workflow.id).toBe("WF-SYN-002");
      expect(workflow.status).toBe("awaiting_review");

      const missing = await client.callTool({ name: "get_workflow", arguments: { workflow_id: "WF-SYN-999" } });
      expect(isErrorOf(missing)).toBe(true);
      expect(textOf(missing)).toContain("not found");
    });
  }, 30_000);

  test("list_workflows supports the status filter", async () => {
    await withClient(async client => {
      const all = await client.callTool({ name: "list_workflows", arguments: {} });
      expect(dataOf<Workflow[]>(all).length).toBe(3);

      const drafts = await client.callTool({ name: "list_workflows", arguments: { status: "draft" } });
      const draftList = dataOf<Workflow[]>(drafts);
      expect(draftList.length).toBe(2);
      expect(draftList.every(w => w.status === "draft")).toBe(true);

      const none = await client.callTool({ name: "list_workflows", arguments: { status: "completed" } });
      expect(dataOf<Workflow[]>(none)).toEqual([]);
    });
  }, 30_000);

  test("invalid inputs are rejected by tool schemas", async () => {
    await withClient(async client => {
      const missingArg = await client.callTool({ name: "get_patient", arguments: {} });
      expect(isErrorOf(missingArg)).toBe(true);

      const badStatus = await client.callTool({
        name: "list_appointments",
        arguments: { status: "not-a-status" }
      });
      expect(isErrorOf(badStatus)).toBe(true);

      const emptyId = await client.callTool({
        name: "get_lab_results",
        arguments: { patient_id: "" }
      });
      expect(isErrorOf(emptyId)).toBe(true);
    });
  }, 30_000);
});
