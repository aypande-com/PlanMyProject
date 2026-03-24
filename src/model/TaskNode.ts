export type TaskType = "research" | "implementation" | "decision" | "milestone";
export type TaskStatus = "todo" | "in-progress" | "done";
export type TaskOrigin = "manual" | "ai-generated" | "code-inferred";
export type FileSendPolicy = "global" | "always" | "never" | "ask";
export type DebateAction = "split" | "rewrite" | "dismiss" | "accept" | "defer";

export interface DebateEntry {
  timestamp: string;
  role: "user" | "ai" | "system";
  content: string;
  action?: DebateAction;
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

const LEADING_TASK_TYPE_ICON_RE = /^(?:(?:🔍|⚙\uFE0F?|⚖\uFE0F?|🏁)\s*)+/u;
const LEADING_TASK_STATUS_ICON_RE = /^(?:(?:✅|☑\uFE0F?|✔\uFE0F?|✓|❌|✗|☒|☐|⏳|⌛|⭕|◯|○)\s*)+/u;

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
      .replace(LEADING_TASK_STATUS_ICON_RE, "")
      .replace(LEADING_TASK_TYPE_ICON_RE, "")
      .replace(/^(?:Research|Decision|Implement|Implementation|Milestone):\s*/i, "")
      .trim();

    if (next === normalized) {
      break;
    }
    normalized = next;
  }

  return normalized || original;
}

const RESOLVING_DEBATE_ACTIONS = new Set<DebateAction>(["accept", "rewrite", "split", "dismiss", "defer"]);

export function hasUnresolvedDebateThread(task: TaskNode): boolean {
  let latestUserSuggestionIndex = -1;
  let latestResolutionIndex = -1;

  for (let index = 0; index < task.debateLog.length; index += 1) {
    const entry = task.debateLog[index];
    if (entry.role === "user" && entry.content.trim().length > 0) {
      latestUserSuggestionIndex = index;
    }

    if (entry.role !== "system") {
      continue;
    }

    const action = resolveDebateAction(entry);
    if (action && RESOLVING_DEBATE_ACTIONS.has(action)) {
      latestResolutionIndex = index;
    }
  }

  return latestUserSuggestionIndex > latestResolutionIndex;
}

function resolveDebateAction(entry: DebateEntry): DebateAction | undefined {
  if (entry.action) {
    return entry.action;
  }

  const content = entry.content.trim().toLowerCase();
  if (content.startsWith("task accepted")) {
    return "accept";
  }
  if (content.startsWith("task rewritten")) {
    return "rewrite";
  }
  if (content.startsWith("task deferred")) {
    return "defer";
  }
  if (content.startsWith("task dismissed")) {
    return "dismiss";
  }
  if (content.startsWith("task split")) {
    return "split";
  }

  return undefined;
}
