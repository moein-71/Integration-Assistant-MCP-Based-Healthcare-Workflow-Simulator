# Integration Assistant — MCP-Based Healthcare Workflow Simulator

A TypeScript MCP server that demonstrates synthetic healthcare integration workflows
over stdio. **All patients, appointments, lab-style results, and workflows are
fictional.** See `data/README.md`.

## Current status (Stage 6 — final verification)

The MCP server exposes **exactly 10 tools**, **3 read-only static resources plus one
patient resource template**, and **exactly 3 prompts**. Approval and rejection are
handled only by the separate **Admin CLI** (`src/admin/`), which never imports or
registers MCP capabilities.

Built with TypeScript 5.9.3 and `@modelcontextprotocol/sdk` **1.32.2** using ESM and
strict compiler settings. Node.js >= 18 is required; all packages are local (no global
tools) and there is no runtime dependency beyond the MCP SDK and Zod.

**Not implemented by design:** workflow execution or publishing, authentication /
authorization, databases, external healthcare integrations, real patient data, RAG or
embeddings. Nothing in this project is a production healthcare system: all records are
fictional, no real hospital or external API is connected, and `APPROVED` is only a
human-decision state, not a signal that any workflow ran.

## Workflow lifecycle

The only workflow states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `REJECTED`.

```text
DRAFT
  |
  | submit_workflow_for_approval (MCP)
  v
PENDING_APPROVAL
  |                 |
  | Admin approve   | Admin reject   <-- Admin CLI only, never via MCP
  v                 v
APPROVED          REJECTED
                     |
                     | revise_workflow_draft (MCP)
                     v
                   DRAFT
```

MCP can perform only `DRAFT -> PENDING_APPROVAL` and `REJECTED -> DRAFT`. Every other
transition is rejected with a clear error. Approval and rejection are deliberately
**not** exposed through MCP; they are implemented in the separate Admin CLI described
below. The simulator never executes or publishes workflows — `APPROVED` is a state
value only, and no current fixture uses it.

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

## Admin CLI (human approval/rejection)

The Admin CLI is a **separate process** (`src/admin/cli.ts`) using Node's built-in
`node:util` `parseArgs`. It reuses the domain types, repositories, and JSON persistence
but is never imported or registered by the MCP server. It does not add any MCP tools.

```bash
npm run admin -- list
npm run admin -- inspect WF-SYN-002
npm run admin -- approve WF-SYN-002 --actor "admin@example.com"
npm run admin -- reject WF-SYN-002 --actor "admin@example.com" --reason "Missing integration details"
```

| Command | Behavior |
| --- | --- |
| `list` | Shows only `PENDING_APPROVAL` workflows |
| `inspect <id>` | Shows status, editable fields, validation metadata, workflow history and audit events |
| `approve <id> --actor <label>` | `PENDING_APPROVAL -> APPROVED` only |
| `reject <id> --actor <label> --reason <text>` | `PENDING_APPROVAL -> REJECTED` only; reason must be non-empty |

Invalid commands, missing IDs, empty `--actor`/`--reason` values, and invalid state
transitions print a clear error and exit non-zero. Successful commands print a
human-readable confirmation and update the workflow file plus its history.

**`--actor` is a self-declared audit label only. It is NOT authentication or
authorization.** Anyone able to run the CLI can supply any label; there is no identity
verification, role check, or signature. Do not treat it as a security control.

Approval is a state change only: **the CLI never executes or publishes a workflow.**

### Audit log

Each successful approve/reject appends an event to `data/audit-events.json`, separate
from the workflow fixtures. Events contain workflow ID, action (`APPROVED`/`REJECTED`),
actor label, timestamp, and the rejection reason when applicable. The file is created
on first use and is ignored by Git so local audit data is not accidentally committed.

Limitations: the "append" is implemented as read-all + atomic rewrite of a single JSON
file. There is no cross-process locking, hash chain, tamper detection, or durability
guarantee beyond the JSON file write. A crash between the workflow write and the audit
write could leave them inconsistent. This is intentionally minimal for the MVP.

## MCP Resources and Prompts (Stage 5)

