/**
 * Reproducible end-to-end demonstration for Stage 6.
 *
 * Uses a real MCP Client connected to the real stdio server and the separate Admin CLI.
 * All data is copied into an isolated temporary directory, so committed fixtures are
 * never modified. Nothing is executed or published: APPROVED is a state only.
 *
 * Run with: npm run demo
 */
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { AuditEvent, Workflow } from "../src/domain/types.js";
import {
  createIsolatedDataDir,
  dataOf,
  withClient
} from "../tests/support/mcp-client.js";

const ADMIN_ENTRY = fileURLToPath(new URL("../src/admin/cli.ts", import.meta.url));
const ACTOR = "admin@example.com";
const REASON = "Synthetic demo: handoff details need revision";

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(dataDir: string, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ADMIN_ENTRY, ...args], {
      env: { ...process.env, MCP_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += String(chunk)));
    child.stderr.on("data", chunk => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

type ReadResourceResult = Awaited<ReturnType<Client["readResource"]>>;

function resourceText(result: ReadResourceResult): string {
  return result.contents.map(content => ("text" in content ? content.text : "")).join("\n");
}

function heading(title: string): void {
  console.log(`\n===== ${title} =====`);
}

function showCli(label: string, result: CliResult): void {
  console.log(`$ npm run admin -- ${label}`);
  console.log(result.stdout.trim() || result.stderr.trim());
  if (result.code !== 0) throw new Error(`Admin CLI failed (${result.code}): ${label}`);
}

async function createSubmit(dataDir: string, name: string): Promise<string> {
  let id = "";
  await withClient(
    async client => {
      const created = dataOf<Workflow>(await client.callTool({
        name: "create_workflow_draft",
        arguments: {
          name,
          patient_id: "PAT-SYN-001",
          source_system: "EHR_SYNTH",
          destination_system: "SCHEDULER_SYNTH",
          template: "INTAKE_HANDOFF",
          steps: ["synthetic_intake_check", "synthetic_handoff"],
          appointment_ids: ["APT-SYN-001"],
          lab_result_ids: ["LAB-SYN-001"]
        }
      }));
      const submitted = dataOf<Workflow>(await client.callTool({
        name: "submit_workflow_for_approval",
        arguments: { workflow_id: created.id }
      }));
      id = submitted.id;
      console.log(`created+submitted workflow: ${id} status=${submitted.status}`);
    },
    { reuseDataDir: dataDir }
  );
  return id;
}

async function main(): Promise<void> {
  const dataDir = await createIsolatedDataDir();
  try {
    heading("1-3. Connect, list tools, read the three static resources");
    let createdId = "";
    await withClient(
      async client => {
        const tools = (await client.listTools()).tools;
        console.log(`MCP tools (${tools.length}): ${tools.map(t => t.name).sort().join(", ")}`);

        for (const uri of ["integration://systems", "workflow://templates", "workflow://states"]) {
          const text = resourceText(await client.readResource({ uri }));
          console.log(`Read ${uri}: ${text.split("\n").length} lines; first line: ${text.split("\n")[0]}`);
        }

        heading("4-5. Discover the patient template and read a synthetic patient");
        const templates = (await client.listResourceTemplates()).resourceTemplates;
        console.log(`Resource templates: ${templates.map(t => t.uriTemplate).join(", ")}`);
        const patientText = resourceText(await client.readResource({ uri: "patient://PAT-SYN-001" }));
        console.log(patientText.split("\n").slice(0, 12).join("\n"));

        heading("6-8. Retrieve appointments/labs, create, validate and submit a draft");
        const appointments = dataOf<unknown[]>(await client.callTool({
          name: "list_appointments",
          arguments: { patient_id: "PAT-SYN-001" }
        }));
        const labs = dataOf<unknown[]>(await client.callTool({
          name: "get_lab_results",
          arguments: { patient_id: "PAT-SYN-001" }
        }));
        console.log(`patient PAT-SYN-001: ${appointments.length} appointments, ${labs.length} lab results`);

        const created = dataOf<Workflow>(await client.callTool({
          name: "create_workflow_draft",
          arguments: {
            name: "Stage 6 demonstration workflow",
            patient_id: "PAT-SYN-001",
            source_system: "EHR_SYNTH",
            destination_system: "SCHEDULER_SYNTH",
            template: "INTAKE_HANDOFF",
            steps: ["synthetic_intake_check", "synthetic_handoff"],
            appointment_ids: ["APT-SYN-001"],
            lab_result_ids: ["LAB-SYN-001"]
          }
        }));
        createdId = created.id;
        console.log(`created: ${created.id} status=${created.status}`);

        const validation = dataOf<{ valid: boolean; errors: string[]; warnings: string[] }>(
          await client.callTool({ name: "validate_workflow", arguments: { workflow_id: created.id } })
        );
        console.log(`validate: valid=${validation.valid} errors=${validation.errors.length} warnings=${validation.warnings.length}`);

        const submitted = dataOf<Workflow>(await client.callTool({
          name: "submit_workflow_for_approval",
          arguments: { workflow_id: created.id }
        }));
        console.log(`submit: ${submitted.id} status=${submitted.status}`);
      },
      { reuseDataDir: dataDir }
    );

    heading("9-12. Admin CLI list/inspect, approve; verify APPROVED");
    showCli("list", await runCli(dataDir, ["list"]));
    showCli(`inspect WF-SYN-002`, await runCli(dataDir, ["inspect", "WF-SYN-002"]));

    await withClient(
      async client => {
        const workflow = dataOf<Workflow>(await client.callTool({
          name: "get_workflow",
          arguments: { workflow_id: createdId }
        }));
        console.log(`before approval: ${workflow.id} status=${workflow.status}`);
      },
      { reuseDataDir: dataDir }
    );

    showCli(
      `approve ${createdId} --actor "${ACTOR}"`,
      await runCli(dataDir, ["approve", createdId, "--actor", ACTOR])
    );

    await withClient(
      async client => {
        const approved = dataOf<Workflow>(await client.callTool({
          name: "get_workflow",
          arguments: { workflow_id: createdId }
        }));
        console.log(`after approval: ${approved.id} status=${approved.status}`);
      },
      { reuseDataDir: dataDir }
    );

    heading("13. Rejection and revision path in the isolated dataset");
    const rejectedId = await createSubmit(dataDir, "Stage 6 rejection demonstration workflow");
    showCli(
      `reject ${rejectedId} --actor "${ACTOR}" --reason "${REASON}"`,
      await runCli(dataDir, ["reject", rejectedId, "--actor", ACTOR, "--reason", REASON])
    );

    await withClient(
      async client => {
        const rejected = dataOf<Workflow>(await client.callTool({
          name: "get_workflow",
          arguments: { workflow_id: rejectedId }
        }));
        console.log(`after rejection: ${rejected.id} status=${rejected.status} rejection_note="${rejected.rejection_note}"`);

        const revised = dataOf<Workflow>(await client.callTool({
          name: "revise_workflow_draft",
          arguments: {
            workflow_id: rejectedId,
            name: "Revised Stage 6 demonstration workflow",
            patient_id: "PAT-SYN-001",
            source_system: "EHR_SYNTH",
            destination_system: "REFERRAL_SYNTH",
            template: "REFERRAL_COORDINATION",
            steps: ["synthetic_revision_review", "synthetic_revision_handoff"],
            appointment_ids: ["APT-SYN-002"],
            lab_result_ids: ["LAB-SYN-002"],
            revision_note: "Revised after synthetic rejection"
          }
        }));
        console.log(
          `revised: ${revised.id} status=${revised.status} idPreserved=${revised.id === rejectedId} ` +
          `createdAtPreserved=${revised.created_at === rejected.created_at} ` +
          `updatedAtChanged=${revised.updated_at !== rejected.updated_at} ` +
          `lastValidationCleared=${revised.last_validation === undefined} ` +
          `rejectionNoteKept=${revised.rejection_note === rejected.rejection_note} ` +
          `lastHistory=${revised.history.at(-1)?.from}->${revised.history.at(-1)?.to}`
        );

        // Validation and submission are separate, explicit operations.
        const revalidated = dataOf<{ valid: boolean }>(await client.callTool({
          name: "validate_workflow",
          arguments: { workflow_id: rejectedId }
        }));
        const resubmitted = dataOf<Workflow>(await client.callTool({
          name: "submit_workflow_for_approval",
          arguments: { workflow_id: rejectedId }
        }));
        console.log(`revalidate: valid=${revalidated.valid}; resubmit (separate call): status=${resubmitted.status}`);
      },
      { reuseDataDir: dataDir }
    );

    heading("14. Audit events persisted in the isolated data directory");
    const audit = JSON.parse(await readFile(`${dataDir}/audit-events.json`, "utf8")) as AuditEvent[];
    for (const event of audit) {
      console.log(
        `${event.action} ${event.workflow_id} actor=${event.actor} at=${event.timestamp}` +
        (event.reason ? ` reason="${event.reason}"` : "")
      );
    }
    console.log("\nDemo complete. No workflow was executed or published. Production fixtures were not modified.");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error("Demo failed:", error);
  process.exitCode = 1;
});
