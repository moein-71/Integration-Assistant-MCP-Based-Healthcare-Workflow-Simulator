import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Patient } from "../domain/types.js";
import { getPatient } from "../services/patient.service.js";
import { listPatients } from "../repositories/patient.repository.js";

/** Convert a markdown source array into a single text document. */
function document(lines: string[]): string {
  return lines.join("\n");
}

/**
 * integration://systems - describes the simulated environment.
 * Read-only: describes what is simulated, never what actually exists.
 */
function integrationSystemsContent(): string {
  return document([
    "<!-- SYNTHETIC HEALTHCARE INTEGRATION SIMULATOR -->",
    "<!-- All patients, appointments, lab results, and workflows are fictional. -->",
    "",
    "# Integration Systems",
    "",
    "This simulator creates a completely synthetic healthcare integration environment.",
    "No real patients, appointments, laboratory results, or workflows exist outside this simulation.",
    "",
    "## Simulated Data Domains",
    "",
    "- **Patients**: Synthetic patient records (PAT-SYN-XXX IDs)",
    "- **Appointments**: Scheduled medical visits with provider and location information",
    "- **Lab Results**: Synthetic laboratory test results stored with reference ranges",
    "- **Workflows**: Healthcare integration workflows that move data across systems",
    "",
    "## Simulated Integration Systems",
    "",
    "- **EHR_SYNTH**: Synthetic electronic health record system",
    "- **LAB_SYNTH**: Synthetic laboratory information system",
    "- **SCHEDULER_SYNTH**: Synthetic appointment scheduling system",
    "- **REFERRAL_SYNTH**: Synthetic referral management system",
    "",
    "## Workflow Simulator Capabilities",
    "",
    "The server exposes read-only tools for patients, appointments, lab results and",
    "workflows, plus lifecycle tools to create, validate, revise and submit workflow",
    "drafts. Approval and rejection are handled by a separate Admin CLI. Resources and",
    "prompts provide guidance to AI assistants. The simulator never executes or",
    "publishes workflows.",
    "",
    "## Simulator Limitations",
    "",
    "- No connection to real healthcare providers, hospitals, or external hospital APIs",
    "- All data is generated for demonstration purposes only and is entirely fictional",
    "- No authentication, authorization, or secure communication",
    "- No HIPAA compliance, patient privacy, or clinician validation",
    "",
    "## Machine-Readable Systems List",
    "",
    JSON.stringify(
      {
        simulation: true,
        purpose: "demonstration-only healthcare integration workflow simulator",
        data_fictional: true,
        integration_fictional: true,
        systems: ["EHR_SYNTH", "LAB_SYNTH", "SCHEDULER_SYNTH", "REFERRAL_SYNTH"],
        data_domains: ["patients", "appointments", "lab_results", "workflows"]
      },
      null,
      2
    )
  ]);
}

