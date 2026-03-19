import { createTaskNode, type PlanDocument, type TaskNode } from "../model/index";
import { createTaskIdGenerator } from "../util";
import type { AIService } from "../ai/AIService";
import { buildTaskGenerationPrompt } from "../ai/PromptBuilder";
import { parseTaskGenerationResponse } from "../ai/ResponseParser";
import type { GeneratedTaskDraft } from "../ai/types";
import type { ResearchIndexEntry, WorkspaceScan } from "../model/index";

export interface TaskGeneratorSettings {
  confidenceThreshold: number;
}

export interface TaskGenerationInput {
  plan: PlanDocument;
  parent: TaskNode;
  scan: WorkspaceScan | undefined;
  knowledge: ResearchIndexEntry[];
  confidenceThreshold: number;
  includeSignatures: boolean;
  onChunk?: (chunk: string) => Promise<void> | void;
}

export interface TaskGenerationOutput {
  drafts: GeneratedTaskDraft[];
  accepted: GeneratedTaskDraft[];
  requiresReview: GeneratedTaskDraft[];
}

export class TaskGenerator {
  constructor(private readonly aiService: AIService) {}

  async generate(input: TaskGenerationInput): Promise<TaskGenerationOutput> {
    const goal = input.parent.goalRef
      ? input.plan.goals.find((item) => item.id === input.parent.goalRef)
      : input.plan.goals[0];

    const existingChildren = input.parent.children
      .map((id) => input.plan.tasks[id])
      .filter((item): item is TaskNode => Boolean(item));

    const alreadyExistingAreas = (input.scan?.modules ?? [])
      .filter((module) => module.estimatedCompletion === "complete")
      .map((module) => module.name);

    const prompt = buildTaskGenerationPrompt({
      goal,
      scan: input.scan,
      knowledge: input.knowledge,
      parentTask: input.parent,
      existingChildren,
      alreadyExistingAreas,
      includeSignatures: input.includeSignatures
    });

    const response = await this.aiService.generateText(prompt, {
      onChunk: input.onChunk
    });

    const parsed = parseTaskGenerationResponse(response.text);
    const deduped = dedupeDrafts(parsed.tasks, existingChildren.map((task) => task.title));

    const threshold = Math.min(1, Math.max(0, input.confidenceThreshold));
    const accepted = deduped.filter((task) => task.confidence >= threshold);
    const requiresReview = deduped.filter((task) => task.confidence < threshold);

    return {
      drafts: deduped,
      accepted,
      requiresReview
    };
  }

  materializeDrafts(plan: PlanDocument, parent: TaskNode, drafts: GeneratedTaskDraft[]): TaskNode[] {
    const idFactory = createTaskIdGenerator(plan);
    const byTitle = new Map<string, string>();
    const created: TaskNode[] = [];

    for (const draft of drafts) {
      const task = createTaskNode({
        id: idFactory(),
        title: draft.title,
        type: draft.type,
        parentId: parent.id,
        origin: "ai-generated",
        goalRef: parent.goalRef,
        fileSendPolicy: parent.fileSendPolicy
      });
      task.rationale = draft.rationale;
      task.confidence = draft.confidence;
      task.linkedFiles = [...draft.linkedFiles];
      task.dependsOn = [];
      created.push(task);
      byTitle.set(normalizeTitle(draft.title), task.id);
    }

    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const task = created[index];
      task.dependsOn = draft.dependsOnTitles
        .map((title) => byTitle.get(normalizeTitle(title)))
        .filter((id): id is string => Boolean(id));
    }

    return created;
  }
}

function dedupeDrafts(drafts: GeneratedTaskDraft[], existingTitles: string[]): GeneratedTaskDraft[] {
  const seen = new Set(existingTitles.map((title) => normalizeTitle(title)));
  const result: GeneratedTaskDraft[] = [];

  for (const draft of drafts) {
    const key = normalizeTitle(draft.title);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(draft);
  }

  return result;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
