# Integration Assistant — MCP-Based Healthcare Workflow Simulator

A TypeScript MCP server that demonstrates read-only access to **synthetic**
healthcare integration data over stdio.

## Current status (Stage 2)

Implemented:

- A minimal MCP server (`integration-assistant`, version `0.2.0`) using the official
  `@modelcontextprotocol/sdk` with `StdioServerTransport`.
- A small synthetic dataset in local JSON files, accessed through a simple
  repository layer.
- **Exactly six read-only MCP tools** (listed below).
- A real MCP client smoke script and Vitest tests that exercise the server through
  real stdio client/server communication.

**All tools are read-only.** They only read JSON files and never modify them.

**Not implemented yet:** workflow creation, drafts, validation, submission,
approval, rejection, revision, workflow execution/publishing, any other write
operations, MCP resources or prompts, authentication/authorization, databases, or
external healthcare APIs. No patient/appointment/lab data is written by this server.

## Architecture

```text
data/                          Synthetic JSON dataset (read-only at runtime)
  patients.json                3 patients
  appointments.json            5 appointments
  lab-results.json             5 lab-style results
  workflows.json               3 example workflows
  README.md                    Synthetic-data declaration

src/domain/                    Explicit entity types and lookup result type
src/repositories/              JSON file access only (no MCP code)
src/services/                  Composition of patient/appointment/lab/workflow data
src/server/                    MCP wiring
  index.ts                     Server, stdio transport, tool registration
  tools/                       Tool schemas, descriptions and result formatting
src/client/smoke.ts            Real MCP client smoke script

tests/repositories/            Data access and referential-integrity tests
tests/smoke/                   Real MCP stdio tests (tools and ping)
tests/support/                 Test client helper
```

Repositories resolve `data/` relative to their own module URL, so the server works
from any current working directory and from both TypeScript source and the compiled
`dist/` output. Missing files and malformed JSON produce clear errors that do not
expose local filesystem paths. Unknown identifiers return explicit not-found results;
no records are ever fabricated.

## Synthetic data disclaimer

All names, IDs, providers, locations, values, and timestamps are **fictional** and
exist only for demonstration. There is no real patient information, no real personal
identifiers, and no clinical advice or diagnosis. Lab-style values are illustrative
only. See `data/README.md`.

## Available tools (all read-only)

| Tool | Input | Returns |
| --- | --- | --- |
| `get_patient` | `patient_id` (required string) | One synthetic patient record, or a not-found error |
| `get_patient_summary` | `patient_id` (required string) | Patient with recorded appointments, lab-style results, and an explicit `missing_information` list |
| `list_appointments` | `patient_id` (optional string), `status` (optional: `scheduled` / `completed` / `cancelled`) | JSON array of matching appointments; empty array if none |
| `get_lab_results` | `patient_id` (required string) | JSON array of lab-style result details; empty array if none |
| `get_workflow` | `workflow_id` (required string) | One static example workflow, or a not-found error |
| `list_workflows` | `status` (optional: `draft` / `awaiting_review` / `completed`) | JSON array of matching example workflows; empty array if none |

Tool results are JSON text with a `notice` field (synthetic-data disclaimer) and a
`data` field. Domain errors use the MCP `isError: true` convention with a readable
message. Input validation is performed by the SDK from the registered Zod schemas.

There is intentionally **no `list_patients` tool** and no write tool.

## Prerequisites

- Node.js >= 18 (verified on Node 26)
- npm
- No global TypeScript installation is required.

## Installation

```bash
npm install
```

Dependencies are pinned exactly in `package.json` and `package-lock.json`.

| Package | Role |
| --- | --- |
| `@modelcontextprotocol/sdk` | Official MCP server/client SDK (v1 line) |
| `zod` | Required peer dependency; tool input schemas |
| `typescript` | Local compiler for build/typecheck |
| `tsx` | Runs TypeScript sources directly (server, smoke client, tests) |
| `vitest` | Test runner |
| `@types/node` | Node.js type declarations |

## Commands

```bash
npm run typecheck   # strict TypeScript check (no emit)
npm run build       # compile src/ to dist/
npm test            # repository tests + real MCP stdio tests
npm run smoke       # standalone client smoke script (initialize + ping)
npm run server      # run the MCP server directly over stdio (usually spawned by a client)
```

## How the stdio connection works

`StdioClientTransport` spawns a separate Node.js process for the server using
`process.execPath` and communicates over its stdin/stdout with MCP JSON-RPC. The client
performs the MCP `initialize` handshake, lists or calls tools, and closes the process
in a `finally` block. The server reserves stdout exclusively for MCP protocol
messages; diagnostics go to stderr. Entry points are resolved relative to module URLs,
so no particular working directory is assumed.
