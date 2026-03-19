import {
  addTask,
  createEmptyPlanDocument,
  createTaskNode,
  duplicatePlanDocument,
  recomputeDerivedStatuses,
  type PlanDocument,
  type ProjectGoal,
  type TaskNode,
  type TaskType,
  TASK_TYPE_ICONS,
  normalizeTaskTitle,
  normalizeTaskStatusSymbol,
  taskStatusToSymbol
} from "../model/index";
import { buildExecutionQueue } from "../queue/QueueBuilder";

const PLAN_TREE_HEADING_RE = /^##\s+Plan Tree\s*$/i;
const GOALS_HEADING_RE = /^##\s+Goals\s*$/i;
const QUEUE_HEADING_RE = /^##\s+Execution Queue\b/i;
const TASK_LINE_RE = /^(\s*)- \[( |\/|x|X)\] \[([A-Za-z0-9_-]+)\]\s+(?:[🔍⚙️⚖️🏁]\s*)*(.+?)\s*$/;
const GOAL_LINE_RE = /^\s*-\s+\[(G\d+)\]\s+(.+?)\s*$/;
const GOAL_HEADER_COMMENT_RE = /^<!--\s*pmp:goal:id=([^;]+);statement=(.+?)(?:;scanned=(.+?))?\s*-->$/;

export interface ParseResult {
  plan: PlanDocument;
  schemaVersion: "v1" | "v2";
  planHeadingLine: number;
  queueHeadingLine: number;
  hasGoal: boolean;
  debateConflicts: string[];
}

export interface SerializeOptions {
  researchGate: boolean;
  showRationaleInline: boolean;
}

const DEFAULT_SERIALIZE_OPTIONS: SerializeOptions = {
  researchGate: true,
  showRationaleInline: true
};

export function parsePlanMarkdown(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const planHeadingLine = lines.findIndex((line) => PLAN_TREE_HEADING_RE.test(line.trim()));
  const queueHeadingLine = lines.findIndex((line) => QUEUE_HEADING_RE.test(line.trim()));
  const goalsHeadingLine = lines.findIndex((line) => GOALS_HEADING_RE.test(line.trim()));
  const schemaVersion = detectSchemaVersion(lines);

  const plan = createEmptyPlanDocument();
  plan.schemaVersion = schemaVersion;

  const debateConflicts: string[] = [];
  parseGoals(lines, plan, goalsHeadingLine, planHeadingLine);

  const start = planHeadingLine >= 0 ? planHeadingLine + 1 : 0;
  const end = queueHeadingLine > start ? queueHeadingLine : lines.length;
  parseTasks(lines, start, end, plan, debateConflicts, schemaVersion);
  recomputeDerivedStatuses(plan);

  return {
    plan,
    schemaVersion,
    planHeadingLine,
    queueHeadingLine,
    hasGoal: plan.goals.length > 0,
    debateConflicts
  };
}

