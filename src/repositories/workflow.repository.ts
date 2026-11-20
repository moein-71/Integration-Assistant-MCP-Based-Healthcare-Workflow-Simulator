import type { Workflow, WorkflowStatus } from "../domain/types.js";
import { DataStoreError, readJsonArray, writeJsonArray } from "./json-store.js";

const WORKFLOW_FILE = "workflows.json";

export async function findWorkflowById(id: string): Promise<Workflow | undefined> {
  const workflows = await readJsonArray<Workflow>(WORKFLOW_FILE);
  return workflows.find(workflow => workflow.id === id);
}

export async function listWorkflows(status?: WorkflowStatus): Promise<Workflow[]> {
  const workflows = await readJsonArray<Workflow>(WORKFLOW_FILE);
  return status === undefined ? workflows : workflows.filter(workflow => workflow.status === status);
}

/** Generates the next WF-SYN-NNN identifier without reusing existing ones. */
export function nextWorkflowId(workflows: Workflow[]): string {
  const highest = workflows.reduce((current, workflow) => {
    const match = /^WF-SYN-(\d+)$/.exec(workflow.id ?? "");
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `WF-SYN-${String(highest + 1).padStart(3, "0")}`;
}

// Serializes read-modify-write operations inside one server process.
let writeQueue: Promise<unknown> = Promise.resolve();
export function withWorkflowWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function insertWorkflow(workflow: Workflow): Promise<void> {
  const workflows = await readJsonArray<Workflow>(WORKFLOW_FILE);
  if (workflows.some(existing => existing.id === workflow.id)) {
    throw new DataStoreError(`Workflow '${workflow.id}' already exists.`);
  }
  await writeJsonArray(WORKFLOW_FILE, [...workflows, workflow]);
}

export async function replaceWorkflow(workflow: Workflow): Promise<void> {
  const workflows = await readJsonArray<Workflow>(WORKFLOW_FILE);
  const index = workflows.findIndex(existing => existing.id === workflow.id);
  if (index === -1) {
    throw new DataStoreError(`Workflow '${workflow.id}' no longer exists.`);
  }
  workflows[index] = workflow;
  await writeJsonArray(WORKFLOW_FILE, workflows);
}
