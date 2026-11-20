/** The only lifecycle states used by the workflow model. */
export const WORKFLOW_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Synthetic integration systems supported by demonstration workflows. */
export const INTEGRATION_SYSTEMS = ["EHR_SYNTH", "LAB_SYNTH", "SCHEDULER_SYNTH", "REFERRAL_SYNTH"] as const;
export type IntegrationSystem = (typeof INTEGRATION_SYSTEMS)[number];

export const WORKFLOW_TEMPLATES = ["INTAKE_HANDOFF", "LAB_REVIEW", "REFERRAL_COORDINATION"] as const;
export type WorkflowTemplate = (typeof WORKFLOW_TEMPLATES)[number];

/**
 * Transitions available through MCP in this stage.
 * PENDING_APPROVAL -> APPROVED / REJECTED belongs to a future Admin CLI and is
 * deliberately not exposed here.
 */
export const ALLOWED_MCP_TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: [],
  APPROVED: [],
  REJECTED: ["DRAFT"]
};
