import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createIsolatedDataDir,
  dataOf,
  readDataFile,
  withClient
} from "./support/mcp-client.js";

type ReadResourceResult = Awaited<ReturnType<Client["readResource"]>>;
type GetPromptResult = Awaited<ReturnType<Client["getPrompt"]>>;

/** Pull the concatenated text out of one or more resource contents. */
function resourceText(result: ReadResourceResult): string {
  return result.contents
    .map(content => ("text" in content ? content.text : ""))
    .join("\n");
}

/** Pull all text from the messages returned by a prompt. */
function promptText(result: GetPromptResult): string {
  return result.messages
    .map(message => (message.content.type === "text" ? message.content.text : ""))
    .join("\n");
}

let dataDir: string;
beforeEach(async () => {
  dataDir = await createIsolatedDataDir();
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("MCP resources", () => {
  test("lists the three static resources", async () => {
    await withClient(
      async client => {
        const { resources } = await client.listResources();
        const uris = resources
          .map(resource => resource.uri)
          .filter(uri => !uri.startsWith("patient://"))
          .sort();
        expect(uris).toEqual(["integration://systems", "workflow://states", "workflow://templates"]);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("lists the patient resource template with patient://{id}", async () => {
    await withClient(
      async client => {
        const { resourceTemplates } = await client.listResourceTemplates();
        expect(resourceTemplates).toHaveLength(1);
        expect(resourceTemplates[0].uriTemplate).toBe("patient://{id}");
        expect(resourceTemplates[0].name).toBe("patient-details");
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("the patient resource template lists real synthetic patients", async () => {
    await withClient(
      async client => {
        const { resources } = await client.listResources();
        const patientUris = resources
          .map(resource => resource.uri)
          .filter(uri => uri.startsWith("patient://"))
          .sort();
        expect(patientUris).toEqual([
          "patient://PAT-SYN-001",
          "patient://PAT-SYN-002",
          "patient://PAT-SYN-003"
        ]);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("reads integration://systems and describes only the simulation", async () => {
    await withClient(
      async client => {
        const text = resourceText(await client.readResource({ uri: "integration://systems" }));
        expect(text).toContain("# Integration Systems");
        expect(text).toContain("All patients, appointments, lab results, and workflows are fictional");
        expect(text).toContain("No connection to real healthcare providers");
        expect(text).toContain("EHR_SYNTH");
        expect(text).toContain("LAB_SYNTH");
        expect(text).toContain("SCHEDULER_SYNTH");
        expect(text).toContain("REFERRAL_SYNTH");
        expect(text).toContain('"data_fictional": true');
        expect(text).toContain('"data_domains"');
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("reads workflow://templates with accurate template information", async () => {
    await withClient(
      async client => {
        const text = resourceText(await client.readResource({ uri: "workflow://templates" }));
        expect(text).toContain("# Workflow Templates");
        for (const template of ["INTAKE_HANDOFF", "LAB_REVIEW", "REFERRAL_COORDINATION"]) {
          expect(text).toContain(template);
        }
        expect(text).toContain('"id": "INTAKE_HANDOFF"');
        expect(text).toContain('"destination_system": "EHR_SYNTH"');
        expect(text).toContain('"source_system": "LAB_SYNTH"');
        // No invented fields such as execution or publishing.
        expect(text.toLowerCase()).not.toContain('"execute"');
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("reads workflow://states with state machine and ownership rules", async () => {
    await withClient(
      async client => {
        const text = resourceText(await client.readResource({ uri: "workflow://states" }));
        expect(text).toContain("# Workflow Lifecycle State Machine");
        for (const state of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]) {
          expect(text).toContain(state);
        }
        expect(text).toContain("submit_workflow_for_approval");
        expect(text).toContain("revise_workflow_draft");
        expect(text).toContain("Admin CLI");
        expect(text).toContain("read-only");
        expect(text).toContain("revalidates");
        expect(text).toContain("Invalid transitions are rejected");
        expect(text).toContain("APPROVED does not mean executed or published");
        expect(text).toContain('"execution_note"');
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("reads an existing synthetic patient resource", async () => {
    await withClient(
      async client => {
        const text = resourceText(await client.readResource({ uri: "patient://PAT-SYN-001" }));
        expect(text).toContain("# Patient Information");
        expect(text).toContain("synthetic");
        expect(text).toContain('"id": "PAT-SYN-001"');
        // Only the requested patient is returned.
        expect(text).not.toContain('"id": "PAT-SYN-002"');
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("unknown patient resource ID returns a resource error", async () => {
    await withClient(
      async client => {
        await expect(
          client.readResource({ uri: "patient://PAT-SYN-999" })
        ).rejects.toThrow(/not found/i);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("reading resources never modifies data files", async () => {
    const before = {
      workflows: await readDataFile(dataDir, "workflows.json"),
      patients: await readDataFile(dataDir, "patients.json"),
      appointments: await readDataFile(dataDir, "appointments.json"),
      labResults: await readDataFile(dataDir, "lab-results.json")
    };

    await withClient(
      async client => {
        await client.readResource({ uri: "integration://systems" });
        await client.readResource({ uri: "workflow://templates" });
        await client.readResource({ uri: "workflow://states" });
        await client.readResource({ uri: "patient://PAT-SYN-001" });
      },
      { reuseDataDir: dataDir }
    );

    expect(await readDataFile(dataDir, "workflows.json")).toBe(before.workflows);
    expect(await readDataFile(dataDir, "patients.json")).toBe(before.patients);
    expect(await readDataFile(dataDir, "appointments.json")).toBe(before.appointments);
    expect(await readDataFile(dataDir, "lab-results.json")).toBe(before.labResults);
  }, 60_000);
});

describe("MCP prompts", () => {
  const expectedPrompts = [
    "create_patient_integration_workflow",
    "review_workflow_draft",
    "summarize_patient_information"
  ].sort();

  test("lists exactly the three expected prompts with required arguments", async () => {
    await withClient(
      async client => {
        const { prompts } = await client.listPrompts();
        expect(prompts.map(prompt => prompt.name).sort()).toEqual(expectedPrompts);

        const byName = Object.fromEntries(prompts.map(prompt => [prompt.name, prompt]));
        expect(byName.create_patient_integration_workflow.arguments?.map(a => a.name)).toEqual(["patient_id"]);
        expect(byName.summarize_patient_information.arguments?.map(a => a.name)).toEqual(["patient_id"]);
        expect(byName.review_workflow_draft.arguments?.map(a => a.name)).toEqual(["workflow_id"]);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("create_patient_integration_workflow returns required instructions", async () => {
    await withClient(
      async client => {
        const result = await client.getPrompt({
          name: "create_patient_integration_workflow",
          arguments: { patient_id: "PAT-SYN-001" }
        });
        expect(result.messages.length).toBeGreaterThan(0);
        const text = promptText(result);
        expect(text).toContain("Retrieve patient information first");
        expect(text).toContain("get_patient");
        expect(text).toContain("list_appointments");
        expect(text).toContain("get_lab_results");
        expect(text).toContain("workflow://templates");
        expect(text).toContain("Never guess patient IDs");
        expect(text).toContain("Create a workflow draft only after gathering context");
        expect(text).toContain("validate_workflow");
        expect(text).toContain("Submit for human approval only if validation succeeds");
        expect(text).toContain("Stop after submission");
        expect(text).toContain("Never approve, execute or publish a workflow");
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("summarize_patient_information returns required instructions", async () => {
    await withClient(
      async client => {
        const result = await client.getPrompt({
          name: "summarize_patient_information",
          arguments: { patient_id: "PAT-SYN-001" }
        });
        const text = promptText(result);
        expect(text).toContain("Retrieve only actual synthetic data");
        expect(text).toContain("get_patient");
        expect(text).toContain("list_appointments");
        expect(text).toContain("get_lab_results");
        expect(text).toContain("Distinguish missing information from negative findings");
        expect(text).toContain("Never invent clinical findings, diagnoses, medications or measurements");
        expect(text).toContain("synthetic and fictional");
        expect(text).toContain("concise and structured");
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("review_workflow_draft returns required instructions", async () => {
    await withClient(
      async client => {
        const result = await client.getPrompt({
          name: "review_workflow_draft",
          arguments: { workflow_id: "WF-SYN-001" }
        });
        const text = promptText(result);
        expect(text).toContain("get_workflow");
        expect(text).toContain("last_validation");
        expect(text).toContain("workflow://states");
        expect(text).toContain("workflow://templates");
        expect(text).toContain("get_patient");
        expect(text).toContain("errors and warnings separately");
        expect(text).toContain("Do not change the workflow automatically");
        expect(text).toContain("Never approve, execute or publish the workflow");
        expect(text).toContain("Admin CLI");
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("prompts reject missing and invalid arguments", async () => {
    await withClient(
      async client => {
        await expect(
          client.getPrompt({ name: "create_patient_integration_workflow", arguments: {} })
        ).rejects.toThrow(/Invalid arguments/i);

        await expect(
          client.getPrompt({
            name: "summarize_patient_information",
            arguments: { patient_id: "" }
          })
        ).rejects.toThrow(/Invalid arguments/i);

        await expect(
          client.getPrompt({ name: "review_workflow_draft", arguments: {} })
        ).rejects.toThrow(/Invalid arguments/i);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("prompts reject unknown names", async () => {
    await withClient(
      async client => {
        await expect(
          client.getPrompt({ name: "publish_workflow", arguments: {} })
        ).rejects.toThrow(/not found/i);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);
});

describe("Integration", () => {
  test("resources, prompts and tools work together over stdio without side effects", async () => {
    await withClient(
      async client => {
        // Read guidance resources.
        expect(resourceText(await client.readResource({ uri: "workflow://templates" }))).toContain("INTAKE_HANDOFF");
        expect(resourceText(await client.readResource({ uri: "integration://systems" }))).toContain("EHR_SYNTH");

        // Create a workflow draft via an existing tool.
        const created = await client.callTool({
          name: "create_workflow_draft",
          arguments: {
            name: "Stage 5 integration test workflow",
            patient_id: "PAT-SYN-001",
            source_system: "EHR_SYNTH",
            destination_system: "REFERRAL_SYNTH",
            template: "INTAKE_HANDOFF",
            steps: ["gather_data", "validate_data", "handoff"]
          }
        });
        const workflow = dataOf<{ id: string; status: string }>(created);
        expect(workflow.id).toMatch(/^WF-SYN-\d+$/);
        expect(workflow.status).toBe("DRAFT");

        const validation = dataOf<{ valid: boolean }>(
          await client.callTool({ name: "validate_workflow", arguments: { workflow_id: workflow.id } })
        );
        expect(validation.valid).toBe(true);

        // Review prompt only provides instructions; the workflow stays DRAFT.
        const review = await client.getPrompt({
          name: "review_workflow_draft",
          arguments: { workflow_id: workflow.id }
        });
        expect(promptText(review)).toContain("Workflow Draft Review Instructions");

        const current = dataOf<{ status: string }>(
          await client.callTool({ name: "get_workflow", arguments: { workflow_id: workflow.id } })
        );
        expect(current.status).toBe("DRAFT");
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);

  test("still exposes exactly the original 10 tools and no admin tools", async () => {
    await withClient(
      async client => {
        const { tools } = await client.listTools();
        expect(tools.map(tool => tool.name).sort()).toEqual([
          "create_workflow_draft",
          "get_lab_results",
          "get_patient",
          "get_patient_summary",
          "get_workflow",
          "list_appointments",
          "list_workflows",
          "revise_workflow_draft",
          "submit_workflow_for_approval",
          "validate_workflow"
        ]);
        expect(tools.some(tool => /approve|reject|publish|execute/i.test(tool.name))).toBe(false);
      },
      { reuseDataDir: dataDir }
    );
  }, 60_000);
});
