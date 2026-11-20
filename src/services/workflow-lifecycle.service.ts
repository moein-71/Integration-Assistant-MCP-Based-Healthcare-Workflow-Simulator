import { found, notFound, type Lookup } from "../domain/lookup.js";
import type { OperationResult } from "../domain/results.js";
import { fail, ok } from "../domain/results.js";
import type {
  IntegrationSystem,
  ValidationResult,
  Workflow,
  WorkflowTemplate
} from "../domain/types.js";
import {
  findWorkflowById,
  insertWorkflow,
  listWorkflows,
  nextWorkflowId,
  replaceWorkflow,
  withWorkflowWriteLock
} from "../repositories/workflow.repository.js";
import { formatValidationFailure, validateWorkflowRecord } from "./workflow-validation.service.js";

export interface EditableWorkflowFields {
  name: string;
  patient_id: string;
  source_system: IntegrationSystem;
  destination_system: IntegrationSystem;
  template: WorkflowTemplate;
  steps: string[];
  appointment_ids?: string[];
  lab_result_ids?: string[];
  description?: string;
}

export interface ReviseWorkflowInput extends EditableWorkflowFields {
  revision_note?: string;
}

function nextTimestamp(previous: string): string {
  const previousTime = Date.parse(previous);
  const now = Date.now();
  return new Date(Number.isNaN(previousTime) ? now : Math.max(now, previousTime + 1)).toISOString();
}

export async function createWorkflowDraft(input: EditableWorkflowFields): Promise<OperationResult<Workflow>> {
  return withWorkflowWriteLock(async () => {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: nextWorkflowId(await listWorkflows()),
      name: input.name,
      patient_id: input.patient_id,
      source_system: input.source_system,
      destination_system: input.destination_system,
      template: input.template,
      steps: input.steps,
      appointment_ids: input.appointment_ids ?? [],
      lab_result_ids: input.lab_result_ids ?? [],
      description: input.description,
      status: "DRAFT",
      created_at: now,
      updated_at: now,
      history: [{ from: null, to: "DRAFT", at: now }]
    };

    const validation = await validateWorkflowRecord(workflow);
    if (!validation.valid) {
      return fail(formatValidationFailure(validation));
    }
    await insertWorkflow(workflow);
    return ok(workflow);
  });
}

/** Strictly read-only: no persistence, no timestamp changes, no state change. */
export async function validateWorkflowById(id: string): Promise<Lookup<ValidationResult>> {
  const workflow = await findWorkflowById(id);
  return workflow ? found(await validateWorkflowRecord(workflow)) : notFound("Workflow", id);
}

export async function submitWorkflowForApproval(id: string): Promise<OperationResult<Workflow>> {
  return withWorkflowWriteLock(async () => {
    // Always load the latest persisted record and revalidate it.
    const workflow = await findWorkflowById(id);
    if (!workflow) {
      return fail(`Workflow '${id}' was not found in the synthetic dataset.`);
    }
    if (workflow.status !== "DRAFT") {
      return fail(`Workflow '${id}' is in ${workflow.status} state; only DRAFT workflows can be submitted through MCP.`);
    }

    const validation = await validateWorkflowRecord(workflow);
    if (!validation.valid) {
      return fail(formatValidationFailure(validation));
    }

    const updatedAt = nextTimestamp(workflow.updated_at);
    const updated: Workflow = {
      ...workflow,
      status: "PENDING_APPROVAL",
      updated_at: updatedAt,
      last_validation: validation,
      history: [
        ...(workflow.history ?? []),
        { from: workflow.status, to: "PENDING_APPROVAL", at: updatedAt }
      ]
    };
    await replaceWorkflow(updated);
    return ok(updated);
  });
}

export async function reviseWorkflowDraft(id: string, input: ReviseWorkflowInput): Promise<OperationResult<Workflow>> {
  return withWorkflowWriteLock(async () => {
    const workflow = await findWorkflowById(id);
    if (!workflow) {
      return fail(`Workflow '${id}' was not found in the synthetic dataset.`);
    }
    if (workflow.status !== "REJECTED") {
      return fail(`Workflow '${id}' is in ${workflow.status} state; only REJECTED workflows can be revised.`);
    }

    const { revision_note, ...editable } = input;
    const updatedAt = nextTimestamp(workflow.updated_at);
    const revised: Workflow = {
      ...workflow,
      ...editable,
      appointment_ids: editable.appointment_ids ?? [],
      lab_result_ids: editable.lab_result_ids ?? [],
      status: "DRAFT",
      // Preserve the original identity and creation time.
      id: workflow.id,
      created_at: workflow.created_at,
      updated_at: updatedAt,
      // Clear obsolete validation; keep the rejection note as historical context.
      last_validation: undefined,
      rejection_note: workflow.rejection_note,
      history: [
        ...(workflow.history ?? []),
        {
          from: "REJECTED",
          to: "DRAFT",
          at: updatedAt,
          note: revision_note ?? workflow.rejection_note
        }
      ]
    };

    const validation = await validateWorkflowRecord(revised);
    if (!validation.valid) {
      return fail(formatValidationFailure(validation));
    }
    await replaceWorkflow(revised);
    return ok(revised);
  });
}
