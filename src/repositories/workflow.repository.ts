import type { Workflow, WorkflowStatus } from "../domain/types.js";
import { readJsonArray } from "./json-store.js";

export async function findWorkflowById(id: string): Promise<Workflow | undefined> {
  const workflows = await readJsonArray<Workflow>("workflows.json");
  return workflows.find(workflow => workflow.id === id);
}

export async function listWorkflows(status?: WorkflowStatus): Promise<Workflow[]> {
  const workflows = await readJsonArray<Workflow>("workflows.json");
  return status === undefined ? workflows : workflows.filter(workflow => workflow.status === status);
}
