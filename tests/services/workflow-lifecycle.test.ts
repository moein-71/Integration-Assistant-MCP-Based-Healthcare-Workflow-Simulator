import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Workflow } from "../../src/domain/types.js";
import { readJsonArray, writeJsonArray } from "../../src/repositories/json-store.js";
import {
  createWorkflowDraft,
  reviseWorkflowDraft,
  submitWorkflowForApproval,
  validateWorkflowById,
  type EditableWorkflowFields
} from "../../src/services/workflow-lifecycle.service.js";

const SOURCE_DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const FILES = ["patients.json", "appointments.json", "lab-results.json", "workflows.json"];

let dataDir: string;
let previousOverride: string | undefined;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "mcp-lifecycle-"));
  for (const file of FILES) {
    await copyFile(join(SOURCE_DATA_DIR, file), join(dataDir, file));
  }
  previousOverride = process.env.MCP_DATA_DIR;
  process.env.MCP_DATA_DIR = dataDir;
});

afterEach(async () => {
  if (previousOverride === undefined) {
    delete process.env.MCP_DATA_DIR;
  } else {
    process.env.MCP_DATA_DIR = previousOverride;
  }
  await rm(dataDir, { recursive: true, force: true });
});

function validInput(overrides: Partial<EditableWorkflowFields> = {}): EditableWorkflowFields {
  return {
    name: "Synthetic demo workflow",
    patient_id: "PAT-SYN-001",
    source_system: "EHR_SYNTH",
    destination_system: "SCHEDULER_SYNTH",
    template: "INTAKE_HANDOFF",
    steps: ["synthetic_step_a", "synthetic_step_b"],
    appointment_ids: ["APT-SYN-001"],
    lab_result_ids: ["LAB-SYN-001"],
    ...overrides
  };
}

async function mutatePersistedWorkflow(id: string, mutation: (workflow: Workflow) => void): Promise<void> {
  const workflows = await readJsonArray<Workflow>("workflows.json");
  const target = workflows.find(workflow => workflow.id === id);
  if (!target) throw new Error(`Fixture ${id} missing`);
  mutation(target);
  await writeJsonArray("workflows.json", workflows);
}

describe("workflow draft creation", () => {
  test("creates a valid draft with a generated ID and persists it", async () => {
    const result = await createWorkflowDraft(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe("WF-SYN-005");
    expect(result.data.status).toBe("DRAFT");
    expect(result.data.created_at).toBe(result.data.updated_at);
    expect((await readJsonArray<Workflow>("workflows.json")).length).toBe(5);
  });

  test("generated IDs remain unique across creations", async () => {
    const first = await createWorkflowDraft(validInput());
    const second = await createWorkflowDraft(validInput({ name: "Second synthetic workflow" }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.data.id).not.toBe(second.data.id);
      expect(second.data.id).toBe("WF-SYN-006");
    }
  });

  test.each([
    ["unknown patient", { patient_id: "PAT-SYN-999" }],
    ["unknown appointment", { appointment_ids: ["APT-SYN-999"] }],
    ["appointment of another patient", { appointment_ids: ["APT-SYN-003"] }],
    ["unknown lab result", { lab_result_ids: ["LAB-SYN-999"] }],
    ["lab result of another patient", { lab_result_ids: ["LAB-SYN-004"] }],
    ["empty steps", { steps: [] }],
    ["duplicate steps", { steps: ["step_a", "step_a"] }]
  ])("rejects %s", async (_label, overrides) => {
    const result = await createWorkflowDraft(validInput(overrides));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    expect((await readJsonArray<Workflow>("workflows.json")).length).toBe(4);
  });

  test("rejects unsupported integration systems and templates", async () => {
    const badSystem = await createWorkflowDraft(validInput({ source_system: "UNKNOWN" as never }));
    const badTemplate = await createWorkflowDraft(validInput({ template: "UNKNOWN" as never }));
    expect(badSystem.ok).toBe(false);
    expect(badTemplate.ok).toBe(false);
  });
});

describe("workflow validation", () => {
  test("valid workflow has no errors and does not mutate data", async () => {
    const before = JSON.stringify(await readJsonArray<Workflow>("workflows.json"));
    const result = await validateWorkflowById("WF-SYN-001");
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toEqual([]);
      expect(result.data.workflow_id).toBe("WF-SYN-001");
    }
    expect(JSON.stringify(await readJsonArray<Workflow>("workflows.json"))).toBe(before);
  });

  test("reports warnings for non-DRAFT state without error", async () => {
    const result = await validateWorkflowById("WF-SYN-002");
    expect(result.found && result.data.valid).toBe(true);
    if (result.found) expect(result.data.warnings.join(" ")).toContain("only DRAFT workflows can be submitted");
  });

  test.each([
    ["missing name", (w: Workflow) => (w.name = ""), "Workflow name is missing"],
    ["unknown patient", (w: Workflow) => (w.patient_id = "PAT-SYN-999"), "does not exist"],
    ["invalid appointment", (w: Workflow) => (w.appointment_ids = ["APT-SYN-999"]), "does not exist"],
    ["foreign appointment", (w: Workflow) => (w.appointment_ids = ["APT-SYN-003"]), "different patient"],
    ["invalid lab result", (w: Workflow) => (w.lab_result_ids = ["LAB-SYN-999"]), "does not exist"],
    ["unsupported system", (w: Workflow) => (w.source_system = "UNKNOWN" as never), "Unsupported source system"]
  ])("detects %s", async (_label, mutation, expectedMessage) => {
    await mutatePersistedWorkflow("WF-SYN-001", mutation);
    const result = await validateWorkflowById("WF-SYN-001");
    expect(result.found && result.data.valid).toBe(false);
    if (result.found) expect(result.data.errors.join(" ")).toContain(expectedMessage);
  });

  test("unknown workflow returns not-found", async () => {
    const result = await validateWorkflowById("WF-SYN-999");
    expect(result.found).toBe(false);
  });
});

