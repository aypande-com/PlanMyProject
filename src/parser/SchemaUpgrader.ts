import { duplicatePlanDocument, recomputeDerivedStatuses, type PlanDocument } from "../model/index";

export interface MigrationResult {
  upgraded: PlanDocument;
  changed: boolean;
  migrationNotes: string[];
}

export function upgradeSchemaV1ToV2(plan: PlanDocument): MigrationResult {
  const upgraded = duplicatePlanDocument(plan);
  const notes: string[] = [];

  if (upgraded.schemaVersion === "v2") {
    return {
      upgraded,
      changed: false,
      migrationNotes: []
    };
  }

  upgraded.schemaVersion = "v2";
  notes.push("Updated schema marker from v1 to v2.");

  for (const task of Object.values(upgraded.tasks)) {
    task.type = "implementation";
    task.origin = "manual";
    task.confidence = null;
    task.dependsOn = [];
    task.goalRef = task.goalRef ?? null;
    task.linkedFiles = task.linkedFiles ?? [];
    task.fileSendPolicy = task.fileSendPolicy ?? "global";
    task.createdAt = task.createdAt || new Date().toISOString();
  }

  if (upgraded.goals.length === 0) {
    notes.push("No goals were found. Prompt user to run Set Project Goal.");
  }

  recomputeDerivedStatuses(upgraded);

  return {
    upgraded,
    changed: true,
    migrationNotes: notes
  };
}
