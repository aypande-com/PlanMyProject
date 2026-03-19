import type { PlanDocument } from "../model";

export function createTaskIdGenerator(plan: PlanDocument): () => string {
  let max = 0;
  for (const id of Object.keys(plan.tasks)) {
    const match = /^T(\d+)$/.exec(id);
    if (!match) {
      continue;
    }
    max = Math.max(max, Number(match[1]));
  }
  return () => {
    max += 1;
    return `T${String(max).padStart(4, "0")}`;
  };
}

export function createGoalIdGenerator(goals: { id: string }[]): () => string {
  let max = 0;
  for (const goal of goals) {
    const match = /^G(\d+)$/.exec(goal.id);
    if (!match) {
      continue;
    }
    max = Math.max(max, Number(match[1]));
  }
  return () => {
    max += 1;
    return `G${String(max).padStart(4, "0")}`;
  };
}
