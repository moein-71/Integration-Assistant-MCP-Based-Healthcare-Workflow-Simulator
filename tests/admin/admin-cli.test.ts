import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AuditEvent, Workflow, WorkflowStatus } from "../../src/domain/types.js";
import { createIsolatedDataDir, dataOf, readDataFile, withClient, writeDataFile } from "../support/mcp-client.js";

const CLI_ENTRY = fileURLToPath(new URL("../../src/admin/cli.ts", import.meta.url));
const ACTOR = "admin@example.com";

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(dataDir: string, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      env: { ...process.env, MCP_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += String(chunk)));
    child.stderr.on("data", chunk => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function storedWorkflows(dataDir: string): Promise<Workflow[]> {
  return JSON.parse(await readDataFile(dataDir, "workflows.json")) as Workflow[];
}

async function storedAuditEvents(dataDir: string): Promise<AuditEvent[]> {
  try {
    return JSON.parse(await readDataFile(dataDir, "audit-events.json")) as AuditEvent[];
  } catch {
    return [];
  }
}

async function setStatus(dataDir: string, id: string, status: WorkflowStatus): Promise<void> {
  const workflows = await storedWorkflows(dataDir);
  const workflow = workflows.find(candidate => candidate.id === id);
  if (!workflow) throw new Error(`Missing fixture ${id}`);
  workflow.status = status;
  await writeDataFile(dataDir, "workflows.json", JSON.stringify(workflows, null, 2));
}

let dataDir: string;
beforeEach(async () => {
  dataDir = await createIsolatedDataDir();
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("Admin CLI read commands", () => {
  test("list shows only workflows awaiting approval", async () => {
    const result = await runCli(dataDir, ["list"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("WF-SYN-002");
    expect(result.stdout).not.toContain("WF-SYN-001");
    expect(result.stdout).not.toContain("WF-SYN-004");
  });

  test("inspect shows status, validation and history", async () => {
    const result = await runCli(dataDir, ["inspect", "WF-SYN-002"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("PENDING_APPROVAL");
    expect(result.stdout).toContain("validation:");
    expect(result.stdout).toContain("history:");
    expect(result.stdout).toContain("WF-SYN-002");
  });

  test("inspect unknown ID fails with a useful error", async () => {
    const result = await runCli(dataDir, ["inspect", "WF-SYN-999"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });
});

describe("Admin CLI decisions", () => {
  test("approve PENDING_APPROVAL -> APPROVED with audit event", async () => {
    const result = await runCli(dataDir, ["approve", "WF-SYN-002", "--actor", ACTOR]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("APPROVED workflow WF-SYN-002");

    const workflow = (await storedWorkflows(dataDir)).find(item => item.id === "WF-SYN-002")!;
    expect(workflow.status).toBe("APPROVED");
    expect(workflow.history.at(-1)).toMatchObject({ from: "PENDING_APPROVAL", to: "APPROVED" });

    const events = await storedAuditEvents(dataDir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ workflow_id: "WF-SYN-002", action: "APPROVED", actor: ACTOR });
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events[0].reason).toBeUndefined();
  });

  test("reject PENDING_APPROVAL -> REJECTED with reason and audit event", async () => {
    const reason = "Missing integration details";
    const result = await runCli(dataDir, ["reject", "WF-SYN-002", "--actor", ACTOR, "--reason", reason]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("REJECTED workflow WF-SYN-002");

    const workflow = (await storedWorkflows(dataDir)).find(item => item.id === "WF-SYN-002")!;
    expect(workflow.status).toBe("REJECTED");
    expect(workflow.rejection_note).toBe(reason);

    const events = await storedAuditEvents(dataDir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "REJECTED", actor: ACTOR, reason });
  });

  test("decision persists for later CLI processes", async () => {
    await runCli(dataDir, ["approve", "WF-SYN-002", "--actor", ACTOR]);
    const inspect = await runCli(dataDir, ["inspect", "WF-SYN-002"]);
    expect(inspect.code).toBe(0);
    expect(inspect.stdout).toContain("status: APPROVED");
    expect(inspect.stdout).toContain(`Approved by ${ACTOR}`);
  });

  test("audit events survive a process restart and appear in inspect", async () => {
    await runCli(dataDir, [
      "reject",
      "WF-SYN-002",
      "--actor",
      ACTOR,
      "--reason",
      "Synthetic demo audit reason"
    ]);
    const inspect = await runCli(dataDir, ["inspect", "WF-SYN-002"]);
    expect(inspect.code).toBe(0);
    expect(inspect.stdout).toContain("audit events:");
    expect(inspect.stdout).toContain(`REJECTED by ${ACTOR}`);
    expect(inspect.stdout).toContain("reason: Synthetic demo audit reason");
    expect(await storedAuditEvents(dataDir)).toHaveLength(1);
  });

  test("audit events append across multiple decisions", async () => {
    await setStatus(dataDir, "WF-SYN-001", "PENDING_APPROVAL");
    expect((await runCli(dataDir, ["approve", "WF-SYN-002", "--actor", ACTOR])).code).toBe(0);
    expect((await runCli(dataDir, ["reject", "WF-SYN-001", "--actor", ACTOR, "--reason", "Demo reason"])).code).toBe(0);

    const events = await storedAuditEvents(dataDir);
    expect(events.map(event => event.action)).toEqual(["APPROVED", "REJECTED"]);
    expect(events.map(event => event.workflow_id)).toEqual(["WF-SYN-002", "WF-SYN-001"]);
  });
});

describe("Admin CLI validation and state rules", () => {
  test("reject requires a non-empty reason", async () => {
    const before = await readDataFile(dataDir, "workflows.json");
    for (const reason of [undefined, "   "]) {
      const args = ["reject", "WF-SYN-002", "--actor", ACTOR];
      if (reason !== undefined) args.push("--reason", reason);
      const result = await runCli(dataDir, args);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("--reason");
    }
    expect(await readDataFile(dataDir, "workflows.json")).toBe(before);
    expect(await storedAuditEvents(dataDir)).toEqual([]);
  });

  test("approve and reject require an actor", async () => {
    const before = await readDataFile(dataDir, "workflows.json");
    const approve = await runCli(dataDir, ["approve", "WF-SYN-002", "--actor", "  "]);
    const reject = await runCli(dataDir, ["reject", "WF-SYN-002", "--reason", "Demo reason"]);
    expect(approve.code).not.toBe(0);
    expect(reject.code).not.toBe(0);
    expect(approve.stderr + reject.stderr).toContain("--actor");
    expect(await readDataFile(dataDir, "workflows.json")).toBe(before);
    expect(await storedAuditEvents(dataDir)).toEqual([]);
  });

  test.each([
    ["approve a DRAFT", "approve", "WF-SYN-001"],
    ["approve a REJECTED workflow", "approve", "WF-SYN-004"],
    ["reject a DRAFT", "reject", "WF-SYN-001"],
    ["reject a REJECTED workflow", "reject", "WF-SYN-004"]
  ])("rejects %s", async (_label, command, id) => {
    const before = await readDataFile(dataDir, "workflows.json");
    const args = [command!, id!, "--actor", ACTOR];
    if (command === "reject") args.push("--reason", "Demo reason");
    const result = await runCli(dataDir, args);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("only PENDING_APPROVAL workflows");
    expect(await readDataFile(dataDir, "workflows.json")).toBe(before);
    expect(await storedAuditEvents(dataDir)).toEqual([]);
  });

  test.each([
    ["approve an APPROVED workflow", "approve"],
    ["reject an APPROVED workflow", "reject"]
  ])("rejects %s", async (_label, command) => {
    await setStatus(dataDir, "WF-SYN-002", "APPROVED");
    const args = [command!, "WF-SYN-002", "--actor", ACTOR];
    if (command === "reject") args.push("--reason", "Demo reason");
    const result = await runCli(dataDir, args);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("only PENDING_APPROVAL workflows");
  });

  test("invalid command and unknown option fail clearly", async () => {
    const unknownCommand = await runCli(dataDir, ["publish", "WF-SYN-002"]);
    const unknownOption = await runCli(dataDir, ["approve", "WF-SYN-002", "--unknown", "x"]);
    expect(unknownCommand.code).not.toBe(0);
    expect(unknownOption.code).not.toBe(0);
    expect(unknownCommand.stderr).toContain("Unknown command");
    expect(unknownOption.stderr).not.toBe("");
  });
});

test("MCP is unaffected by admin decisions and still exposes exactly 10 tools", async () => {
  const result = await runCli(dataDir, ["approve", "WF-SYN-002", "--actor", ACTOR]);
  expect(result.code).toBe(0);

  await withClient(
    async client => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(10);
      expect(tools.some(tool => /approve|reject|publish|execute/i.test(tool.name))).toBe(false);
      const fetched = await client.callTool({ name: "get_workflow", arguments: { workflow_id: "WF-SYN-002" } });
      expect(dataOf<Workflow>(fetched).status).toBe("APPROVED");
    },
    { reuseDataDir: dataDir }
  );
}, 60_000);