export function serializePlanMarkdown(plan: PlanDocument, options?: Partial<SerializeOptions>): string {
  const resolved = { ...DEFAULT_SERIALIZE_OPTIONS, ...options };
  const nextPlan = duplicatePlanDocument(plan);
  nextPlan.schemaVersion = "v2";
  recomputeDerivedStatuses(nextPlan);

  const lines: string[] = [];
  lines.push("# Project Plan");
  lines.push("");
  lines.push("<!-- pmp:schema=v2 -->");

  if (nextPlan.goals.length > 0) {
    const firstGoal = nextPlan.goals[0];
    lines.push(
      `<!-- pmp:goal:id=${escapeInlineValue(firstGoal.id)};statement=${escapeInlineValue(firstGoal.statement)};scanned=${new Date().toISOString()} -->`
    );
  }

  lines.push("");
  lines.push("## Goals");
  lines.push("");
  if (nextPlan.goals.length === 0) {
    lines.push("- (no goals set)");
  } else {
    for (const goal of nextPlan.goals) {
      lines.push(`- [${goal.id}] ${goal.statement}`);
      lines.push(
        `  <!-- pmp:goal-meta:id=${goal.id};criteria=${JSON.stringify(goal.successCriteria)};constraints=${JSON.stringify(goal.constraints)};out-of-scope=${JSON.stringify(goal.outOfScope)} -->`
      );
    }
  }

  lines.push("");
  lines.push("## Plan Tree");
  lines.push("");

  if (nextPlan.rootTaskIds.length === 0) {
    lines.push("(no tasks yet - set a project goal to get starter suggestions, or add a root task)");
  } else {
    for (const rootId of nextPlan.rootTaskIds) {
      renderTask(lines, nextPlan, rootId, 0, resolved.showRationaleInline);
    }
  }

  lines.push("");
  lines.push("## Execution Queue (Auto-Generated, Leaf Tasks Only)");
  lines.push("");

  const queue = buildExecutionQueue(nextPlan, { researchGate: resolved.researchGate });

  lines.push("### ⚠️ Blocked (Research incomplete)");
  if (queue.blocked.length === 0) {
    lines.push("(none)");
  } else {
    queue.blocked.forEach((task, index) => {
      const deps = task.dependsOn.length > 0 ? ` — blocked by [${task.dependsOn.join(", ")}]` : "";
      lines.push(`${index + 1}. [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}${deps}`);
    });
  }

  lines.push("");
  lines.push("### 🔍 Research Tasks (act first)");
  const researchAndDecision = [...queue.research, ...queue.decision];
  if (researchAndDecision.length === 0) {
    lines.push("(none)");
  } else {
    researchAndDecision.forEach((task, index) => {
      lines.push(`${index + 1}. [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}`);
    });
  }

  lines.push("");
  lines.push("### ⚙️ Ready to Implement");
  if (queue.implementationReady.length === 0) {
    lines.push("(none yet — complete research tasks above)");
  } else {
    queue.implementationReady.forEach((task, index) => {
      lines.push(`${index + 1}. [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}`);
    });
  }

  if (queue.milestone.length > 0) {
    lines.push("");
    lines.push("### 🏁 Milestones");
    queue.milestone.forEach((task, index) => {
      lines.push(`${index + 1}. [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

function detectSchemaVersion(lines: string[]): "v1" | "v2" {
  for (const line of lines) {
    const match = /<!--\s*pmp:schema=(v1|v2)\s*-->/i.exec(line);
    if (match?.[1] === "v1") {
      return "v1";
    }
    if (match?.[1] === "v2") {
      return "v2";
    }
  }
  return "v2";
}

function parseGoals(lines: string[], plan: PlanDocument, goalsHeadingLine: number, planHeadingLine: number): void {
  for (const line of lines) {
    const headerMatch = GOAL_HEADER_COMMENT_RE.exec(line.trim());
    if (!headerMatch) {
      continue;
    }

    const id = headerMatch[1]?.trim();
    const statement = headerMatch[2]?.trim();
    if (id && statement) {
      mergeGoal(plan, {
        id,
        statement: unescapeInlineValue(statement),
        successCriteria: [],
        constraints: [],
        outOfScope: []
      });
    }
  }

  if (goalsHeadingLine < 0) {
    return;
  }

  const end = planHeadingLine > goalsHeadingLine ? planHeadingLine : lines.length;
  for (let index = goalsHeadingLine + 1; index < end; index += 1) {
    const line = lines[index];
    const goalMatch = GOAL_LINE_RE.exec(line.trim());
    if (!goalMatch) {
      continue;
    }

    const goal: ProjectGoal = {
      id: goalMatch[1],
      statement: goalMatch[2],
      successCriteria: [],
      constraints: [],
      outOfScope: []
    };

    const metaLine = lines[index + 1]?.trim() ?? "";
    if (metaLine.startsWith("<!--") && metaLine.includes("pmp:goal-meta:")) {
      const metadata = parseInlineMetadata(metaLine.replace(/^<!--\s*|\s*-->$/g, ""));
      goal.successCriteria = parseStringArray(metadata.criteria);
      goal.constraints = parseStringArray(metadata.constraints);
      goal.outOfScope = parseStringArray(metadata["out-of-scope"]);
    }

    mergeGoal(plan, goal);
  }
}

function mergeGoal(plan: PlanDocument, goal: ProjectGoal): void {
  const existingIndex = plan.goals.findIndex((item) => item.id === goal.id);
  if (existingIndex >= 0) {
    const existing = plan.goals[existingIndex];
    plan.goals[existingIndex] = {
      id: goal.id,
      statement: goal.statement || existing.statement,
      successCriteria: goal.successCriteria.length > 0 ? goal.successCriteria : existing.successCriteria,
      constraints: goal.constraints.length > 0 ? goal.constraints : existing.constraints,
      outOfScope: goal.outOfScope.length > 0 ? goal.outOfScope : existing.outOfScope
    };
    return;
  }
  plan.goals.push(goal);
}

function parseTasks(
  lines: string[],
  start: number,
  end: number,
  plan: PlanDocument,
  debateConflicts: string[],
  schemaVersion: "v1" | "v2"
): void {
  const stack: Array<{ depth: number; task: TaskNode }> = [];

  for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
    const taskMatch = TASK_LINE_RE.exec(lines[lineIndex]);
    if (!taskMatch) {
      continue;
    }

    const depth = Math.floor((taskMatch[1]?.length ?? 0) / 2);
    const id = taskMatch[3].trim();
    const rawTitle = taskMatch[4].trim();

    while (stack.length > depth) {
      stack.pop();
    }

    const parent = depth > 0 ? stack[depth - 1]?.task : undefined;
    const task = createTaskNode({
      id,
      title: normalizeTaskTitle(rawTitle),
      type: inferTaskType(rawTitle),
      parentId: parent?.id ?? null
    });
    task.line = lineIndex;
    if (schemaVersion === "v1") {
      task.type = "implementation";
      task.origin = "manual";
    }

    task.status = normalizeTaskStatusSymbol(taskMatch[2]);

    let cursor = lineIndex + 1;
    while (cursor < end) {
      const lookahead = lines[cursor];
      if (TASK_LINE_RE.test(lookahead)) {
        break;
      }

      const trimmed = lookahead.trim();
      if (trimmed.startsWith("<!-- pmp:id=")) {
        const metadata = parseInlineMetadata(trimmed.replace(/^<!--\s*pmp:/, "").replace(/\s*-->$/, ""));
        applyTaskMetadata(task, metadata);
      } else if (/^>\s*Rationale:/i.test(trimmed)) {
        task.rationale = trimmed.replace(/^>\s*Rationale:\s*/i, "").trim();
      } else if (trimmed.startsWith("<!-- pmp:debate:")) {
        const debateTaskId = trimmed.replace(/^<!--\s*pmp:debate:/, "").trim();
        cursor += 1;
        while (cursor < end && !lines[cursor].trim().endsWith("-->")) {
          const debateLine = lines[cursor].trim();
          if (debateLine.includes("<<<<<<<") || debateLine.includes(">>>>>>>") || debateLine.includes("=======")) {
            debateConflicts.push(task.id);
          }
          const parsed = parseDebateLine(debateLine);
          if (parsed) {
            task.debateLog.push(parsed);
          }
          cursor += 1;
        }
        if (debateTaskId && debateTaskId !== task.id) {
          debateConflicts.push(task.id);
        }
      }

      cursor += 1;
    }

    addTask(plan, task);
    stack[depth] = { depth, task };

    lineIndex = cursor - 1;
  }
}

function applyTaskMetadata(task: TaskNode, metadata: Record<string, string>): void {
  if (metadata.type && isTaskType(metadata.type)) {
    task.type = metadata.type;
  }
  if (metadata.origin === "manual" || metadata.origin === "ai-generated" || metadata.origin === "code-inferred") {
    task.origin = metadata.origin;
  }

  task.goalRef = normalizeNullableString(metadata.goalRef);
  task.confidence = normalizeNullableNumber(metadata.confidence);
  task.dependsOn = parseStringArray(metadata.dependsOn);
  task.linkedFiles = parseStringArray(metadata.linkedFiles);
  task.notes = normalizeNullableString(metadata.notes);

  if (metadata["fileSendPolicy"] === "global" || metadata["fileSendPolicy"] === "always" || metadata["fileSendPolicy"] === "never" || metadata["fileSendPolicy"] === "ask") {
    task.fileSendPolicy = metadata.fileSendPolicy;
  }

  const completedAt = normalizeNullableString(metadata.completedAt);
  task.completedAt = completedAt;

  const createdAt = normalizeNullableString(metadata.createdAt);
  if (createdAt) {
    task.createdAt = createdAt;
  }
}

function parseInlineMetadata(raw: string): Record<string, string> {
  const payload = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  const result: Record<string, string> = {};
  const parts: string[] = [];

  let current = "";
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;

  for (const char of payload) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "[" || char === "{") {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === "]" || char === "}") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }

    if (char === ";" && bracketDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    result[key] = value;
  }

  return result;
}

function parseStringArray(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // fall through
  }

  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeNullableString(raw: string | undefined): string | null {
  if (!raw || raw === "null") {
    return null;
  }
  return unescapeInlineValue(raw);
}

function normalizeNullableNumber(raw: string | undefined): number | null {
  if (!raw || raw === "null") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}

function parseDebateLine(line: string): TaskNode["debateLog"][number] | undefined {
  const match = /^\[(.+?)\](?:\[(.+?)\])?\[(user|ai|system)\]\s+(.+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  return {
    timestamp: match[1],
    author: match[2],
    role: match[3] as "user" | "ai" | "system",
    content: match[4]
  };
}

function renderTask(lines: string[], plan: PlanDocument, taskId: string, depth: number, includeRationale: boolean): void {
  const task = plan.tasks[taskId];
  if (!task) {
    return;
  }

  const indent = "  ".repeat(depth);
  const symbol = taskStatusToSymbol(task.status);
  lines.push(`${indent}- [${symbol}] [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}`);
  lines.push(
    `${indent}  <!-- pmp:id=${task.id};parent=${task.parentId ?? "ROOT"};type=${task.type};origin=${task.origin};goalRef=${task.goalRef ?? "null"};confidence=${task.confidence ?? "null"};dependsOn=${JSON.stringify(task.dependsOn)};linkedFiles=${JSON.stringify(task.linkedFiles)};fileSendPolicy=${task.fileSendPolicy};createdAt=${task.createdAt};completedAt=${task.completedAt ?? "null"};notes=${escapeInlineValue(task.notes ?? "null")} -->`
  );

  if (includeRationale && task.rationale) {
    lines.push(`${indent}  > Rationale: ${task.rationale}`);
  }

  if (task.debateLog.length > 0) {
    lines.push(`${indent}  <!-- pmp:debate:${task.id}`);
    for (const entry of task.debateLog) {
      const author = entry.author ? `[${entry.author}]` : "";
      lines.push(`${indent}  [${entry.timestamp}]${author}[${entry.role}] ${entry.content}`);
    }
    lines.push(`${indent}  -->`);
  }

  lines.push("");

  for (const childId of task.children) {
    renderTask(lines, plan, childId, depth + 1, includeRationale);
  }
}

function inferTaskType(title: string): TaskType {
  const lowered = title.toLowerCase();
  if (lowered.startsWith("research:") || lowered.startsWith("investigate")) {
    return "research";
  }
  if (lowered.startsWith("decision:") || lowered.startsWith("choose ")) {
    return "decision";
  }
  if (lowered.startsWith("milestone:")) {
    return "milestone";
  }
  return "implementation";
}

function isTaskType(value: string): value is TaskType {
  return value === "research" || value === "implementation" || value === "decision" || value === "milestone";
}

function escapeInlineValue(value: string): string {
  return value.replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function unescapeInlineValue(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\;/g, ";");
}
