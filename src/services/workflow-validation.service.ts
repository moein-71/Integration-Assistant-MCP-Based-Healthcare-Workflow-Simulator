import type { ValidationResult, Workflow } from "../domain/types.js";
import { INTEGRATION_SYSTEMS, WORKFLOW_STATUSES, WORKFLOW_TEMPLATES } from "../domain/workflow-policy.js";
import { findAppointmentById } from "../repositories/appointment.repository.js";
import { findLabResultById } from "../repositories/lab-result.repository.js";
import { findPatientById } from "../repositories/patient.repository.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Read-only checks over the latest persisted records. Never writes or changes timestamps. */
export async function validateWorkflowRecord(workflow: Workflow): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const workflowId = isNonEmptyString(workflow.id) ? workflow.id : "unknown";

  if (!isNonEmptyString(workflow.id)) errors.push("Workflow ID is missing.");
  if (!isNonEmptyString(workflow.name)) errors.push("Workflow name is missing.");
  if (!isNonEmptyString(workflow.patient_id)) errors.push("Patient ID is missing.");
  if (!WORKFLOW_STATUSES.includes(workflow.status)) errors.push(`Unsupported workflow status '${String(workflow.status)}'.`);
  if (!INTEGRATION_SYSTEMS.includes(workflow.source_system)) {
    errors.push(`Unsupported source system '${String(workflow.source_system)}'.`);
  }
  if (!INTEGRATION_SYSTEMS.includes(workflow.destination_system)) {
    errors.push(`Unsupported destination system '${String(workflow.destination_system)}'.`);
  }
  if (!WORKFLOW_TEMPLATES.includes(workflow.template)) {
    errors.push(`Unsupported workflow template '${String(workflow.template)}'.`);
  }

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  if (steps.length === 0) {
    errors.push("Workflow must contain at least one step.");
  } else {
    if (steps.some(step => !isNonEmptyString(step))) {
      errors.push("Every workflow step must be a non-empty string.");
    }
    if (new Set(steps).size !== steps.length) {
      errors.push("Workflow steps must be unique.");
    }
  }

  const appointmentIds = Array.isArray(workflow.appointment_ids) ? workflow.appointment_ids : [];
  const labResultIds = Array.isArray(workflow.lab_result_ids) ? workflow.lab_result_ids : [];

  if (isNonEmptyString(workflow.patient_id)) {
    const patient = await findPatientById(workflow.patient_id);
    if (!patient) {
      errors.push(`Patient '${workflow.patient_id}' does not exist in the synthetic dataset.`);
    }
  }

  for (const id of appointmentIds) {
    if (!isNonEmptyString(id)) {
      errors.push("Appointment IDs must be non-empty strings.");
      continue;
    }
    const appointment = await findAppointmentById(id);
    if (!appointment) {
      errors.push(`Appointment '${id}' does not exist in the synthetic dataset.`);
    } else if (appointment.patient_id !== workflow.patient_id) {
      errors.push(`Appointment '${id}' belongs to a different patient than '${workflow.patient_id}'.`);
    }
  }

  for (const id of labResultIds) {
    if (!isNonEmptyString(id)) {
      errors.push("Lab-result IDs must be non-empty strings.");
      continue;
    }
    const labResult = await findLabResultById(id);
    if (!labResult) {
      errors.push(`Lab result '${id}' does not exist in the synthetic dataset.`);
    } else if (labResult.patient_id !== workflow.patient_id) {
      errors.push(`Lab result '${id}' belongs to a different patient than '${workflow.patient_id}'.`);
    }
  }

  if (appointmentIds.length === 0 && labResultIds.length === 0) {
    warnings.push("No appointment or lab-result records are referenced.");
  }
  if (workflow.source_system === workflow.destination_system) {
    warnings.push("Source and destination integration systems are the same.");
  }
  if (steps.length === 1) {
    warnings.push("Workflow contains only one step.");
  }
  if (workflow.status !== "DRAFT") {
    warnings.push(`Workflow is in ${String(workflow.status)} state; only DRAFT workflows can be submitted through MCP.`);
  }

  return { valid: errors.length === 0, errors, warnings, workflow_id: workflowId };
}

export function formatValidationFailure(validation: ValidationResult): string {
  return [`Workflow '${validation.workflow_id}' is invalid:`, ...validation.errors.map(error => `- ${error}`)].join("\n");
}