Resources and prompts are a different MCP capability from tools:

- **Tools** are callable operations that may read or write synthetic data.
- **Resources** are read-only, URI-addressable context that an MCP client can read.
  Reading a resource never modifies any JSON file or workflow state.
- **Prompts** are reusable instruction templates. They only return text messages;
  they never call tools, modify data, approve, execute, or publish workflows.

### Resources

| URI | Kind | Content |
| --- | --- | --- |
| `integration://systems` | static | The simulated environment: data domains, available synthetic systems, workflow capabilities, and the fact that no real system or external API is connected |
| `workflow://templates` | static | The three supported templates (`INTAKE_HANDOFF`, `LAB_REVIEW`, `REFERRAL_COORDINATION`), their source/destination systems and steps |
| `workflow://states` | static | The real state machine, which transitions belong to MCP vs the Admin CLI, validation rules, and the fact that `APPROVED` does not mean executed |
| `patient://{id}` | template | One synthetic patient record by ID, read through the existing patient service; unknown IDs return a resource error |

The patient template's discovery callback lists only real patient IDs from the
synthetic dataset (it never invents IDs). All resource content is markdown combined
with a machine-readable JSON section and is strictly read-only.

### Prompts

| Prompt | Arguments | Purpose |
| --- | --- | --- |
| `create_patient_integration_workflow` | `patient_id` | Gather patient, appointment, lab and template context, create a draft, validate, and submit for approval only if valid |
| `summarize_patient_information` | `patient_id` | Summarize a synthetic patient from real tool data, distinguishing missing data from negative findings and inventing nothing |
| `review_workflow_draft` | `workflow_id` | Review status, validation and patient context; report errors/warnings separately without modifying or approving the workflow |

Prompts guide an AI assistant but never perform approval, execution or publishing.
Human approval/rejection remains exclusively in the Admin CLI.

### Example MCP client usage

```ts
const { resources } = await client.listResources();
const { resourceTemplates } = await client.listResourceTemplates();
const patient = await client.readResource({ uri: "patient://PAT-SYN-001" });
const { prompts } = await client.listPrompts();
const instructions = await client.getPrompt({
  name: "create_patient_integration_workflow",
  arguments: { patient_id: "PAT-SYN-001" }
});
```

## End-to-end demonstration

`npm run demo` runs `scripts/end-to-end-demo.ts`: a real MCP Client connects to the
real stdio server and drives the separate Admin CLI, all against a temporary copy of
the fixtures. Actual output from the final verification run (abbreviated where noted):

```text
$ npm run demo
===== 1-3. Connect, list tools, read the three static resources =====
MCP tools (10): create_workflow_draft, get_lab_results, get_patient, get_patient_summary, get_workflow, list_appointments, list_workflows, revise_workflow_draft, submit_workflow_for_approval, validate_workflow
Read integration://systems: 57 lines; first line: <!-- SYNTHETIC HEALTHCARE INTEGRATION SIMULATOR -->
Read workflow://templates: 98 lines; first line: <!-- WORKFLOW TEMPLATE DOCUMENTATION -->
Read workflow://states: 95 lines; first line: <!-- WORKFLOW LIFECYCLE STATE MACHINE -->

===== 4-5. Discover the patient template and read a synthetic patient =====
Resource templates: patient://{id}
{
  "id": "PAT-SYN-001",
  "display_name": "Avery Cedarwood", ... }

===== 6-8. Retrieve appointments/labs, create, validate and submit a draft =====
patient PAT-SYN-001: 2 appointments, 2 lab results
created: WF-SYN-005 status=DRAFT
validate: valid=true errors=0 warnings=0
submit: WF-SYN-005 status=PENDING_APPROVAL

===== 9-12. Admin CLI list/inspect, approve; verify APPROVED =====
$ npm run admin -- list
Workflows awaiting approval (2):
WF-SYN-002  PENDING_APPROVAL  Synthetic referral coordination example
WF-SYN-005  PENDING_APPROVAL  Stage 6 demonstration workflow
...
$ npm run admin -- approve WF-SYN-005 --actor "admin@example.com"
APPROVED workflow WF-SYN-005 (actor: admin@example.com).
This decision does not execute or publish the workflow.
after approval: WF-SYN-005 status=APPROVED

===== 13. Rejection and revision path in the isolated dataset =====
created+submitted workflow: WF-SYN-006 status=PENDING_APPROVAL
$ npm run admin -- reject WF-SYN-006 --actor "admin@example.com" --reason "Synthetic demo: handoff details need revision"
REJECTED workflow WF-SYN-006 (actor: admin@example.com).
after rejection: WF-SYN-006 status=REJECTED rejection_note="Synthetic demo: handoff details need revision"
revised: WF-SYN-006 status=DRAFT idPreserved=true createdAtPreserved=true updatedAtChanged=true lastValidationCleared=true rejectionNoteKept=true lastHistory=REJECTED->DRAFT
revalidate: valid=true; resubmit (separate call): status=PENDING_APPROVAL

===== 14. Audit events persisted in the isolated data directory =====
APPROVED WF-SYN-005 actor=admin@example.com at=2026-11-21T01:06:02.711Z
REJECTED WF-SYN-006 actor=admin@example.com at=2026-11-21T01:06:03.146Z reason="Synthetic demo: handoff details need revision"

Demo complete. No workflow was executed or published. Production fixtures were not modified.
```

