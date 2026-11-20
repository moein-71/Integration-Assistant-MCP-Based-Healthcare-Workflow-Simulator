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
The fixtures cover `DRAFT` (including one that is invalid for submission warnings),
`PENDING_APPROVAL`, and `REJECTED`. The `REJECTED` fixture carries a synthetic
rejection note so the revision flow can be demonstrated.

Earlier fixture statuses were normalized as follows: `draft` → `DRAFT`,
`awaiting_review` → `PENDING_APPROVAL`, and `completed` → `APPROVED` (fixture
migration only; it does not mean any workflow was executed). The old values are no
longer used as active workflow states.

Read-only tools never modify these files. Workflow lifecycle tools write only to the
active data directory, which tests point at an isolated temporary copy.
