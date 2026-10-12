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

export interface ParseTaskGenerationOptions {
  // P4-D1: PromptBuilder tells the AI "every task must reference which goal
  // criterion it serves" via goalCriterionIndex, but nothing checked the
  // returned index was actually within the real goal's successCriteria
  // array - any finite number passed through unchecked. When provided, an
  // out-of-range index (including when the goal has no criteria, or none
  // was resolved at all) downgrades confidence by 0.2 rather than rejecting
  // the draft outright - it is usually a minor miscount, not a sign the rest
  // of the task is wrong, and the existing confidence-threshold review flow
  // already exists to catch exactly this kind of uncertainty.
  goalCriteriaCount?: number;
}

export function parseTaskGenerationResponse(rawText: string, options?: ParseTaskGenerationOptions): GeneratedTaskSet {
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

    let confidence = normalizeConfidence(entry.confidence);
    const dependsOnTitles = toStringArray(entry.dependsOnTitles);
    const linkedFiles = toStringArray(entry.linkedFiles)
      .map((value) => normalizeWorkspaceRelativePath(value))
      .filter((value): value is string => Boolean(value));

    const goalCriterionIndex = Number.isFinite(Number(entry.goalCriterionIndex)) ? Number(entry.goalCriterionIndex) : 0;
    if (options?.goalCriteriaCount !== undefined) {
      const isValidIndex = Number.isInteger(goalCriterionIndex) && goalCriterionIndex >= 0 && goalCriterionIndex < options.goalCriteriaCount;
      if (!isValidIndex) {
        confidence = Math.max(0, confidence - 0.2);
      }
    }

    tasks.push({
      title,
      type: type as TaskType,
      rationale: typeof entry.rationale === "string" ? entry.rationale.trim() : "",
      goalCriterionIndex,
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

// ---------------------------------------------------------------------------
// Goal wording review (spelling fixes + vague-requirement flags)
// ---------------------------------------------------------------------------

export interface WordingNote {
  phrase: string;
  reason: string;
  suggestion: string;
}

export interface WordingReviewItem {
  corrected: string;
  notes: WordingNote[];
}

export interface WordingReviewInput {
  statement: string;
  successCriteria: string[];
  constraints: string[];
  outOfScope: string[];
}

export interface WordingReviewResult {
  statement: WordingReviewItem;
  successCriteria: WordingReviewItem[];
  constraints: WordingReviewItem[];
  outOfScope: WordingReviewItem[];
}

// The AI's output here only ever drives an optional, user-approved edit (see
// GoalCommandService.reviewGoalWording) - it never replaces the user's text
// on its own. So on anything unparseable or shape-mismatched, this falls
// back to the original wording verbatim rather than guessing: losing a
// correction is harmless, silently losing or reordering the user's own
// words is not.
export function parseWordingReviewResponse(rawText: string, input: WordingReviewInput): WordingReviewResult {
  const fallback: WordingReviewResult = {
    statement: { corrected: input.statement, notes: [] },
    successCriteria: input.successCriteria.map((text) => ({ corrected: text, notes: [] })),
    constraints: input.constraints.map((text) => ({ corrected: text, notes: [] })),
    outOfScope: input.outOfScope.map((text) => ({ corrected: text, notes: [] }))
  };

  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return fallback;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }

  const obj = parsed as Record<string, unknown>;
  return {
    statement: normalizeWordingItem(obj.statement, input.statement),
    successCriteria: normalizeWordingItemArray(obj.successCriteria, input.successCriteria),
    constraints: normalizeWordingItemArray(obj.constraints, input.constraints),
    outOfScope: normalizeWordingItemArray(obj.outOfScope, input.outOfScope)
  };
}

function normalizeWordingItem(value: unknown, original: string): WordingReviewItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { corrected: original, notes: [] };
  }
  const entry = value as Record<string, unknown>;
  const corrected = typeof entry.corrected === "string" && entry.corrected.trim().length > 0
    ? entry.corrected.trim()
    : original;
  return { corrected, notes: normalizeWordingNotes(entry.notes) };
}

function normalizeWordingItemArray(value: unknown, originals: string[]): WordingReviewItem[] {
  // A length mismatch means the response can't be reliably paired line-by-
  // line with the input - treat it as unusable rather than risk attaching a
  // correction to the wrong criterion.
  if (!Array.isArray(value) || value.length !== originals.length) {
    return originals.map((text) => ({ corrected: text, notes: [] }));
  }
  return originals.map((original, index) => normalizeWordingItem(value[index], original));
}

function normalizeWordingNotes(value: unknown): WordingNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const notes: WordingNote[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const phrase = typeof entry.phrase === "string" ? entry.phrase.trim() : "";
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!phrase || !reason) {
      continue;
    }
    const suggestion = typeof entry.suggestion === "string" ? entry.suggestion.trim() : "";
    notes.push({ phrase, reason, suggestion });
  }
  return notes;
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

export function extractJsonObject(text: string): string | undefined {
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
