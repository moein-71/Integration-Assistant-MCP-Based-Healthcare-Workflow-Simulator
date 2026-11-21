import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult, PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Build a single user text message from lines of instruction text. */
function userText(lines: string[]): PromptMessage {
  return {
    role: "user",
    content: { type: "text", text: lines.join("\n") }
  };
}

/**
 * create_patient_integration_workflow
 * Guides an assistant to gather context before drafting and submitting a workflow.
 */
function createPatientIntegrationWorkflowInstruction(args: {
  patient_id: string;
}): GetPromptResult {
  const { patient_id } = args;
  return {
    description: `Context-gathering workflow for creating an integration workflow for synthetic patient ${patient_id}`,
    messages: [
      userText([
        "# Workflow Creation Instructions",
        "",
        `You are asked to create an integration workflow for the synthetic patient '${patient_id}'.`,
        "Follow these steps in order. Do not skip context gathering.",
        "",
        "## Step 1 - Retrieve patient information first",
        "",
        "- Call get_patient with patient_id and confirm the patient exists.",
        "- If the patient cannot be found, report that clearly and stop. Do not continue.",
        "",
        "## Step 2 - Retrieve relevant appointments and lab results when needed",
        "",
        "- Use list_appointments with the patient_id to find relevant appointments.",
        "- Use get_lab_results with the patient_id to find relevant lab results.",
        "- Only include IDs that actually exist in the synthetic dataset.",
        "",
        "## Step 3 - Inspect available workflow templates",
        "",
        "- Read the workflow://templates resource to learn the supported templates,",
        "  their source/destination systems and their required steps.",
        "- Read the integration://systems resource to confirm the available systems.",
        "",
        "## Step 4 - Create a workflow draft only after gathering context",
        "",
        "- Call create_workflow_draft with a supported template and valid system values.",
        "- Never guess patient IDs, appointment IDs or lab result IDs.",
        "- Never invent patient information, clinical findings, diagnoses, medications or measurements.",
        "",
        "## Step 5 - Validate the resulting workflow",
        "",
        "- Call validate_workflow with the generated workflow_id.",
        "- Review the errors and warnings carefully.",
        "",
        "## Step 6 - Submit for human approval only if validation succeeds",
        "",
        "- If validation is valid, call submit_workflow_for_approval to move the",
        "  workflow from DRAFT to PENDING_APPROVAL, then stop.",
        "- If validation fails, do not submit. Explain the errors and suggest revising the draft.",
        "",
        "## Hard limits",
        "",
        "- Stop after submission.",
        "- Never approve, execute or publish a workflow.",
        "- Approval and rejection are handled only by the separate Admin CLI.",
        "- APPROVED is a human decision state; it does not mean executed or published.",
        "- All data is synthetic and fictional."
      ])
    ]
  };
}

/**
 * summarize_patient_information
 * Guides an assistant to produce a concise, structured, honest summary.
 */
function summarizePatientInformationInstruction(args: {
  patient_id: string;
}): GetPromptResult {
  const { patient_id } = args;
  return {
    description: `Summarize the synthetic data available for patient ${patient_id}`,
    messages: [
      userText([
        "# Patient Information Summary Instructions",
        "",
        `Prepare a concise, structured summary for synthetic patient '${patient_id}'.`,
        "Base every statement strictly on data returned by the available tools.",
        "",
        "## Retrieve only actual synthetic data",
        "",
        "- Call get_patient (or get_patient_summary) with the patient_id.",
        "- Use list_appointments with the patient_id when appointment information is relevant.",
        "- Use get_lab_results with the patient_id when lab information is relevant.",
        "- If the patient does not exist, say so clearly and stop.",
        "",
        "## Structure of the summary",
        "",
        "1. Basic patient identifiers (id, display name, date of birth, status).",
        "2. Appointment information, grouped by status, with dates and providers.",
        "3. Lab results, with test name, value, unit, reference range and status.",
        "4. A short list of information that is missing.",
        "",
        "## Accuracy and safety rules",
        "",
        "- Distinguish missing information from negative findings. 'No lab results",
        "  recorded' is not the same as a normal result.",
        "- Never invent clinical findings, diagnoses, medications or measurements.",
        "- Never infer a condition from an appointment reason or a lab value.",
        "- Clearly identify that all information is synthetic and fictional.",
        "- Do not offer medical advice or treatment recommendations.",
        "- Keep the summary concise and structured."
      ])
    ]
  };
}

/**
 * review_workflow_draft
 * Guides an assistant to review, not modify, approve or execute, a workflow.
 */
function reviewWorkflowDraftInstruction(args: {
  workflow_id: string;
}): GetPromptResult {
  const { workflow_id } = args;
  return {
    description: `Review the synthetic workflow ${workflow_id} without modifying it`,
    messages: [
      userText([
        "# Workflow Draft Review Instructions",
        "",
        `Review the workflow '${workflow_id}'. Your job is to explain and assess it,`,
        "not to change it.",
        "",
        "## Gather review context",
        "",
        "- Call get_workflow with the workflow_id to retrieve the workflow details.",
        "- Inspect its current status and validation information (last_validation).",
        "- Read the workflow://states resource to understand valid transitions.",
        "- Read the workflow://templates resource to check the chosen template.",
        "- Review the patient context with get_patient using the workflow's patient_id,",
        "  and use list_appointments / get_lab_results when referenced IDs need checking.",
        "",
        "## Review structure",
        "",
        "1. Identify the workflow, its template, source and destination systems.",
        "2. Review the steps and the referenced appointment and lab result IDs.",
        "3. Report validation errors and warnings separately and clearly.",
        "4. Note whether referenced resources actually exist in the synthetic data.",
        "5. Note the current status and which transitions are possible.",
        "",
        "## Hard limits",
        "",
        "- Do not change the workflow automatically.",
        "- Never approve, execute or publish the workflow.",
        "- Human approval and rejection must happen through the separate Admin CLI.",
        "- APPROVED means a human decision was recorded, not that the workflow ran.",
        "- All workflows and data are synthetic and fictional."
      ])
    ]
  };
}

/** Register exactly the three MCP prompts. Prompts provide instructions only. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "create_patient_integration_workflow",
    {
      title: "Create Patient Integration Workflow",
      description: "Guide an assistant to gather patient, appointment, lab and template context before creating and validating a workflow draft, then submit it for human approval only if valid.",
      argsSchema: { patient_id: z.string().min(1).describe("Synthetic patient ID, for example PAT-SYN-001.") }
    },
    createPatientIntegrationWorkflowInstruction
  );

  server.registerPrompt(
    "summarize_patient_information",
    {
      title: "Summarize Patient Information",
      description: "Produce a concise, structured summary of a synthetic patient using only real tool data, distinguishing missing information from negative findings.",
      argsSchema: { patient_id: z.string().min(1).describe("Synthetic patient ID, for example PAT-SYN-001.") }
    },
    summarizePatientInformationInstruction
  );

  server.registerPrompt(
    "review_workflow_draft",
    {
      title: "Review Workflow Draft",
      description: "Review a workflow's status, validation and patient context, reporting errors and warnings without modifying, approving, executing or publishing it.",
      argsSchema: { workflow_id: z.string().min(1).describe("Workflow ID, for example WF-SYN-001.") }
    },
    reviewWorkflowDraftInstruction
  );
}