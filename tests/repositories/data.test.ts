import { describe, expect, test } from "vitest";
import type { Appointment, LabResult } from "../../src/domain/types.js";
import { listAppointments } from "../../src/repositories/appointment.repository.js";
import { readJsonArray } from "../../src/repositories/json-store.js";
import { listLabResults } from "../../src/repositories/lab-result.repository.js";
import { findPatientById } from "../../src/repositories/patient.repository.js";
import { findWorkflowById, listWorkflows } from "../../src/repositories/workflow.repository.js";

describe("synthetic dataset through the repository layer", () => {
  test("an existing patient can be retrieved", async () => {
    const patient = await findPatientById("PAT-SYN-001");
    expect(patient?.id).toBe("PAT-SYN-001");
    expect(patient?.display_name).toBe("Avery Cedarwood");
  });

  test("an unknown patient returns undefined rather than fabricated data", async () => {
    await expect(findPatientById("PAT-SYN-999")).resolves.toBeUndefined();
  });

  test("every appointment references an existing synthetic patient", async () => {
    const appointments = await readJsonArray<Appointment>("appointments.json");
    expect(appointments.length).toBeGreaterThanOrEqual(4);
    for (const appointment of appointments) {
      await expect(findPatientById(appointment.patient_id)).resolves.toBeDefined();
    }
  });

  test("every lab result references an existing synthetic patient", async () => {
    const results = await readJsonArray<LabResult>("lab-results.json");
    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const result of results) {
      await expect(findPatientById(result.patient_id)).resolves.toBeDefined();
    }
  });

  test("workflow lookup works and references valid synthetic records", async () => {
    const workflow = await findWorkflowById("WF-SYN-002");
    expect(workflow?.status).toBe("awaiting_review");
    const allLabs = await readJsonArray<LabResult>("lab-results.json");

    for (const candidate of await listWorkflows()) {
      await expect(findPatientById(candidate.patient_id)).resolves.toBeDefined();
      if (candidate.appointment_id) {
        expect((await listAppointments()).some(a => a.id === candidate.appointment_id)).toBe(true);
      }
      for (const id of candidate.lab_result_ids) {
        expect(allLabs.some(lab => lab.id === id)).toBe(true);
      }
    }
    await expect(findWorkflowById("WF-SYN-999")).resolves.toBeUndefined();
  });

  test("missing records produce empty lists", async () => {
    await expect(listAppointments({ patient_id: "PAT-SYN-999" })).resolves.toEqual([]);
    await expect(listLabResults("PAT-SYN-003")).resolves.toEqual([]);
    await expect(listWorkflows("completed")).resolves.toEqual([]);
  });

  test("filters narrow results without mutating the source files", async () => {
    const scheduled = await listAppointments({ status: "scheduled" });
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every(a => a.status === "scheduled")).toBe(true);
    expect((await listAppointments({ patient_id: "PAT-SYN-001" })).length).toBe(2);
    expect((await listWorkflows("draft")).length).toBe(2);
    expect((await readJsonArray("patients.json")).length).toBe(3);
  });

  test("missing and malformed data files produce useful errors without local paths", async () => {
    await expect(readJsonArray("does-not-exist.json")).rejects.toThrow(
      "Synthetic data file 'does-not-exist.json' is missing."
    );
    try {
      await readJsonArray("does-not-exist.json");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("/home/");
      expect(message).not.toContain("node_modules");
    }
  });
});
