# Synthetic demonstration dataset

Every record in this directory is **fictional and synthetic**. It was created solely
for demonstrating MCP tool calls and integration workflows.

- There are no real patients, appointments, laboratory results, or workflow records.
- Names, identifiers, providers, locations, and values are invented.
- No real addresses, phone numbers, national identifiers, or other personal data
  are included.
- Lab-style values and reference ranges are illustrative demo values. They are not
  clinical results, diagnoses, or medical advice.
- Example workflows are static records only. Nothing is validated, submitted,
  approved, rejected, or executed.

| File | Contents |
| --- | --- |
| `patients.json` | 3 synthetic patient records (`PAT-SYN-*`) |
| `appointments.json` | 5 synthetic appointments (`APT-SYN-*`), each referencing a synthetic patient |
| `lab-results.json` | 5 synthetic lab-style results (`LAB-SYN-*`), each referencing a synthetic patient |
| `workflows.json` | 3 synthetic example workflows (`WF-SYN-*`), referencing synthetic patients and related records |

All timestamps use ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`). Dates of birth use ISO 8601
calendar dates (`YYYY-MM-DD`). These files are read-only at runtime; MCP tools never
modify them.