Timestamps are generated at run time, so they differ between runs. The same sequence
can be reproduced manually with the commands in the tool, resource, prompt and Admin
CLI sections above.

## Architecture

```text
data/                         Synthetic JSON dataset (production fixtures)
src/domain/                   Entity types, lifecycle policy, results
src/repositories/             JSON file access, atomic writes, write serialisation
src/services/                 Validation, lifecycle and admin decision operations
src/server/tools/             MCP tool registration, schemas and result formatting
src/server/resources.ts       MCP resources + patient resource template (read-only)
src/server/prompts.ts         MCP prompt registration (instructions only)
src/client/smoke.ts           Real MCP client smoke script
src/admin/cli.ts              Separate human Admin CLI (parseArgs)
tests/repositories/           Data access and integrity tests
tests/admin/                  Admin CLI tests (isolated data directories)
tests/services/               Workflow lifecycle unit/integration tests
tests/resources-and-prompts.test.ts   Resources/prompts over real MCP stdio
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
npm run demo     # reproducible end-to-end demo (isolated temporary data)
npm run server   # run the MCP server over stdio (normally spawned by a client)
npm run admin -- list   # separate Admin CLI (see section above)
```

The stdio client spawns a separate server process with `process.execPath`, performs
the MCP `initialize` handshake, and closes the process in a `finally` block. Server
stdout is reserved for MCP protocol traffic; diagnostics go to stderr. The compiled
`dist/server/index.js` works the same way and can be launched from any working
directory because data paths are module-relative (or set via `MCP_DATA_DIR`).

## Security and known limitations

- All records (patients, appointments, lab-style results, workflows) and all integration
  systems are synthetic and fictional. No real healthcare system, hospital API, or
  external network service is connected; the source makes no network requests.
- The Admin CLI's `--actor` is a self-declared audit label, **not authentication or
  authorization**. Anyone who can run the CLI can choose any label. It is not a
  multi-user administration system and provides no identity verification or roles.
- The audit log is an append-style log implemented as read-all plus atomic JSON rewrite.
  It is **not** strict append-only storage, has no hash chain or tamper detection, and
  is not cryptographically secure or tamper-proof.
- There is no cross-process file locking. Writes are serialized only within one process,
  and a crash between the workflow-file write and the audit-file write can leave the two
  inconsistent. Atomic rename does not by itself guarantee full crash durability.
- Resource and prompt text is advisory only. Prompts instruct a connected AI assistant;
  they do not enforce tool permissions or guarantee downstream behavior. Resources are
  read-only and never modify data.
- There is no authentication, authorization, database, workflow execution engine, or
  publishing step. `APPROVED` records a human decision only; nothing is run or published.
- This project is a demonstration simulator. It makes no claims of production readiness
  or regulatory / HIPAA compliance.
