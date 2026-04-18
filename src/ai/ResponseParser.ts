import type { GeneratedTaskDraft } from "./types";
import type { TaskType } from "../model/index";
import { normalizeWorkspaceRelativePath } from "../util";

export interface GeneratedTaskSet {
  tasks: GeneratedTaskDraft[];
}

export interface ImplementationChange {
  path: string;
  content: string;
}

export interface ImplementationResponse {
  summary: string;
  taskCompleted: boolean;
  changes: ImplementationChange[];
  tests: string[];
  risks: string[];
  researchUsed: string[];
}

const VALID_TYPES = new Set<TaskType>(["research", "implementation", "decision", "milestone"]);

export function parseTaskGenerationResponse(rawText: string): GeneratedTaskSet {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new Error("AI response did not contain a JSON object.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI task response is invalid JSON.");
  }

  const tasksRaw = (parsed as Record<string, unknown>).tasks;
  if (!Array.isArray(tasksRaw)) {
    throw new Error("AI task response must include a 'tasks' array.");
  }

  const tasks: GeneratedTaskDraft[] = [];
  for (const item of tasksRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const type = typeof entry.type === "string" ? entry.type : "implementation";
    if (!title || !VALID_TYPES.has(type as TaskType)) {
      continue;
    }

    const confidence = normalizeConfidence(entry.confidence);
    const dependsOnTitles = toStringArray(entry.dependsOnTitles);
    const linkedFiles = toStringArray(entry.linkedFiles)
      .map((value) => normalizeWorkspaceRelativePath(value))
      .filter((value): value is string => Boolean(value));

    tasks.push({
      title,
      type: type as TaskType,
      rationale: typeof entry.rationale === "string" ? entry.rationale.trim() : "",
      goalCriterionIndex: Number.isFinite(Number(entry.goalCriterionIndex)) ? Number(entry.goalCriterionIndex) : 0,
      confidence,
      dependsOnTitles,
      linkedFiles
    });
  }

  if (tasks.length === 0) {
    throw new Error("No valid tasks were found in AI response.");
  }

  return { tasks };
}

export function parseImplementationResponse(rawText: string): ImplementationResponse {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new Error("Implementation response did not include JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Implementation response JSON is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Implementation response must be an object.");
  }

  const obj = parsed as Record<string, unknown>;
  const changesRaw = Array.isArray(obj.changes) ? obj.changes : [];
  const changes: ImplementationChange[] = [];

  for (const item of changesRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const path = typeof entry.path === "string" ? normalizeWorkspaceRelativePath(entry.path) : undefined;
    const content = typeof entry.content === "string" ? entry.content : "";
    if (!path || !content) {
      continue;
    }
    changes.push({ path, content: content.replace(/\r\n/g, "\n") });
  }

  if (changes.length === 0) {
    throw new Error("No valid implementation changes were found.");
  }

  return {
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
    taskCompleted: typeof obj.taskCompleted === "boolean" ? obj.taskCompleted : false,
    changes,
    tests: toStringArray(obj.tests),
    risks: toStringArray(obj.risks),
    researchUsed: toStringArray(obj.researchUsed)
  };
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, numeric));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractJsonObject(text: string): string | undefined {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = fenceRegex.exec(text);
  while (match) {
    const candidate = findFirstJsonObject(match[1]);
    if (candidate) {
      return candidate;
    }
    match = fenceRegex.exec(text);
  }

  return findFirstJsonObject(text);
}

function findFirstJsonObject(text: string): string | undefined {
  const source = text.trim();
  if (!source) {
    return undefined;
  }

  for (let start = source.indexOf("{"); start >= 0; start = source.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i += 1) {
      const char = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = source.slice(start, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
  }

  return undefined;
}