/** workflow://templates - documents the templates actually implemented by the simulator. */
function workflowTemplatesContent(): string {
  return document([
    "<!-- WORKFLOW TEMPLATE DOCUMENTATION -->",
    "<!-- All templates are synthetic; they do NOT represent real healthcare workflows. -->",
    "",
    "# Workflow Templates",
    "",
    "The simulator supports three documented workflow template types. Each has specific",
    "requirements and steps designed to move data across simulated integration systems.",
    "",
    "## INTAKE_HANDOFF",
    "",
    "_Use this workflow when data needs to flow from intake processing to an EHR system._",
    "",
    "- **Integration Systems**: `EHR_SYNTH` (destination)",
    "- **Purpose**: Demonstrate structured patient data transfer",
    "",
    "### Required Steps",
    "",
    "1. Gather patient information from intake source",
    "2. Validate patient demographics and identifiers",
    "3. Transform data for EHR field mapping",
    "4. Submit to EHR_SYNTH",
    "5. Record integration completion in EHR system",
    "",
    "## LAB_REVIEW",
    "",
    "_Use this workflow when laboratory test results need to be communicated to EHR._",
    "",
    "- **Integration Systems**: `LAB_SYNTH` (source), `EHR_SYNTH` (destination)",
    "- **Purpose**: Demonstrate lab result data transfer with reference ranges",
    "",
    "### Required Steps",
    "",
    "1. Retrieve lab test order from LAB_SYNTH",
    "2. Fetch finalized lab result from LAB_SYNTH",
    "3. Validate result value and unit consistency",
    "4. Map to EHR result field format",
    "5. Submit result to EHR_SYNTH",
    "",
    "## REFERRAL_COORDINATION",
    "",
    "_Use this workflow to manage referral information between scheduling and referral systems._",
    "",
    "- **Integration Systems**: Both `SCHEDULER_SYNTH` and `REFERRAL_SYNTH`",
    "- **Purpose**: Demonstrate referral status tracking and patient appointment coordination",
    "",
    "### Required Steps",
    "",
    "1. Retrieve referral request from REFERRAL_SYNTH",
    "2. Validate referral eligibility and created_at timestamp",
    "3. Create appointment in SCHEDULER_SYNTH",
    "4. Update referral status to scheduled",
    "5. Return appointment confirmation to referral",
    "",
    "## Machine-Readable Template Catalog",
    "",
    JSON.stringify(
      {
        templates: [
          {
            id: "INTAKE_HANDOFF",
            description: "Intake form data flow to EHR system",
            source_system: null,
            destination_system: "EHR_SYNTH",
            steps: ["gather_patient_info", "validate_demographics", "transform_data", "submit_to_ehr", "record_completion"]
          },
          {
            id: "LAB_REVIEW",
            description: "Lab result communication to EHR",
            source_system: "LAB_SYNTH",
            destination_system: "EHR_SYNTH",
            steps: ["fetch_order", "fetch_result", "validate_value", "map_to_ehr", "submit_result"]
          },
          {
            id: "REFERRAL_COORDINATION",
            description: "Referral management between scheduling and referral systems",
            source_system: "SCHEDULER_SYNTH",
            destination_system: "REFERRAL_SYNTH",
            steps: ["retrieve_referral", "validate_referral", "create_appointment", "update_status", "confirm"]
          }
        ]
      },
      null,
      2
    )
  ]);
}

/** workflow://states - documents the actual state machine and transition ownership. */
function workflowStatesContent(): string {
  return document([
    "<!-- WORKFLOW LIFECYCLE STATE MACHINE -->",
    "<!-- APPROVED does NOT mean executed or published; only a state transition. -->",
    "",
    "# Workflow Lifecycle State Machine",
    "",
    "The simulator supports four workflow states that form a defined lifecycle.",
    "",
    "## States",
    "",
    "- **DRAFT**: Initial state. MCP can revise and validate; submit moves it forward.",
    "- **PENDING_APPROVAL**: Awaiting a human decision. MCP tools are read-only here.",
    "- **APPROVED**: Human approval was recorded. NOT executed and NOT published.",
    "- **REJECTED**: Human rejection was recorded (with a reason). MCP can revise it back to DRAFT.",
    "",
    "## State Transition Diagram",
    "",
    "```",
    "DRAFT                PENDING_APPROVAL",
    "   |                        |",
    "   +-- submit_workflow -----+-- Admin approve -> APPROVED",
    "   |     for_approval       |",
    "   |                        +-- Admin reject  -> REJECTED",
    "REJECTED",
    "   +-- revise_workflow_draft (MCP) -> DRAFT",
    "```",
    "",
    "## Transition Ownership",
    "",
    "- **MCP tools** perform `DRAFT -> PENDING_APPROVAL` (submit_workflow_for_approval)",
    "  and `REJECTED -> DRAFT` (revise_workflow_draft).",
    "- **Admin CLI** performs `PENDING_APPROVAL -> APPROVED` and",
    "  `PENDING_APPROVAL -> REJECTED`. The MCP server never exposes approval/rejection.",
    "- **Validation** (validate_workflow) is read-only and never modifies a workflow.",
    "- **Submission revalidates** the workflow; a draft that fails validation cannot be submitted.",
    "- **Invalid transitions are rejected** with a clear error.",
    "- **APPROVED does not mean executed or published.** The simulator has no execution engine.",
    "",
    "## Machine-Readable State Machine",
    "",
    JSON.stringify(
      {
        states: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
        transitions: [
          {
            from: "DRAFT",
            to: "PENDING_APPROVAL",
            performed_by: "MCP (submit_workflow_for_approval)",
            requires_validation: true
          },
          {
            from: "PENDING_APPROVAL",
            to: "APPROVED",
            performed_by: "Admin CLI",
            requires_validation: false
          },
          {
            from: "PENDING_APPROVAL",
            to: "REJECTED",
            performed_by: "Admin CLI",
            requires_validation: false,
            requires_reason: true
          },
          {
            from: "REJECTED",
            to: "DRAFT",
            performed_by: "MCP (revise_workflow_draft)",
            requires_validation: true
          }
        ],
        capabilities_by_state: {
          DRAFT: ["create_workflow_draft", "validate_workflow", "revise_workflow_draft", "submit_workflow_for_approval"],
          PENDING_APPROVAL: [],
          APPROVED: ["get_workflow"],
          REJECTED: ["validate_workflow", "revise_workflow_draft"]
        },
        execution_note: "APPROVED state means human approval only. Simulator does NOT execute or publish workflows."
      },
      null,
      2
    )
  ]);
}

