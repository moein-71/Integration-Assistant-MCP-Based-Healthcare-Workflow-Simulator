import { found, notFound, type Lookup } from "../domain/lookup.js";
import type { Workflow, WorkflowStatus } from "../domain/types.js";
import { findWorkflowById, listWorkflows as listFromRepository } from "../repositories/workflow.repository.js";

export async function getWorkflow(id: string): Promise<Lookup<Workflow>> {
  const workflow = await findWorkflowById(id);
  return workflow ? found(workflow) : notFound("Workflow", id);
}

export async function listWorkflows(status?: WorkflowStatus): Promise<Workflow[]> {
  return listFromRepository(status);
}
