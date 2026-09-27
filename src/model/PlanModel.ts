import {
  type FileSendPolicy,
  hasUnresolvedDebateThread,
  normalizeTaskTitle,
  type TaskNode,
  type TaskStatus,
  type TaskType,
  isResearchLikeTask
} from "./TaskNode";
import type { ProjectGoal } from "./ProjectGoal";

export interface PlanDocument {
  schemaVersion: "v1" | "v2";
  goals: ProjectGoal[];
  rootTaskIds: string[];
  tasks: Record<string, TaskNode>;
}

export type TaskBlockReason = "dependency" | "research-gate" | "debate-thread";

export function createEmptyPlanDocument(): PlanDocument {
  return {
    schemaVersion: "v2",
    goals: [],
    rootTaskIds: [],
    tasks: {}
  };
}

export function createTaskNode(input: {
  id: string;
  title: string;
  type?: TaskType;
  parentId?: string | null;
  origin?: TaskNode["origin"];
  goalRef?: string | null;
  createdAt?: string;
  fileSendPolicy?: FileSendPolicy;
}): TaskNode {
  const timestamp = input.createdAt ?? new Date().toISOString();
  const title = normalizeTaskTitle(input.title);
  return {
    id: input.id,
    title,
    type: input.type ?? "implementation",
    status: "todo",
    parentId: input.parentId ?? null,
    children: [],
    origin: input.origin ?? "manual",
    goalRef: input.goalRef ?? null,
    dependsOn: [],
    confidence: null,
    rationale: null,
    notes: null,
    linkedFiles: [],
    debateLog: [],
    completedAt: null,
    createdAt: timestamp,
    fileSendPolicy: input.fileSendPolicy ?? "global"
  };
}

export function getTaskRoots(plan: PlanDocument): TaskNode[] {
  return plan.rootTaskIds.map((id) => plan.tasks[id]).filter((task): task is TaskNode => Boolean(task));
}

export function listTasks(plan: PlanDocument): TaskNode[] {
  const result: TaskNode[] = [];
  const visit = (taskId: string): void => {
    const task = plan.tasks[taskId];
    if (!task) {
      return;
    }
    result.push(task);
    for (const childId of task.children) {
      visit(childId);
    }
  };
  for (const rootId of plan.rootTaskIds) {
    visit(rootId);
  }
  return result;
}

export function listLeafTasks(plan: PlanDocument): TaskNode[] {
  return listTasks(plan).filter((task) => task.children.length === 0);
}

export function addTask(plan: PlanDocument, task: TaskNode): void {
  plan.tasks[task.id] = task;
  if (task.parentId) {
    const parent = plan.tasks[task.parentId];
    if (parent && !parent.children.includes(task.id)) {
      parent.children.push(task.id);
    }
    return;
  }
  if (!plan.rootTaskIds.includes(task.id)) {
    plan.rootTaskIds.push(task.id);
  }
}

export function deleteTask(plan: PlanDocument, taskId: string): boolean {
  const target = plan.tasks[taskId];
  if (!target) {
    return false;
  }

  for (const childId of [...target.children]) {
    deleteTask(plan, childId);
  }

  if (target.parentId) {
    const parent = plan.tasks[target.parentId];
    if (parent) {
      parent.children = parent.children.filter((id) => id !== taskId);
    }
  } else {
    plan.rootTaskIds = plan.rootTaskIds.filter((id) => id !== taskId);
  }

  delete plan.tasks[taskId];
  return true;
}

export function recomputeDerivedStatuses(plan: PlanDocument): void {
  const visit = (taskId: string): TaskStatus => {
    const task = plan.tasks[taskId];
    if (!task) {
      return "todo";
    }

    if (task.children.length === 0) {
      if (task.status === "done") {
        task.completedAt ??= new Date().toISOString();
      } else {
        task.completedAt = null;
      }
      return task.status;
    }

    const childStatuses = task.children.map((childId) => visit(childId));
    const doneCount = childStatuses.filter((status) => status === "done").length;
    if (doneCount === childStatuses.length) {
      task.status = "done";
      task.completedAt ??= new Date().toISOString();
    } else if (doneCount === 0 && childStatuses.every((status) => status === "todo")) {
      task.status = "todo";
      task.completedAt = null;
    } else {
      task.status = "in-progress";
      task.completedAt = null;
    }

    return task.status;
  };

  for (const rootId of plan.rootTaskIds) {
    visit(rootId);
  }
}

