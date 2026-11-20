import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { INTEGRATION_SYSTEMS, WORKFLOW_STATUSES, WORKFLOW_TEMPLATES } from "../../domain/workflow-policy.js";
import { getWorkflow, listWorkflows } from "../../services/workflow.service.js";
import {
  createWorkflowDraft,
  reviseWorkflowDraft,
  submitWorkflowForApproval,
  validateWorkflowById
} from "../../services/workflow-lifecycle.service.js";
import { fromLookup, fromOperation, jsonResult } from "./tool-result.js";

const editableWorkflowFields = {
  name: z.string().min(1).describe("Human-readable synthetic workflow name."),
  patient_id: z.string().min(1).describe("Existing synthetic patient ID that owns this workflow."),
  source_system: z.enum(INTEGRATION_SYSTEMS).describe("Supported synthetic source integration system."),
  destination_system: z.enum(INTEGRATION_SYSTEMS).describe("Supported synthetic destination integration system."),
  template: z.enum(WORKFLOW_TEMPLATES).describe("Supported workflow template/type."),
  steps: z.array(z.string().min(1)).min(1).describe("Ordered, unique, non-empty workflow step names."),
  appointment_ids: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional existing appointment IDs; each must belong to patient_id."),
  lab_result_ids: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional existing lab-result IDs; each must belong to patient_id."),
  description: z.string().optional().describe("Optional description of this synthetic workflow.")
};

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    "get_workflow",
    {
      title: "Get synthetic workflow",
      description:
        "Look up one synthetic workflow by ID. Returns its lifecycle status (DRAFT, PENDING_APPROVAL, APPROVED or REJECTED), name, steps, related record references, last validation result and history. Read-only. Returns a not-found error for an unknown ID.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Synthetic workflow ID, for example WF-SYN-001.")
      }
    },
    async ({ workflow_id }) => fromLookup(await getWorkflow(workflow_id))
  );

  server.registerTool(
    "list_workflows",
    {
      title: "List synthetic workflows",
      description:
        "List synthetic workflows, optionally filtered by lifecycle status. Valid statuses: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED. Returns a JSON array, empty when nothing matches. Read-only; does not execute or publish workflows.",
      inputSchema: {
        status: z.enum(WORKFLOW_STATUSES).optional().describe("Optional workflow lifecycle status filter.")
      }
    },
    async ({ status }) => jsonResult(await listWorkflows(status))
  );

  server.registerTool(
    "create_workflow_draft",
    {
      title: "Create workflow draft",
      description:
        "Create and persist a new synthetic workflow in DRAFT state. Validates the patient, integration systems, template, steps, and every referenced appointment/lab result against the synthetic datasets before saving. Returns the created workflow including its generated ID. Never creates a workflow in any other state and does not submit or execute it.",
      inputSchema: editableWorkflowFields
    },
    async input => fromOperation(await createWorkflowDraft(input))
  );

  server.registerTool(
    "validate_workflow",
    {
      title: "Validate workflow",
      description:
        "Read-only validation of an existing synthetic workflow. Returns { valid, errors, warnings, workflow_id }, separating blocking errors from non-blocking warnings. Checks required fields, patient, integration systems, template, steps, and related record references. Does not modify data, timestamps, or lifecycle state and does not persist the validation result. Non-DRAFT states are reported as warnings.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Synthetic workflow ID to validate.")
      }
    },
    async ({ workflow_id }) => fromLookup(await validateWorkflowById(workflow_id))
  );

  server.registerTool(
    "submit_workflow_for_approval",
    {
      title: "Submit workflow for approval",
      description:
        "Submit a DRAFT synthetic workflow for human approval. Reloads the latest persisted record, revalidates it from scratch, and only then changes DRAFT to PENDING_APPROVAL and updates the timestamp. Invalid workflows stay in DRAFT with validation errors returned. Rejects workflows in any other state. This tool never approves, rejects, executes, or publishes a workflow.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Synthetic workflow ID in DRAFT state.")
      }
    },
    async ({ workflow_id }) => fromOperation(await submitWorkflowForApproval(workflow_id))
  );

  server.registerTool(
    "revise_workflow_draft",
    {
      title: "Revise rejected workflow draft",
      description:
        "Revise a REJECTED synthetic workflow and return it to DRAFT. Requires the full editable workflow content, preserves the original ID and creation timestamp, updates the modification timestamp, clears obsolete validation results, and keeps rejection context in history. Rejects workflows in any other state. Does not submit the revised workflow automatically.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Synthetic workflow ID in REJECTED state."),
        ...editableWorkflowFields,
        revision_note: z.string().min(1).optional().describe("Optional note explaining this revision.")
      }
    },
    async ({ workflow_id, revision_note, ...editable }) =>
      fromOperation(await reviseWorkflowDraft(workflow_id, { ...editable, revision_note }))
  );
}
