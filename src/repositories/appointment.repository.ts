import type { Appointment, AppointmentStatus } from "../domain/types.js";
import { readJsonArray } from "./json-store.js";

export interface AppointmentFilter {
  patient_id?: string;
  status?: AppointmentStatus;
}

export async function listAppointments(filter: AppointmentFilter = {}): Promise<Appointment[]> {
  const appointments = await readJsonArray<Appointment>("appointments.json");
  return appointments.filter(
    appointment =>
      (filter.patient_id === undefined || appointment.patient_id === filter.patient_id) &&
      (filter.status === undefined || appointment.status === filter.status)
  );
}

export async function findAppointmentById(id: string): Promise<Appointment | undefined> {
  const appointments = await readJsonArray<Appointment>("appointments.json");
  return appointments.find(appointment => appointment.id === id);
}
