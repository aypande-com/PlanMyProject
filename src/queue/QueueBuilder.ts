import { type PlanDocument, listLeafTasks, isTaskBlocked } from "../model/index";
import type { TaskNode } from "../model/index";

export interface QueueBuildOptions {
  researchGate: boolean;
}

export interface QueueSections {
  blocked: TaskNode[];
  research: TaskNode[];
  decision: TaskNode[];
  implementationReady: TaskNode[];
  milestone: TaskNode[];
}

const DEFAULT_OPTIONS: QueueBuildOptions = {
  researchGate: true
};

export function buildExecutionQueue(plan: PlanDocument, options?: Partial<QueueBuildOptions>): QueueSections {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const leaves = listLeafTasks(plan);

  const blocked: TaskNode[] = [];
  const research: TaskNode[] = [];
  const decision: TaskNode[] = [];
  const implementationReady: TaskNode[] = [];
  const milestone: TaskNode[] = [];

  const orderedLeaves = sortLeavesByDependencies(plan, leaves);

  for (const task of orderedLeaves) {
    if (task.status === "done") {
      continue;
    }

    if (isTaskBlocked(plan, task.id, resolved.researchGate)) {
      blocked.push(task);
      continue;
    }

    if (task.type === "research") {
      research.push(task);
      continue;
    }

    if (task.type === "decision") {
      decision.push(task);
      continue;
    }

    if (task.type === "milestone") {
      milestone.push(task);
      continue;
    }

    implementationReady.push(task);
  }

  return {
    blocked,
    research,
    decision,
    implementationReady,
    milestone
  };
}

function sortLeavesByDependencies(plan: PlanDocument, leaves: TaskNode[]): TaskNode[] {
  const byId = new Map(leaves.map((task) => [task.id, task] as const));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const task of leaves) {
    indegree.set(task.id, 0);
    outgoing.set(task.id, []);
  }

  for (const task of leaves) {
    for (const depId of task.dependsOn) {
      if (!byId.has(depId)) {
        continue;
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      outgoing.get(depId)?.push(task.id);
    }
  }

  const queue: TaskNode[] = leaves
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .sort((a, b) => compareTaskOrder(plan, a, b));

  const output: TaskNode[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    output.push(current);

    for (const nextId of outgoing.get(current.id) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextTask = byId.get(nextId);
        if (nextTask) {
          queue.push(nextTask);
          queue.sort((a, b) => compareTaskOrder(plan, a, b));
        }
      }
    }
  }

  if (output.length === leaves.length) {
    return output;
  }

  const seen = new Set(output.map((task) => task.id));
  const remaining = leaves
    .filter((task) => !seen.has(task.id))
    .sort((a, b) => compareTaskOrder(plan, a, b));
  return [...output, ...remaining];
}

function compareTaskOrder(plan: PlanDocument, a: TaskNode, b: TaskNode): number {
  const rankA = getTaskTraversalRank(plan, a.id);
  const rankB = getTaskTraversalRank(plan, b.id);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.id.localeCompare(b.id);
}

function getTaskTraversalRank(plan: PlanDocument, taskId: string): number {
  let index = 0;
  let rank = Number.MAX_SAFE_INTEGER;

  const visit = (id: string): void => {
    const task = plan.tasks[id];
    if (!task) {
      return;
    }

    if (id === taskId) {
      rank = Math.min(rank, index);
    }
    index += 1;

    for (const childId of task.children) {
      visit(childId);
    }
  };

  for (const rootId of plan.rootTaskIds) {
    visit(rootId);
  }

  return rank;
}
