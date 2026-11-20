import { found, notFound, type Lookup } from "../domain/lookup.js";
import type { LabResult } from "../domain/types.js";
import { listLabResults } from "../repositories/lab-result.repository.js";
import { findPatientById } from "../repositories/patient.repository.js";

export async function getLabResults(patientId: string): Promise<Lookup<LabResult[]>> {
  const patient = await findPatientById(patientId);
  if (!patient) {
    return notFound("Patient", patientId);
  }
  return found(await listLabResults(patientId));
}
