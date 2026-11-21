# Synthetic demonstration dataset

Every record in this directory is **fictional and synthetic**. It was created solely
for demonstrating MCP tool calls and workflow lifecycle operations.

- There are no real patients, appointments, laboratory results, or workflow records.
- Names, identifiers, providers, locations, and values are invented.
- No real addresses, phone numbers, national identifiers, or other personal data
  are included.
- Lab-style values and reference ranges are illustrative demo values. They are not
  clinical results, diagnoses, or medical advice.
- Workflow records are static demonstration data. The simulator does not execute or
  publish workflows. Human approval/rejection is not available through MCP.

| File | Contents |
| --- | --- |
| `patients.json` | 3 synthetic patient records (`PAT-SYN-*`) |
| `appointments.json` | 5 synthetic appointments (`APT-SYN-*`), each referencing a synthetic patient |
| `lab-results.json` | 5 synthetic lab-style results (`LAB-SYN-*`), each referencing a synthetic patient |
| `workflows.json` | 4 synthetic workflows (`WF-SYN-*`), referencing synthetic patients and related records |

All timestamps use ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`). Dates of birth use ISO 8601
calendar dates (`YYYY-MM-DD`).

## Workflow lifecycle fixtures

The only workflow states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `REJECTED`.
The current fixtures cover `DRAFT` (WF-SYN-001 and WF-SYN-003), `PENDING_APPROVAL`
(WF-SYN-002), and `REJECTED` (WF-SYN-004). There is no `APPROVED` fixture. WF-SYN-003
is valid but has non-blocking warnings (no related records and only one step). The
`REJECTED` fixture carries a synthetic rejection note so the revision flow can be
demonstrated.

Before normalization the three original fixtures contained only `draft` (WF-SYN-001
and WF-SYN-003) and `awaiting_review` (WF-SYN-002). These became `DRAFT` and
`PENDING_APPROVAL` respectively; WF-SYN-003 was intentionally left in `DRAFT`. No
fixture used `completed`, so no fixture was mapped to `APPROVED`. That mapping applies
only to hypothetical legacy data and does not mean any workflow was executed. The old
lowercase values are no longer active workflow states.

Read-only tools never modify these files. Workflow lifecycle tools write only to the
active data directory, which tests point at an isolated temporary copy.

The Admin CLI writes its separate event log to `audit-events.json` in the same active
data directory. That file is created on first approval/rejection, is not a synthetic
fixture, and is ignored by Git. It is an append-style log implemented as read-all plus
atomic JSON rewrite, not strict append-only storage (see README for limitations).
