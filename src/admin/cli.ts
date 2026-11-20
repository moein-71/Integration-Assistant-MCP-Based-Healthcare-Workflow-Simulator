import { parseArgs } from "node:util";
import type { Workflow } from "../domain/types.js";
import {
  approveWorkflow,
  inspectWorkflow,
  listAuditEventsForWorkflow,
  listPendingWorkflows,
  rejectWorkflow
} from "../services/admin.service.js";

function usage(): string {
  return [
    "Usage: npm run admin -- <command> [arguments]",
    "",
    "Commands:",
    "  list                                      List workflows awaiting approval",
    "  inspect <workflow_id>                     Show workflow details, validation and history",
    "  approve <workflow_id> --actor <label>     Approve a PENDING_APPROVAL workflow",
    "  reject <workflow_id> --actor <label> --reason <text>",
    "                                            Reject a PENDING_APPROVAL workflow",
    "",
    "Note: --actor is a self-declared audit label, not authentication."
  ].join("\n");
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`A non-empty ${flag} value is required.`);
  }
  return value.trim();
}

function printWorkflowSummary(workflow: Workflow): void {
  console.log(`${workflow.id}  ${workflow.status}  ${workflow.name}`);
  console.log(
    `  patient: ${workflow.patient_id}  template: ${workflow.template}  ${workflow.source_system} -> ${workflow.destination_system}`
  );
  console.log(`  updated_at: ${workflow.updated_at}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      actor: { type: "string" },
      reason: { type: "string" }
    },
    allowPositionals: true,
    strict: true
  });

  const [command, id, ...extra] = positionals;
  if (!command) {
    console.log(usage());
    return;
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected argument '${extra[0]}'. Use --actor or --reason for options.\n${usage()}`);
  }

  switch (command) {
    case "list": {
      const pending = await listPendingWorkflows();
      if (pending.length === 0) {
        console.log("No workflows are awaiting approval.");
        return;
      }
      console.log(`Workflows awaiting approval (${pending.length}):`);
      for (const workflow of pending) {
        printWorkflowSummary(workflow);
      }
      return;
    }

    case "inspect": {
      if (!id) throw new Error("inspect requires a workflow ID.\n" + usage());
      const lookup = await inspectWorkflow(id);
      if (!lookup.found) {
        throw new Error(lookup.message);
      }
      const workflow = lookup.data;
      console.log(`Workflow ${workflow.id}`);
      console.log(`  name: ${workflow.name}`);
      console.log(`  status: ${workflow.status}`);
      console.log(`  patient: ${workflow.patient_id}`);
      console.log(`  integration: ${workflow.source_system} -> ${workflow.destination_system}`);
      console.log(`  template: ${workflow.template}`);
      console.log(`  steps: ${workflow.steps.join(" -> ")}`);
      console.log(`  appointment_ids: ${workflow.appointment_ids.join(", ") || "(none)"}`);
      console.log(`  lab_result_ids: ${workflow.lab_result_ids.join(", ") || "(none)"}`);
      if (workflow.description) console.log(`  description: ${workflow.description}`);
      if (workflow.rejection_note) console.log(`  rejection_note: ${workflow.rejection_note}`);
      console.log(`  created_at: ${workflow.created_at}`);
      console.log(`  updated_at: ${workflow.updated_at}`);
      console.log(`  validation: ${JSON.stringify(workflow.last_validation ?? "not recorded")}`);
      console.log("  history:");
      for (const entry of workflow.history ?? []) {
        console.log(`    ${entry.from ?? "(new)"} -> ${entry.to} at ${entry.at}${entry.note ? ` (${entry.note})` : ""}`);
      }
      const auditEvents = await listAuditEventsForWorkflow(workflow.id);
      console.log("  audit events:");
      if (auditEvents.length === 0) {
        console.log("    (none)");
      } else {
        for (const event of auditEvents) {
          console.log(
            `    ${event.action} by ${event.actor} at ${event.timestamp}${event.reason ? ` - reason: ${event.reason}` : ""}`
          );
        }
      }
      return;
    }

    case "approve":
    case "reject": {
      if (!id) throw new Error(`${command} requires a workflow ID.\n${usage()}`);
      const actor = requireValue(values.actor, "--actor");
      // approve does not require a reason; reject does.
      const result =
        command === "approve"
          ? await approveWorkflow(id, actor)
          : await rejectWorkflow(id, actor, requireValue(values.reason, "--reason"));
      if (!result.ok) {
        throw new Error(result.error);
      }
      console.log(`${result.data.status} workflow ${result.data.id} (actor: ${actor}).`);
      console.log(`  name: ${result.data.name}`);
      console.log(`  updated_at: ${result.data.updated_at}`);
      if (command === "reject") console.log(`  reason: ${values.reason?.trim()}`);
      console.log("This decision does not execute or publish the workflow.");
      return;
    }

    default:
      throw new Error(`Unknown command '${command}'.\n${usage()}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Admin CLI error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
