import { found, notFound, type Lookup } from "../domain/lookup.js";
import type { Patient, PatientSummary } from "../domain/types.js";
import { listAppointments } from "../repositories/appointment.repository.js";
import { listLabResults } from "../repositories/lab-result.repository.js";
import { findPatientById } from "../repositories/patient.repository.js";

const DATA_NOTICE = "Synthetic demonstration data only. No clinical interpretation is provided.";

export async function getPatient(id: string): Promise<Lookup<Patient>> {
  const patient = await findPatientById(id);
  return patient ? found(patient) : notFound("Patient", id);
}

export async function getPatientSummary(id: string): Promise<Lookup<PatientSummary>> {
  const patient = await findPatientById(id);
  if (!patient) {
    return notFound("Patient", id);
  }

  const [appointments, lab_results] = await Promise.all([
    listAppointments({ patient_id: id }),
    listLabResults(id)
  ]);
  appointments.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const missing_information: string[] = [];
  if (appointments.length === 0) {
    missing_information.push("No appointments are recorded for this synthetic patient.");
  }
  if (lab_results.length === 0) {
    missing_information.push("No lab results are recorded for this synthetic patient.");
  }

  return found({
    patient,
    appointments,
    lab_results,
    missing_information,
    data_notice: DATA_NOTICE
  });
}