/**
 * patient://{id} - reads only the requested synthetic patient via the existing service.
 * Throws for an unknown ID; never writes any file.
 */
async function patientResourceText(patientId: string): Promise<string> {
  const lookup = await getPatient(patientId);
  if (!lookup.found) {
    throw new Error(lookup.message);
  }
  const patient: Patient = lookup.data;

  return document([
    "<!-- PATIENT RECORD -->",
    "<!-- WARNING: This patient record is synthetic; does NOT represent a real person. -->",
    "",
    "# Patient Information",
    "",
    "## Patient Record",
    "",
    JSON.stringify(patient, null, 2),
    "",
    "## Integration Notes",
    "",
    "- This is a synthetic patient created only for integration workflow testing.",
    "- Use `list_appointments` and `get_lab_results` with this patient ID for related data.",
    "- No real clinical findings, diagnoses, medications, or measurements are implied.",
    "- Appointments and lab results are not included here; retrieve them with their tools."
  ]);
}

/**
 * Register all MCP resources. Every resource is read-only and never modifies JSON files.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "integration-systems",
    "integration://systems",
    {
      description: "Description of the synthetic integration environment, available systems, data domains and simulator limitations."
    },
    async () => ({
      contents: [
        {
          uri: "integration://systems",
          mimeType: "text/markdown",
          text: integrationSystemsContent()
        }
      ]
    })
  );

  server.registerResource(
    "workflow-templates",
    "workflow://templates",
    {
      description: "Workflow templates supported by the simulator, with structure and a machine-readable catalog."
    },
    async () => ({
      contents: [
        {
          uri: "workflow://templates",
          mimeType: "text/markdown",
          text: workflowTemplatesContent()
        }
      ]
    })
  );

  server.registerResource(
    "workflow-states",
    "workflow://states",
    {
      description: "The workflow state machine, including transition ownership, validation rules and limitations."
    },
    async () => ({
      contents: [
        {
          uri: "workflow://states",
          mimeType: "text/markdown",
          text: workflowStatesContent()
        }
      ]
    })
  );

  // Dynamic patient resource. The list callback exposes only real synthetic patient IDs.
  const patientTemplate = new ResourceTemplate("patient://{id}", {
    list: async () => ({
      resources: (await listPatients()).map(patient => ({
        uri: `patient://${patient.id}`,
        name: `Synthetic patient ${patient.id}`,
        description: "Read-only synthetic patient record",
        mimeType: "text/markdown"
      }))
    })
  });

  server.registerResource(
    "patient-details",
    patientTemplate,
    {
      description: "Read a synthetic patient record by ID. Unknown IDs return a resource error."
    },
    async (_uri, variables) => ({
      contents: [
        {
          uri: _uri.toString(),
          mimeType: "text/markdown",
          text: await patientResourceText(String(variables.id))
        }
      ]
    })
  );
}