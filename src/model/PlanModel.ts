import {
  type FileSendPolicy,
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

export function isTaskBlocked(plan: PlanDocument, taskId: string, researchGate: boolean): boolean {
  const task = plan.tasks[taskId];
  if (!task) {
    return false;
  }

  for (const depId of task.dependsOn) {
    const dep = plan.tasks[depId];
    if (!dep || dep.status !== "done") {
      return true;
    }
  }

  if (researchGate && task.type === "implementation") {
    const parent = task.parentId ? plan.tasks[task.parentId] : undefined;
    if (parent) {
      for (const siblingId of parent.children) {
        if (siblingId === task.id) {
          continue;
        }
        const sibling = plan.tasks[siblingId];
        if (sibling && isResearchLikeTask(sibling.type) && sibling.status !== "done") {
          return true;
        }
      }
    }
  }

  return false;
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
