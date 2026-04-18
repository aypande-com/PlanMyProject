import * as vscode from "vscode";
import {
  addTask,
  createTaskNode,
  recomputeDerivedStatuses,
  type FileSendPolicy,
  type PlanDocument,
  type ProjectGoal,
  type TaskType
} from "../model/index";
import { readTextFile } from "../storage/WorkspaceFiles";
import { createTaskIdGenerator, parseGoalMarkdown } from "../util/index";
import { GoalSetupPanel } from "../ui/GoalSetupPanel";

export interface GoalCommandContext {
  getPlan: () => PlanDocument | undefined;
  ensureMutablePlan: (commandName: string) => Promise<void>;
  persistAndRefresh: () => Promise<void>;
  getConfiguration: () => vscode.WorkspaceConfiguration;
}

interface StarterTaskSuggestion {
  title: string;
  type: TaskType;
  detail: string;
}

export class GoalCommandService {
  constructor(
    private readonly ctx: GoalCommandContext,
    private readonly goalSetupPanel: GoalSetupPanel
  ) {}

  async setProjectGoal(): Promise<void> {
    await this.ctx.ensureMutablePlan("Set Project Goal");
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    const goal = await this.goalSetupPanel.promptForGoal(plan.goals);
    if (!goal) {
      return;
    }

    plan.goals.push(goal);
    if (plan.rootTaskIds.length > 0) {
      for (const rootId of plan.rootTaskIds) {
        const task = plan.tasks[rootId];
        if (task && !task.goalRef) {
          task.goalRef = goal.id;
        }
      }
    }

    const starterCount = await this.maybeSuggestStarterRootTasks(goal);
    await this.ctx.persistAndRefresh();
    if (starterCount > 0) {
      void vscode.window.showInformationMessage(`Added goal ${goal.id} with ${starterCount} starter root task(s).`);
    }
  }

  async importGoalStatement(): Promise<void> {
    await this.ctx.ensureMutablePlan("Import Goal Statement");
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    const files = await vscode.workspace.findFiles("*.md", "{**/node_modules/**,**/.git/**}", 50);
    const picks = files
      .map((uri) => ({
        label: vscode.workspace.asRelativePath(uri, false),
        uri
      }))
      .filter((item) => !item.label.toLowerCase().includes("planmyproject"));

    if (picks.length === 0) {
      void vscode.window.showWarningMessage("No markdown files available to import.");
      return;
    }

    const selected = await vscode.window.showQuickPick(picks, { placeHolder: "Select goal statement markdown file" });
    if (!selected) {
      return;
    }

    const content = await readTextFile(selected.uri);
    const goal = parseGoalMarkdown(content, plan.goals);
    plan.goals.push(goal);
    if (plan.rootTaskIds.length > 0) {
      for (const rootTaskId of plan.rootTaskIds) {
        const task = plan.tasks[rootTaskId];
        if (task && !task.goalRef) {
          task.goalRef = goal.id;
        }
      }
    }

    const starterCount = await this.maybeSuggestStarterRootTasks(goal);
    await this.ctx.persistAndRefresh();
    const starterSuffix = starterCount > 0 ? ` Added ${starterCount} starter root task(s).` : "";
    void vscode.window.showInformationMessage(`Imported goal ${goal.id} from ${selected.label}.${starterSuffix}`);
  }

  private async maybeSuggestStarterRootTasks(goal: ProjectGoal): Promise<number> {
    const plan = this.ctx.getPlan();
    if (!plan || plan.rootTaskIds.length > 0) {
      return 0;
    }

    const suggestions = buildStarterRootTaskSuggestions(goal);
    if (suggestions.length === 0) {
      return 0;
    }

    const selected = await vscode.window.showQuickPick(
      suggestions.map((suggestion) => ({
        label: suggestion.title,
        description: taskTypeLabel(suggestion.type),
        detail: suggestion.detail,
        suggestion
      })),
      {
        canPickMany: true,
        title: "Suggested Starter Tasks",
        placeHolder: "Select high-level tasks to add as root tasks"
      }
    );

    if (!selected || selected.length === 0) {
      return 0;
    }

    const createId = createTaskIdGenerator(plan);
    const fileSendPolicy = this.ctx.getConfiguration().get<FileSendPolicy>("defaultTaskFileSendPolicy", "global");
    const seenTitles = new Set<string>();
    let createdCount = 0;

    for (const item of selected) {
      const key = normalizeTaskTitleKey(item.suggestion.title);
      if (seenTitles.has(key)) {
        continue;
      }
      seenTitles.add(key);

      const task = createTaskNode({
        id: createId(),
        title: item.suggestion.title,
        type: item.suggestion.type,
        parentId: null,
        origin: "manual",
        goalRef: goal.id,
        fileSendPolicy
      });
      addTask(plan, task);
      createdCount += 1;
    }

    if (createdCount > 0) {
      recomputeDerivedStatuses(plan);
    }

    return createdCount;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (exported for testability)
// ---------------------------------------------------------------------------

export function buildStarterRootTaskSuggestions(goal: ProjectGoal): StarterTaskSuggestion[] {
  const focus = toTaskPhrase(goal.statement, 72) || "the project";
  const criteria = goal.successCriteria
    .map((criterion) => toTaskPhrase(criterion, 72))
    .filter((criterion): criterion is string => criterion.length > 0)
    .slice(0, 3);

  const suggestions: StarterTaskSuggestion[] = [
    {
      title: `Research architecture and technical risks for ${focus}`,
      type: "research",
      detail: "Identify unknowns before implementation."
    },
    {
      title: `Decide core scope and system design for ${focus}`,
      type: "decision",
      detail: "Capture key product and technical tradeoffs."
    },
    {
      title: `Implement the core user flow for ${focus}`,
      type: "implementation",
      detail: "Ship an end-to-end baseline flow."
    },
    {
      title: "Validate delivery against goal success criteria",
      type: "milestone",
      detail: "Checkpoint before broad rollout."
    }
  ];

  for (const criterion of criteria) {
    suggestions.splice(2, 0, {
      title: `Deliver success criterion: ${criterion}`,
      type: "implementation",
      detail: "Derived directly from the goal success criteria."
    });
  }

  const deduped: StarterTaskSuggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = normalizeTaskTitleKey(suggestion.title);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(suggestion);
  }

  return deduped.slice(0, 6);
}

export function normalizeTaskTitleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function toTaskPhrase(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function taskTypeLabel(type: TaskType): string {
  if (type === "research") {
    return "Research";
  }
  if (type === "decision") {
    return "Decision";
  }
  if (type === "milestone") {
    return "Milestone";
  }
  return "Implementation";
}
