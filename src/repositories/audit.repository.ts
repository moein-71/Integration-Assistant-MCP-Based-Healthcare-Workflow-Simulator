import type { AuditEvent } from "../domain/types.js";
import { dataFileExists, readJsonArray, writeJsonArray } from "./json-store.js";

/** Audit events live in their own file, separate from workflow fixtures. */
const AUDIT_FILE = "audit-events.json";

export async function listAuditEvents(): Promise<AuditEvent[]> {
  if (!(await dataFileExists(AUDIT_FILE))) {
    return [];
  }
  return readJsonArray<AuditEvent>(AUDIT_FILE);
}

export async function listAuditEventsForWorkflow(workflowId: string): Promise<AuditEvent[]> {
  const events = await listAuditEvents();
  return events.filter(event => event.workflow_id === workflowId);
}

/** Logical append: read existing events and rewrite the file atomically. */
export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  const events = await listAuditEvents();
  await writeJsonArray(AUDIT_FILE, [...events, event]);
}
