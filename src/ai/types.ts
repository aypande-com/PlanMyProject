import type { TaskType } from "../model/index";

export interface AITextResponse {
  text: string;
  provider: string;
  model?: string;
}

export interface AIStreamOptions {
  cancellationToken?: { isCancellationRequested: boolean };
  onChunk?: (chunk: string) => Promise<void> | void;
}

export interface AIProvider {
  readonly id: "copilot" | "claude" | "openai";
  generate(prompt: string, options?: AIStreamOptions): Promise<AITextResponse>;
}

export interface GeneratedTaskDraft {
  title: string;
  type: TaskType;
  rationale: string;
  goalCriterionIndex: number;
  confidence: number;
  dependsOnTitles: string[];
  linkedFiles: string[];
}
