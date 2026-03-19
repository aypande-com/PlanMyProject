export type TaskType = "research" | "implementation" | "decision" | "milestone";
export type TaskStatus = "todo" | "in-progress" | "done";
export type TaskOrigin = "manual" | "ai-generated" | "code-inferred";
export type FileSendPolicy = "global" | "always" | "never" | "ask";

export interface DebateEntry {
  timestamp: string;
  role: "user" | "ai" | "system";
  content: string;
  action?: "split" | "rewrite" | "dismiss" | "accept" | "defer";
  author?: string;
}

export interface TaskNode {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  parentId: string | null;
  children: string[];
  origin: TaskOrigin;
  goalRef: string | null;
  dependsOn: string[];
  confidence: number | null;
  rationale: string | null;
  notes: string | null;
  linkedFiles: string[];
  debateLog: DebateEntry[];
  completedAt: string | null;
  createdAt: string;
  fileSendPolicy: FileSendPolicy;
  line?: number;
  archivedDebatePath?: string | null;
}

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  research: "🔍",
  implementation: "⚙️",
  decision: "⚖️",
  milestone: "🏁"
};

export function normalizeTaskStatusSymbol(input: string): TaskStatus {
  const value = input.trim().toLowerCase();
  if (value === "x" || value === "done") {
    return "done";
  }
  if (value === "/" || value === "in-progress" || value === "in progress") {
    return "in-progress";
  }
  return "todo";
}

export function taskStatusToSymbol(status: TaskStatus): " " | "/" | "x" {
  if (status === "done") {
    return "x";
  }
  if (status === "in-progress") {
    return "/";
  }
  return " ";
}

export function isResearchLikeTask(type: TaskType): boolean {
  return type === "research" || type === "decision";
}

export function normalizeTaskTitle(input: string): string {
  const original = input.replace(/\s+/g, " ").trim();
  if (!original) {
    return "";
  }

  let normalized = original;
  while (true) {
    const next = normalized
      .replace(/^(?:[🔍⚙️⚖️🏁]\s*)+/u, "")
      .replace(/^(?:Research|Decision|Implement|Implementation|Milestone):\s*/i, "")
      .trim();

    if (next === normalized) {
      break;
    }
    normalized = next;
  }

  return normalized || original;
}
