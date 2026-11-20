# Integration Assistant — MCP-Based Healthcare Workflow Simulator

A TypeScript foundation for an MCP server that will eventually simulate healthcare
integration workflows (patient intake, lab orders, referrals).

## Current status (Stage 1)

Implemented:

- A minimal MCP server (`integration-assistant`, version `0.1.0`) using the official
  `@modelcontextprotocol/sdk` with `StdioServerTransport`.
- A real MCP client smoke script that spawns the server as a child process and sends
  a protocol-level `ping` request.
- A Vitest smoke test that performs the same real client/server stdio exchange.

**Not implemented yet:** patient data, appointment data, lab results, any MCP tools,
workflow logic or approvals, MCP resources/prompts, authentication, or external
healthcare integrations. This repository currently contains infrastructure only.

## Prerequisites

- Node.js >= 18 (the MCP SDK v1 requirement; verified on Node 26)
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
| `zod` | Required peer dependency of the SDK for schema validation |
| `typescript` | Local compiler for build/typecheck |
| `tsx` | Runs TypeScript sources directly (server, smoke client, tests) |
| `vitest` | Test runner for the smoke test |
| `@types/node` | Node.js type declarations |

## Commands

```bash
npm run typecheck   # strict TypeScript check (no emit)
npm run build       # compile src/ to dist/
npm test            # run the stdio smoke test with Vitest
npm run smoke       # run the standalone client smoke script
npm run server      # run the MCP server directly over stdio (usually spawned by a client)
```

## How the stdio connection works

`StdioClientTransport` spawns a **separate Node.js process** for the server using
`process.execPath` and connects to its stdin/stdout. The client performs the MCP
`initialize` handshake and then sends a real `ping` request; the SDK answers it
automatically. The server keeps stdout exclusively for MCP JSON-RPC messages —
diagnostic output, if any, goes to stderr. Both client paths resolve the server
entry point relative to their own module URL, so they work from any working
directory and with either TypeScript source or compiled JavaScript.

The test asserts the spawned process has a PID, confirming there are no mocks or
direct function calls standing in for the MCP transport.
