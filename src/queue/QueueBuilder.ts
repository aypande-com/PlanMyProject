import { type PlanDocument, listLeafTasks, isTaskBlocked, buildUnresolvedResearchParentIds } from "../model/index";
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
  const unresolvedResearchParents = buildUnresolvedResearchParentIds(plan);

  for (const task of orderedLeaves) {
    if (task.status === "done") {
      continue;
    }

    if (isTaskBlocked(plan, task.id, resolved.researchGate, unresolvedResearchParents)) {
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
  // P0-B1: this used to call getTaskTraversalRank (a full tree walk from all
  // roots) inside compareTaskOrder, and compareTaskOrder ran on every
  // comparison of a full queue.sort() repeated on every single insertion, on
  // top of an O(n) queue.shift() per dequeue. That is super-linear enough to
  // take ~11s at 2,000 tasks (P0-A2's benchmark). Rank is computed once in a
  // single O(n) pass below and threaded through as a plain id->rank map, so
  // every comparison is an O(1) lookup; the ready set is a binary heap so
  // insertion and extraction are O(log n) instead of a full O(n log n) resort.
  const rankMap = buildTraversalRankMap(plan);
  const compare = (a: TaskNode, b: TaskNode): number => compareTaskOrder(rankMap, a, b);

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

  const ready = new BinaryHeap(compare);
  for (const task of leaves) {
    if ((indegree.get(task.id) ?? 0) === 0) {
      ready.push(task);
    }
  }

  const output: TaskNode[] = [];
  let current = ready.pop();
  while (current) {
    output.push(current);

    for (const nextId of outgoing.get(current.id) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextTask = byId.get(nextId);
        if (nextTask) {
          ready.push(nextTask);
        }
      }
    }

    current = ready.pop();
  }

  if (output.length === leaves.length) {
    return output;
  }

  const seen = new Set(output.map((task) => task.id));
  const remaining = leaves.filter((task) => !seen.has(task.id)).sort(compare);
  return [...output, ...remaining];
}

// Min-heap keyed by `compare`, used instead of a sorted array so that both
// insertion and extraction are O(log n) - a sorted array's binary search
// still needs an O(n) splice to shift elements, which measured at ~37ms for
// 2,000 tasks. The heap keeps the same rank-map-based `compare`, so ordering
// is unaffected; only the container changed.
class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const top = this.items[0];
    if (top === undefined) {
      return undefined;
    }

    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = (current - 1) >>> 1;
      if (this.compare(this.items[current], this.items[parent]) >= 0) {
        break;
      }
      this.swap(current, parent);
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    const length = this.items.length;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }
      this.swap(current, smallest);
      current = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const temp = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = temp;
  }
}

function compareTaskOrder(rankMap: Map<string, number>, a: TaskNode, b: TaskNode): number {
  const rankA = rankMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const rankB = rankMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.id.localeCompare(b.id);
}

function buildTraversalRankMap(plan: PlanDocument): Map<string, number> {
  const rankMap = new Map<string, number>();
  let index = 0;

  const visit = (id: string): void => {
    const task = plan.tasks[id];
    if (!task) {
      return;
    }

    if (!rankMap.has(id)) {
      rankMap.set(id, index);
    }
    index += 1;

    for (const childId of task.children) {
      visit(childId);
    }
  };

  for (const rootId of plan.rootTaskIds) {
    visit(rootId);
  }

  return rankMap;
}
