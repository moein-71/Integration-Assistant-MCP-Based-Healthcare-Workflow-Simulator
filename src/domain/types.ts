import type { IntegrationSystem, WorkflowStatus, WorkflowTemplate } from "./workflow-policy.js";

export type { IntegrationSystem, WorkflowStatus, WorkflowTemplate } from "./workflow-policy.js";

export type PatientStatus = "active" | "inactive";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";
export type LabResultStatus = "final" | "preliminary";

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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  workflow_id: string;
}

export interface WorkflowHistoryEntry {
  from: WorkflowStatus | null;
  to: WorkflowStatus;
  at: string;
  note?: string;
}

export interface Workflow {
  id: string;
  name: string;
  patient_id: string;
  source_system: IntegrationSystem;
  destination_system: IntegrationSystem;
  template: WorkflowTemplate;
  steps: string[];
  appointment_ids: string[];
  lab_result_ids: string[];
  status: WorkflowStatus;
  description?: string;
  created_at: string;
  updated_at: string;
  last_validation?: ValidationResult;
  rejection_note?: string;
  history: WorkflowHistoryEntry[];
}

export interface PatientSummary {
  patient: Patient;
  appointments: Appointment[];
  lab_results: LabResult[];
  missing_information: string[];
  data_notice: string;
}