export function markTaskStatus(plan: PlanDocument, taskId: string, status: TaskStatus): void {
  const task = plan.tasks[taskId];
  if (!task) {
    return;
  }
  task.status = status;
  task.completedAt = status === "done" ? new Date().toISOString() : null;
  recomputeDerivedStatuses(plan);
}

// `unresolvedResearchParents`, when supplied, is a set of parentIds known (by
// buildUnresolvedResearchParentIds) to have an unresolved research/decision
// child, letting a caller that checks many tasks under the same plan skip the
// O(children) sibling scan below in favor of an O(1) set lookup. It is
// optional and callers that omit it (the default) get identical behavior to
// before - only QueueBuilder's bulk path passes it today. Found while
// verifying P0's <10ms @ 2,000 tasks budget: buildExecutionQueue calls this
// once per leaf task, and a sibling scan that is O(children) turns that into
// O(n^2) once many leaves share a parent. The other call sites (serialize,
// tree view, single-task lookups) still do the full scan - flagged for U6.
export function getTaskBlockReason(
  plan: PlanDocument,
  taskId: string,
  researchGate: boolean,
  unresolvedResearchParents?: Set<string>
): TaskBlockReason | undefined {
  const task = plan.tasks[taskId];
  if (!task) {
    return undefined;
  }

  for (const depId of task.dependsOn) {
    const dep = plan.tasks[depId];
    if (!dep || dep.status !== "done") {
      return "dependency";
    }
  }

  if (task.type === "implementation" && hasUnresolvedDebateThread(task)) {
    return "debate-thread";
  }

  if (researchGate && task.type === "implementation" && task.parentId) {
    if (unresolvedResearchParents) {
      if (unresolvedResearchParents.has(task.parentId)) {
        return "research-gate";
      }
    } else {
      const parent = plan.tasks[task.parentId];
      if (parent) {
        for (const siblingId of parent.children) {
          if (siblingId === task.id) {
            continue;
          }
          const sibling = plan.tasks[siblingId];
          if (sibling && isResearchLikeTask(sibling.type) && sibling.status !== "done") {
            return "research-gate";
          }
        }
      }
    }
  }

  return undefined;
}

// One O(n) pass building the set of parentIds with an unresolved research or
// decision child, for callers that need getTaskBlockReason's research-gate
// check for every task in the plan rather than a single ad-hoc lookup.
export function buildUnresolvedResearchParentIds(plan: PlanDocument): Set<string> {
  const parentIds = new Set<string>();
  for (const task of Object.values(plan.tasks)) {
    if (task.parentId && isResearchLikeTask(task.type) && task.status !== "done") {
      parentIds.add(task.parentId);
    }
  }
  return parentIds;
}

export function isTaskBlocked(
  plan: PlanDocument,
  taskId: string,
  researchGate: boolean,
  unresolvedResearchParents?: Set<string>
): boolean {
  return getTaskBlockReason(plan, taskId, researchGate, unresolvedResearchParents) !== undefined;
}

export function duplicatePlanDocument(plan: PlanDocument): PlanDocument {
  const tasks: Record<string, TaskNode> = {};
  for (const [id, task] of Object.entries(plan.tasks)) {
    tasks[id] = {
      ...task,
      children: [...task.children],
      dependsOn: [...task.dependsOn],
      linkedFiles: [...task.linkedFiles],
      debateLog: task.debateLog.map((entry) => ({ ...entry }))
    };
  }

  return {
    schemaVersion: plan.schemaVersion,
    goals: plan.goals.map((goal) => ({
      ...goal,
      successCriteria: [...goal.successCriteria],
      constraints: [...goal.constraints],
      outOfScope: [...goal.outOfScope]
    })),
    rootTaskIds: [...plan.rootTaskIds],
    tasks
  };
}
