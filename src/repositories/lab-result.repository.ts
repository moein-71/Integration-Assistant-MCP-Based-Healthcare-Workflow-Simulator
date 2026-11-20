import type { LabResult } from "../domain/types.js";
import { readJsonArray } from "./json-store.js";

export async function listLabResults(patientId: string): Promise<LabResult[]> {
  const results = await readJsonArray<LabResult>("lab-results.json");
  return results.filter(result => result.patient_id === patientId);
}
