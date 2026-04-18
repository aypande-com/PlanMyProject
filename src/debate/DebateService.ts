import {
  addTask,
  createTaskNode,
  deleteTask,
  normalizeTaskTitle,
  type DebateEntry,
  type PlanDocument,
  type TaskNode,
  type TaskType
} from "../model/index";
import { createTaskIdGenerator } from "../util";
import type { AIService } from "../ai/AIService";

export type DebateAction = "accept" | "rewrite" | "split" | "dismiss" | "defer";

export interface DebateResponse {
  content: string;
  suggestedAction?: DebateAction;
}

export class DebateService {
  constructor(
    private readonly aiService: AIService,
    private readonly getAuthorName: () => Promise<string | undefined>
  ) {}

  async generateOpening(task: TaskNode, workspaceSummary: string): Promise<DebateResponse> {
    const prompt = [
      "You are PlanBot, a debate partner for software planning.",
      `Task: [${task.id}] ${task.title}`,
      `Type: ${task.type}`,
      "Your job is to justify why this task matters, challenge weak assumptions, and rationalize tradeoffs.",
      "Stay in debate mode only: do not provide implementation steps or code edits.",
      "Return concise plain text with analysis and end with 'Suggested action: <accept|rewrite|split|dismiss|defer>'.",
      "",
      "Workspace summary:",
      workspaceSummary
    ].join("\n");

    const response = await this.aiService.generateText(prompt);
    return {
      content: response.text,
      suggestedAction: extractSuggestedAction(response.text)
    };
  }

  async continueDebate(task: TaskNode, message: string, workspaceSummary: string): Promise<DebateResponse> {
    const recentThread = this.renderDebateContext(task);
    const prompt = [
      "You are PlanBot continuing an active planning debate.",
      `Task: [${task.id}] ${task.title}`,
      `Task Type: ${task.type}`,
      "Respond by critically evaluating the user's suggestion.",
      "You must attempt to justify, challenge, and rationalize the suggestion before proposing a resolution action.",
      "Do not provide implementation steps or code output while the debate remains unresolved.",
      "",
      "Recent debate thread:",
      recentThread || "(no prior messages)",
      "",
      "Latest user message:",
      message,
      "",
      "Workspace summary:",
      workspaceSummary,
      "Respond with concise analysis and end with 'Suggested action: <accept|rewrite|split|dismiss|defer>'."
    ].join("\n");

    const response = await this.aiService.generateText(prompt);
    return {
      content: response.text,
      suggestedAction: extractSuggestedAction(response.text)
    };
  }

