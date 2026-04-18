export interface ResearchIndexEntry {
  taskId: string;
  taskTitle: string;
  type: "research" | "decision";
  conclusion: string;
  tags: string[];
  goalRef: string | null;
  completedAt: string;
  usedInPrompts: number;
}
