export type PatientStatus = "active" | "inactive";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";
export type LabResultStatus = "final" | "preliminary";
export type WorkflowStatus = "draft" | "awaiting_review" | "completed";

export interface Patient {
  id: string;
  display_name: string;
  date_of_birth: string;
  status: PatientStatus;
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  reason: string;
  provider_name: string;
  location_label: string;
}

export interface LabResult {
  id: string;
  patient_id: string;
  test_name: string;
  result_value: number;
  unit: string;
  reference_range?: string;
  status: LabResultStatus;
  collected_at?: string;
  reported_at: string;
  note?: string;
}

export interface Workflow {
  id: string;
  patient_id: string;
  appointment_id?: string;
  lab_result_ids: string[];
  status: WorkflowStatus;
  title: string;
  description?: string;
  steps: string[];
  created_at: string;
  updated_at: string;
}

export interface PatientSummary {
  patient: Patient;
  appointments: Appointment[];
  lab_results: LabResult[];
  missing_information: string[];
  data_notice: string;
}