  async suggestSplitTitles(task: TaskNode, workspaceSummary: string): Promise<string[]> {
    const prompt = [
      "Propose 2-4 focused child tasks to split this task.",
      `Task: [${task.id}] ${task.title}`,
      `Task Type: ${task.type}`,
      "Return JSON only with shape: {\"titles\":[\"...\"]}.",
      "Titles must be concise and non-overlapping.",
      "",
      "Workspace summary:",
      workspaceSummary
    ].join("\n");

    const response = await this.aiService.generateText(prompt);
    const match = /\{[\s\S]*\}/.exec(response.text);
    if (!match) {
      return [];
    }

    try {
      const parsed = JSON.parse(match[0]) as { titles?: unknown };
      if (!Array.isArray(parsed.titles)) {
        return [];
      }
      return parsed.titles
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, 6);
    } catch {
      return [];
    }
  }

  async regenerateRationale(task: TaskNode, rewrittenTitle: string, workspaceSummary: string): Promise<string | undefined> {
    const prompt = [
      "Regenerate rationale for this rewritten task title.",
      `Task ID: ${task.id}`,
      `Original Title: ${task.title}`,
      `Rewritten Title: ${rewrittenTitle}`,
      `Task Type: ${task.type}`,
      "Return plain text only, max 2 sentences.",
      "",
      "Workspace summary:",
      workspaceSummary
    ].join("\n");

    const response = await this.aiService.generateText(prompt);
    const rationale = response.text.trim();
    return rationale || undefined;
  }

  async appendEntry(task: TaskNode, entry: Omit<DebateEntry, "timestamp" | "author"> & { timestamp?: string; author?: string }): Promise<void> {
    const author = entry.role === "user"
      ? (entry.author ?? (await this.getAuthorName()))
      : undefined;

    task.debateLog.push({
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      author
    });
  }

  private renderDebateContext(task: TaskNode): string {
    const entries = task.debateLog.slice(-8);
    if (entries.length === 0) {
      return "";
    }

    return entries
      .map((entry) => {
        const action = entry.action ? ` action=${entry.action}` : "";
        const author = entry.author ? ` author=${entry.author}` : "";
        return `[${entry.role}${action}${author}] ${entry.content}`;
      })
      .join("\n");
  }

  async applyAction(
    plan: PlanDocument,
    task: TaskNode,
    action: DebateAction,
    payload?: { rewriteTitle?: string; rewrittenRationale?: string; splitTitles?: string[]; splitType?: TaskType }
  ): Promise<{ changed: boolean; message: string }> {
    if (action === "accept") {
      await this.appendEntry(task, { role: "system", content: "Task accepted", action: "accept" });
      return { changed: true, message: `Task ${task.id} accepted.` };
    }

    if (action === "rewrite") {
      const nextTitle = payload?.rewriteTitle?.trim();
      if (!nextTitle) {
        return { changed: false, message: "Rewrite requires a title." };
      }
      task.title = normalizeTaskTitle(nextTitle);
      if (payload?.rewrittenRationale?.trim()) {
        task.rationale = payload.rewrittenRationale.trim();
      }
      await this.appendEntry(task, { role: "system", content: `Task rewritten to: ${task.title}`, action: "rewrite" });
      return { changed: true, message: `Task ${task.id} rewritten.` };
    }

    if (action === "dismiss") {
      const deleted = deleteTask(plan, task.id);
      return {
        changed: deleted,
        message: deleted ? `Task ${task.id} dismissed and removed.` : `Task ${task.id} could not be removed.`
      };
    }

    if (action === "defer") {
      task.notes = task.notes ? `${task.notes}\n[deferred]` : "[deferred]";
      await this.appendEntry(task, { role: "system", content: "Task deferred", action: "defer" });
      return { changed: true, message: `Task ${task.id} deferred.` };
    }

    if (action === "split") {
      const splitTitles = (payload?.splitTitles ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
      if (splitTitles.length === 0) {
        return { changed: false, message: "Split requires at least one replacement title." };
      }

      const idFactory = createTaskIdGenerator(plan);
      const parentId = task.parentId;
      const parentChildren = parentId ? plan.tasks[parentId]?.children : plan.rootTaskIds;
      const insertionIndex = parentChildren?.indexOf(task.id) ?? -1;

      const newTasks: TaskNode[] = splitTitles.map((title) => {
        const next = createTaskNode({
          id: idFactory(),
          title,
          type: payload?.splitType ?? task.type,
          parentId: task.parentId,
          origin: "ai-generated",
          goalRef: task.goalRef,
          fileSendPolicy: task.fileSendPolicy
        });
        next.dependsOn = [...task.dependsOn];
        next.linkedFiles = [...task.linkedFiles];
        return next;
      });

      deleteTask(plan, task.id);
      for (const newTask of newTasks) {
        addTask(plan, newTask);
      }

      if (parentChildren && insertionIndex >= 0) {
        const ids = newTasks.map((item) => item.id);
        parentChildren.splice(insertionIndex, 0, ...ids);
      }

      return {
        changed: true,
        message: `Task ${task.id} replaced with ${newTasks.length} split task(s).`
      };
    }

    return { changed: false, message: "Unknown debate action." };
  }
}

function extractSuggestedAction(text: string): DebateAction | undefined {
  const match = /Suggested action:\s*(accept|rewrite|split|dismiss|defer)/i.exec(text);
  if (!match) {
    return undefined;
  }
  return match[1].toLowerCase() as DebateAction;
}