describe("workflow submission", () => {
  test("valid DRAFT becomes PENDING_APPROVAL and is persisted", async () => {
    const before = await readJsonArray<Workflow>("workflows.json");
    const original = before.find(workflow => workflow.id === "WF-SYN-001")!;
    const result = await submitWorkflowForApproval("WF-SYN-001");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("PENDING_APPROVAL");
    expect(result.data.updated_at).not.toBe(original.updated_at);
    expect(result.data.last_validation?.valid).toBe(true);
    const stored = (await readJsonArray<Workflow>("workflows.json")).find(w => w.id === "WF-SYN-001")!;
    expect(stored.status).toBe("PENDING_APPROVAL");
  });

  test("invalid DRAFT stays DRAFT and is not persisted as submitted", async () => {
    const before = JSON.stringify(await readJsonArray<Workflow>("workflows.json"));
    await mutatePersistedWorkflow("WF-SYN-001", workflow => (workflow.patient_id = "PAT-SYN-999"));
    const afterCorruption = JSON.stringify(await readJsonArray<Workflow>("workflows.json"));
    const result = await submitWorkflowForApproval("WF-SYN-001");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("does not exist");
    expect(JSON.stringify(await readJsonArray<Workflow>("workflows.json"))).toBe(afterCorruption);
    expect(before).not.toBe(afterCorruption);
  });

  test("submission revalidates the latest persisted record", async () => {
    const earlier = await validateWorkflowById("WF-SYN-001");
    expect(earlier.found && earlier.data.valid).toBe(true);
    await mutatePersistedWorkflow("WF-SYN-001", workflow => (workflow.lab_result_ids = ["LAB-SYN-999"]));
    const result = await submitWorkflowForApproval("WF-SYN-001");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("LAB-SYN-999");
  });

  test.each(["WF-SYN-002", "WF-SYN-004"])("rejects submission from %s", async id => {
    const result = await submitWorkflowForApproval(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("only DRAFT workflows");
  });

  test("rejects submission from APPROVED", async () => {
    await mutatePersistedWorkflow("WF-SYN-001", workflow => (workflow.status = "APPROVED"));
    const result = await submitWorkflowForApproval("WF-SYN-001");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("APPROVED");
  });
});

describe("workflow revision", () => {
  test("REJECTED workflow returns to DRAFT with preserved identity and cleared validation", async () => {
    const original = (await readJsonArray<Workflow>("workflows.json")).find(w => w.id === "WF-SYN-004")!;
    const result = await reviseWorkflowDraft("WF-SYN-004", {
      ...validInput({ patient_id: "PAT-SYN-002", appointment_ids: ["APT-SYN-004"], lab_result_ids: ["LAB-SYN-003"] }),
      revision_note: "Revised synthetic handoff details"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(original.id);
    expect(result.data.status).toBe("DRAFT");
    expect(result.data.created_at).toBe(original.created_at);
    expect(result.data.updated_at).not.toBe(original.updated_at);
    expect(result.data.last_validation).toBeUndefined();
    expect(result.data.rejection_note).toBe(original.rejection_note);
    expect(result.data.history.at(-1)?.from).toBe("REJECTED");
    expect(result.data.history.at(-1)?.note).toBe("Revised synthetic handoff details");
    const stored = (await readJsonArray<Workflow>("workflows.json")).find(w => w.id === "WF-SYN-004")!;
    expect(stored.status).toBe("DRAFT");
  });

  test("invalid revised content does not mutate the rejected workflow", async () => {
    const before = JSON.stringify(await readJsonArray<Workflow>("workflows.json"));
    const result = await reviseWorkflowDraft("WF-SYN-004", validInput({ patient_id: "PAT-SYN-999" }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(await readJsonArray<Workflow>("workflows.json"))).toBe(before);
  });

  test.each(["WF-SYN-001", "WF-SYN-002"])("rejects revision from %s", async id => {
    const result = await reviseWorkflowDraft(id, validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("only REJECTED workflows");
  });

  test("rejects revision from APPROVED", async () => {
    await mutatePersistedWorkflow("WF-SYN-001", workflow => (workflow.status = "APPROVED"));
    const result = await reviseWorkflowDraft("WF-SYN-001", validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("APPROVED");
  });
});
