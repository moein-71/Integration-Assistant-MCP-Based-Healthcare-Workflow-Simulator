import type { Patient } from "../domain/types.js";
import { readJsonArray } from "./json-store.js";

export async function findPatientById(id: string): Promise<Patient | undefined> {
  const patients = await readJsonArray<Patient>("patients.json");
  return patients.find(patient => patient.id === id);
}
