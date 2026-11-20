import { found, notFound, type Lookup } from "../domain/lookup.js";
import type { OperationResult } from "../domain/results.js";
import { fail, ok } from "../domain/results.js";
import { nextTimestamp } from "../domain/time.js";
import type { AdminAction, AuditEvent, Workflow } from "../domain/types.js";
import { appendAuditEvent, listAuditEventsForWorkflow as readAuditEventsForWorkflow } from "../repositories/audit.repository.js";
import { findWorkflowById, listWorkflows, replaceWorkflow, withWorkflowWriteLock } from "../repositories/workflow.repository.js";

/** Outside MCP: only the Admin CLI calls these functions. */
export async function listPendingWorkflows(): Promise<Workflow[]> {
  return listWorkflows("PENDING_APPROVAL");
}

export async function inspectWorkflow(id: string): Promise<Lookup<Workflow>> {
  const workflow = await findWorkflowById(id);
  return workflow ? found(workflow) : notFound("Workflow", id);
}

export async function listAuditEventsForWorkflow(id: string): Promise<AuditEvent[]> {
  return readAuditEventsForWorkflow(id);
}

async function decide(
  id: string,
  actor: string,
  reason: string | undefined,
  action: AdminAction
): Promise<OperationResult<Workflow>> {
  const actorLabel = actor.trim();
  if (!actorLabel) {
    return fail("A non-empty --actor label is required.");
  }
  const reasonText = reason?.trim();
  if (action === "REJECTED" && !reasonText) {
    return fail("A non-empty --reason is required when rejecting a workflow.");
  }

  return withWorkflowWriteLock(async () => {
    const workflow = await findWorkflowById(id);
    if (!workflow) {
      return fail(`Workflow '${id}' was not found in the synthetic dataset.`);
    }
    if (workflow.status !== "PENDING_APPROVAL") {
      return fail(
        `Workflow '${id}' is in ${workflow.status} state; only PENDING_APPROVAL workflows can be approved or rejected by the Admin CLI.`
      );
    }

    const at = nextTimestamp(workflow.updated_at);
    const note =
      action === "APPROVED"
        ? `Approved by ${actorLabel}`
        : `Rejected by ${actorLabel}: ${reasonText}`;
    const updated: Workflow = {
      ...workflow,
      status: action,
      updated_at: at,
      rejection_note: action === "REJECTED" ? reasonText : workflow.rejection_note,
      history: [...(workflow.history ?? []), { from: "PENDING_APPROVAL", to: action, at, note }]
    };

    await replaceWorkflow(updated);
    await appendAuditEvent({
      workflow_id: id,
      action,
      actor: actorLabel,
      timestamp: at,
      ...(action === "REJECTED" ? { reason: reasonText } : {})
    });
    return ok(updated);
  });
}

export function approveWorkflow(id: string, actor: string): Promise<OperationResult<Workflow>> {
  return decide(id, actor, undefined, "APPROVED");
}

export function rejectWorkflow(id: string, actor: string, reason: string | undefined): Promise<OperationResult<Workflow>> {
  return decide(id, actor, reason, "REJECTED");
}
