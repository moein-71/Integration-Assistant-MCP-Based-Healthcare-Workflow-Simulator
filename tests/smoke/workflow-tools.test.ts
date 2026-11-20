import { rm } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import type { ValidationResult, Workflow } from "../../src/domain/types.js";
import {
  createIsolatedDataDir,
  dataOf,
  isErrorOf,
  readDataFile,
  textOf,
  withClient,
  writeDataFile
} from "../support/mcp-client.js";

const VALID_DRAFT = {
  name: "Synthetic MCP-created workflow",
  patient_id: "PAT-SYN-001",
  source_system: "EHR_SYNTH",
  destination_system: "SCHEDULER_SYNTH",
  template: "INTAKE_HANDOFF",
  steps: ["synthetic_intake_check", "synthetic_handoff"],
  appointment_ids: ["APT-SYN-001"],
  lab_result_ids: ["LAB-SYN-001"]
};

const ALL_TOOLS = [
  "get_patient",
  "get_patient_summary",
  "list_appointments",
  "get_lab_results",
  "get_workflow",
  "list_workflows",
  "create_workflow_draft",
  "validate_workflow",
  "submit_workflow_for_approval",
  "revise_workflow_draft"
];

describe("workflow lifecycle MCP tools", () => {
  test("registers exactly ten tools and no admin approve/reject operations", async () => {
    await withClient(async client => {
      const { tools } = await client.listTools();
      expect(tools.map(tool => tool.name).sort()).toEqual([...ALL_TOOLS].sort());
      expect(tools.some(tool => /approve|reject|execute|publish/i.test(tool.name))).toBe(false);
    });
  }, 30_000);

  test("create_workflow_draft creates a DRAFT that read tools can see", async () => {
    await withClient(async client => {
      const created = await client.callTool({ name: "create_workflow_draft", arguments: VALID_DRAFT });
      expect(isErrorOf(created)).toBe(false);
      const workflow = dataOf<Workflow>(created);
      expect(workflow.id).toBe("WF-SYN-005");
      expect(workflow.status).toBe("DRAFT");

      const fetched = await client.callTool({ name: "get_workflow", arguments: { workflow_id: workflow.id } });
      expect(dataOf<Workflow>(fetched).status).toBe("DRAFT");
      const listed = await client.callTool({ name: "list_workflows", arguments: {} });
      expect(dataOf<Workflow[]>(listed)).toHaveLength(5);
    });
  }, 30_000);

  test("new drafts persist across server restarts", async () => {
    const dataDir = await createIsolatedDataDir();
    try {
      await withClient(async client => {
        const created = await client.callTool({ name: "create_workflow_draft", arguments: VALID_DRAFT });
        expect(isErrorOf(created)).toBe(false);
      }, { reuseDataDir: dataDir });

      await withClient(async client => {
        const fetched = await client.callTool({ name: "get_workflow", arguments: { workflow_id: "WF-SYN-005" } });
        expect(isErrorOf(fetched)).toBe(false);
        expect(dataOf<Workflow>(fetched).status).toBe("DRAFT");
      }, { reuseDataDir: dataDir });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  test("create_workflow_draft rejects invalid references and schemas", async () => {
    await withClient(async client => {
      const unknownPatient = await client.callTool({
        name: "create_workflow_draft",
        arguments: { ...VALID_DRAFT, patient_id: "PAT-SYN-999" }
      });
      expect(isErrorOf(unknownPatient)).toBe(true);
      expect(textOf(unknownPatient)).toContain("does not exist");

      const badSystem = await client.callTool({
        name: "create_workflow_draft",
        arguments: { ...VALID_DRAFT, source_system: "NOT_A_SYSTEM" }
      });
      expect(isErrorOf(badSystem)).toBe(true);
    });
  }, 30_000);

  test("validate_workflow returns a read-only validation result", async () => {
    await withClient(async client => {
      const valid = await client.callTool({ name: "validate_workflow", arguments: { workflow_id: "WF-SYN-001" } });
      expect(isErrorOf(valid)).toBe(false);
      const result = dataOf<ValidationResult>(valid);
      expect(result.valid).toBe(true);
      expect(result.workflow_id).toBe("WF-SYN-001");
      expect(result.errors).toEqual([]);
    });
  }, 30_000);

  test("validate_workflow does not change persisted data", async () => {
    await withClient(async (client, _transport, dataDir) => {
      const before = await readDataFile(dataDir, "workflows.json");
      const result = await client.callTool({ name: "validate_workflow", arguments: { workflow_id: "WF-SYN-001" } });
      expect(isErrorOf(result)).toBe(false);
      const validation = dataOf<ValidationResult>(result);
      expect(validation.valid).toBe(false);
      expect(validation.errors.join(" ")).toContain("LAB-SYN-999");
      expect(await readDataFile(dataDir, "workflows.json")).toBe(before);
    }, {
      seed: async dataDir => {
        const workflows = JSON.parse(await readDataFile(dataDir, "workflows.json")) as Workflow[];
        workflows.find(workflow => workflow.id === "WF-SYN-001")!.lab_result_ids = ["LAB-SYN-999"];
        await writeDataFile(dataDir, "workflows.json", JSON.stringify(workflows, null, 2));
      }
    });
  }, 30_000);

  test("submit_workflow_for_approval changes DRAFT to PENDING_APPROVAL", async () => {
    await withClient(async (client, _transport, dataDir) => {
      const submitted = await client.callTool({
        name: "submit_workflow_for_approval",
        arguments: { workflow_id: "WF-SYN-001" }
      });
      expect(isErrorOf(submitted)).toBe(false);
      expect(dataOf<Workflow>(submitted).status).toBe("PENDING_APPROVAL");

      const stored = JSON.parse(await readDataFile(dataDir, "workflows.json")) as Workflow[];
      expect(stored.find(workflow => workflow.id === "WF-SYN-001")?.status).toBe("PENDING_APPROVAL");

      const again = await client.callTool({
        name: "submit_workflow_for_approval",
        arguments: { workflow_id: "WF-SYN-001" }
      });
      expect(isErrorOf(again)).toBe(true);
    });
  }, 30_000);

  test("submit_workflow_for_approval refuses an invalid DRAFT and keeps its state", async () => {
    await withClient(async (client, _transport, dataDir) => {
      const result = await client.callTool({
        name: "submit_workflow_for_approval",
        arguments: { workflow_id: "WF-SYN-001" }
      });
      expect(isErrorOf(result)).toBe(true);
      expect(textOf(result)).toContain("does not exist");
      const stored = JSON.parse(await readDataFile(dataDir, "workflows.json")) as Workflow[];
      expect(stored.find(workflow => workflow.id === "WF-SYN-001")?.status).toBe("DRAFT");
    }, {
      seed: async dataDir => {
        const workflows = JSON.parse(await readDataFile(dataDir, "workflows.json")) as Workflow[];
        workflows.find(workflow => workflow.id === "WF-SYN-001")!.patient_id = "PAT-SYN-999";
        await writeDataFile(dataDir, "workflows.json", JSON.stringify(workflows, null, 2));
      }
    });
  }, 30_000);

  test("revise_workflow_draft returns a REJECTED workflow to DRAFT", async () => {
    await withClient(async client => {
      const revised = await client.callTool({
        name: "revise_workflow_draft",
        arguments: {
          workflow_id: "WF-SYN-004",
          name: "Revised synthetic referral",
          patient_id: "PAT-SYN-002",
          source_system: "REFERRAL_SYNTH",
          destination_system: "EHR_SYNTH",
          template: "REFERRAL_COORDINATION",
          steps: ["synthetic_revision_review", "synthetic_revision_handoff"],
          appointment_ids: ["APT-SYN-004"],
          lab_result_ids: ["LAB-SYN-003"],
          revision_note: "Revised through MCP smoke test"
        }
      });
      expect(isErrorOf(revised)).toBe(false);
      const workflow = dataOf<Workflow>(revised);
      expect(workflow.id).toBe("WF-SYN-004");
      expect(workflow.status).toBe("DRAFT");
      expect(workflow.last_validation).toBeUndefined();

      const rejected = await client.callTool({ name: "list_workflows", arguments: { status: "REJECTED" } });
      expect(dataOf<Workflow[]>(rejected)).toEqual([]);
    });
  }, 30_000);

  test("revise_workflow_draft rejects non-REJECTED workflows", async () => {
    await withClient(async client => {
      const result = await client.callTool({
        name: "revise_workflow_draft",
        arguments: { ...VALID_DRAFT, workflow_id: "WF-SYN-001" }
      });
      expect(isErrorOf(result)).toBe(true);
      expect(textOf(result)).toContain("only REJECTED workflows");
    });
  }, 30_000);
});
