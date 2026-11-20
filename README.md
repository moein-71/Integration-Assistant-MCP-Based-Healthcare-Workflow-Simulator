# Integration Assistant — MCP-Based Healthcare Workflow Simulator

A TypeScript MCP server that demonstrates synthetic healthcare integration workflows
over stdio. **All patients, appointments, lab-style results, and workflows are
fictional.** See `data/README.md`.

## Current status (Stage 3)

The server exposes **exactly 10 MCP tools**: six read-only tools from Stage 2 plus
four workflow lifecycle tools added in this stage.

**Not implemented:** human approval/rejection (planned as a separate Admin CLI),
workflow execution or publishing, MCP resources or prompts, authentication, databases,
and external healthcare integrations.

## Workflow lifecycle

The only workflow states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `REJECTED`.

```text
DRAFT
  |
  | submit_workflow_for_approval (MCP)
  v
PENDING_APPROVAL
  |                 |
  | Admin approve   | Admin reject   <-- future Admin CLI, not available via MCP
  v                 v
APPROVED          REJECTED
                     |
                     | revise_workflow_draft (MCP)
                     v
                   DRAFT
```

MCP can perform only `DRAFT -> PENDING_APPROVAL` and `REJECTED -> DRAFT`. Every other
transition is rejected with a clear error. Approval and rejection are deliberately
**not** exposed through MCP; they will be added later through a separate human Admin
CLI. The simulator never executes or publishes workflows — `APPROVED` is a supported
state value for the future approval flow, but no current fixture uses it.

### Validation vs submission

- `validate_workflow` is strictly read-only. It reports `valid`, `errors`, `warnings`,
  and `workflow_id`; it never writes data, changes timestamps, or changes state.
  A prior validation result is never treated as a guarantee.
- `submit_workflow_for_approval` always **revalidates the latest persisted record**
  before changing `DRAFT` to `PENDING_APPROVAL`. This prevents submitting a workflow
  whose references were changed (or became invalid) after an earlier successful
  validation. Invalid drafts stay in `DRAFT` and return the validation errors.
- `revise_workflow_draft` works only on `REJECTED` workflows. It preserves the ID and
  creation timestamp, updates the modification timestamp, clears obsolete validation
  results, retains rejection context in history, and returns to `DRAFT` without
  submitting automatically.

The three original fixtures contained only `draft` (WF-SYN-001 and WF-SYN-003) and
`awaiting_review` (WF-SYN-002). They were normalized to `DRAFT` and `PENDING_APPROVAL`
respectively; WF-SYN-003 was intentionally left in `DRAFT` because it was already a
draft. A `REJECTED` fixture (WF-SYN-004) was added to demonstrate revision. No fixture
previously used `completed`, so none was mapped to `APPROVED`; that mapping is defined
only for hypothetical legacy data and does not imply that any workflow was executed.
The old lowercase values are no longer active workflow states.

## Architecture

```text
data/                         Synthetic JSON dataset (production fixtures)
src/domain/                   Entity types, lifecycle policy, results
src/repositories/             JSON file access, atomic writes, write serialisation
src/services/                 Validation and workflow lifecycle operations
src/server/tools/             MCP tool registration, schemas and result formatting
src/client/smoke.ts           Real MCP client smoke script
tests/repositories/           Data access and integrity tests
tests/services/               Workflow lifecycle unit/integration tests
tests/smoke/                  Real MCP stdio tests
tests/support/                Isolated-data test client helper
```

Persistence uses the same JSON files as the read tools. Writes go to a temporary file
and are renamed into place (atomic replace). Paths are module-relative by default, so
no particular working directory is required. Tests set `MCP_DATA_DIR` to an isolated
temporary copy of the fixtures, so checked-in data is never modified and parallel
tests cannot interfere.

## Available tools

Read-only (Stage 2):

| Tool | Input | Returns |
| --- | --- | --- |
| `get_patient` | `patient_id` (required) | One synthetic patient or not-found error |
| `get_patient_summary` | `patient_id` (required) | Patient with appointments/lab results and explicit missing-information list |
| `list_appointments` | `patient_id?`, `status?` (`scheduled`/`completed`/`cancelled`) | Matching appointments; empty array if none |
| `get_lab_results` | `patient_id` (required) | Not-found error for unknown patient; empty array for existing patient with no results |
| `get_workflow` | `workflow_id` (required) | One workflow including status, validation metadata and history |
| `list_workflows` | `status?` (`DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED`) | Matching workflows; empty array if none |

Workflow lifecycle (Stage 3):

| Tool | Input | Returns |
| --- | --- | --- |
| `create_workflow_draft` | `name`, `patient_id`, `source_system`, `destination_system`, `template`, `steps`, optional `appointment_ids`, `lab_result_ids`, `description` | Created workflow in `DRAFT` with generated ID |
| `validate_workflow` | `workflow_id` | `{ valid, errors, warnings, workflow_id }` — no side effects |
| `submit_workflow_for_approval` | `workflow_id` | Updated `PENDING_APPROVAL` workflow, or validation/state errors |
| `revise_workflow_draft` | `workflow_id` plus the editable workflow fields, optional `revision_note` | Revised workflow in `DRAFT` |

Supported systems: `EHR_SYNTH`, `LAB_SYNTH`, `SCHEDULER_SYNTH`, `REFERRAL_SYNTH`.
Templates: `INTAKE_HANDOFF`, `LAB_REVIEW`, `REFERRAL_COORDINATION`.
Every referenced patient, appointment and lab result must exist in the synthetic data
and belong to the specified patient.

Tool results use a `{ notice, data }` JSON envelope; errors use MCP `isError: true`
with readable messages. No stack traces or local paths are exposed.

## Prerequisites and commands

Node.js >= 18 (verified on Node 26), npm, no global TypeScript needed.

```bash
npm install
npm run typecheck
npm run build
npm test
npm run smoke
npm run server   # run the MCP server over stdio (normally spawned by a client)
```

The stdio client spawns a separate server process with `process.execPath`, performs
the MCP `initialize` handshake, and closes the process in a `finally` block. Server
stdout is reserved for MCP protocol traffic; diagnostics go to stderr.
