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
import type { AIService } from "../ai/AIService";
import type { ConsentService } from "../ai/ConsentService";
import { buildWordingReviewPrompt } from "../ai/PromptBuilder";
import {
  parseWordingReviewResponse,
  type WordingNote,
  type WordingReviewInput,
  type WordingReviewResult
} from "../ai/ResponseParser";

export interface GoalCommandContext {
  getPlan: () => PlanDocument | undefined;
  ensureMutablePlan: (commandName: string) => Promise<void>;
  persistAndRefresh: () => Promise<void>;
  getConfiguration: () => vscode.WorkspaceConfiguration;
}

export interface GoalCommandServices {
  aiService: AIService;
  consentService: ConsentService;
}

interface StarterTaskSuggestion {
  title: string;
  type: TaskType;
  detail: string;
}

type WordingReviewField = keyof WordingReviewInput;

export interface WordingReviewItemView {
  field: WordingReviewField;
  index: number;
  original: string;
  corrected: string;
  notes: WordingNote[];
}

export class GoalCommandService {
  constructor(
    private readonly ctx: GoalCommandContext,
    private readonly svc: GoalCommandServices,
    private readonly goalSetupPanel: GoalSetupPanel
  ) {}

  async setProjectGoal(): Promise<void> {
    await this.ctx.ensureMutablePlan("Set Project Goal");
    const planBeforePrompt = this.ctx.getPlan();
    if (!planBeforePrompt) {
      return;
    }

    const draftGoal = await this.goalSetupPanel.promptForGoal(planBeforePrompt.goals);
    if (!draftGoal) {
      return;
    }

    const reviewedWording = await this.reviewGoalWording(draftGoal);
    const goal: ProjectGoal = { ...draftGoal, ...reviewedWording };

    // Re-fetch rather than reuse planBeforePrompt: the goal form (and the
    // wording review above) is long enough for an unrelated
    // refreshPlanState() to replace the live plan object. Mutating the
    // stale reference would silently orphan the goal onto a plan that's
    // never actually saved (see PlanController's onDidCreate/isSelfWriting
    // fix for the specific trigger this guards against regardless).
    const plan = this.ctx.getPlan();
    if (!plan) {
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
    const planForPicker = this.ctx.getPlan();
    if (!planForPicker) {
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
    const draftGoal = parseGoalMarkdown(content, planForPicker.goals);
    const reviewedWording = await this.reviewGoalWording(draftGoal);
    const goal: ProjectGoal = { ...draftGoal, ...reviewedWording };

    // Re-fetch: see setProjectGoal's comment - the quick pick, file read,
    // and wording review above can straddle an unrelated plan reload.
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }
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
    const planForPrompt = this.ctx.getPlan();
    if (!planForPrompt || planForPrompt.rootTaskIds.length > 0) {
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

    // Re-fetch and re-assert: the quick pick above can run long enough for
    // the live plan to have been replaced. Each generated task below
    // references `goal.id` directly, so it would otherwise end up correctly
    // "linked" to a goal that was never actually saved onto this plan.
    const plan = this.ctx.getPlan();
    if (!plan) {
      return 0;
    }
    if (!plan.goals.some((existing) => existing.id === goal.id)) {
      plan.goals.push(goal);
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

  // Advisory wording pass over a freshly entered/imported goal: fixes
  // spelling verbatim-meaning-preserving typos (pre-checked) and flags vague,
  // unmeasurable requirement language ("fast", "secure", ...) for the user to
  // rewrite themselves (not pre-checked - there's no single objectively
  // correct replacement for vague wording). A denied consent prompt, a
  // failed/unavailable AI call, or the user dismissing the review all fall
  // through to the original, unmodified draft: this step is strictly
  // optional and must never block goal creation.
  private async reviewGoalWording(draft: WordingReviewInput): Promise<WordingReviewInput> {
    if (!(await this.svc.consentService.requestConsent("Review goal wording", [
      `Provider: ${this.svc.aiService.getSelectedProvider()}`,
      "The goal statement, success criteria, constraints, and out-of-scope text you just entered will be sent for a spelling/wording check."
    ]))) {
      return draft;
    }

    let review: WordingReviewResult;
    try {
      const response = await this.svc.aiService.generateText(buildWordingReviewPrompt(draft));
      review = parseWordingReviewResponse(response.text, draft);
    } catch {
      return draft;
    }

    const items = collectWordingReviewItems(draft, review);
    if (items.length === 0) {
      return draft;
    }

    const selected = await vscode.window.showQuickPick(
      items.map((item) => ({
        label: `${item.corrected !== item.original ? "Spelling:" : "Wording:"} ${wordingItemLabel(item)}`,
        description: item.corrected !== item.original ? "spelling fix" : "flagged as vague",
        detail: wordingItemDetail(item),
        picked: item.corrected !== item.original,
        item
      })),
      {
        canPickMany: true,
        title: "Review Wording Before Saving",
        placeHolder: "Checked items apply their spelling fix. Pick a vague-wording item to rewrite it yourself."
      }
    );

    if (!selected) {
      return draft;
    }

    let result = draft;
    for (const pick of selected) {
      const { item } = pick;
      if (item.corrected !== item.original) {
        result = applyWordingReviewItem(result, item, item.corrected);
        continue;
      }

      const rewritten = await vscode.window.showInputBox({
        prompt: `Rewrite ${wordingItemLabel(item)}: ${item.notes[0]?.reason ?? "flagged as vague"}`,
        value: item.original,
        placeHolder: item.notes[0]?.suggestion || undefined,
        ignoreFocusOut: true
      });
      if (rewritten !== undefined && rewritten.trim() && rewritten.trim() !== item.original) {
        result = applyWordingReviewItem(result, item, rewritten.trim());
      }
    }
    return result;
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

// A flagged item is included only when there's actually something for the
// user to look at: either the spelling differs, or at least one vague-
// wording note was raised. Lines the AI left untouched never appear.
export function collectWordingReviewItems(input: WordingReviewInput, review: WordingReviewResult): WordingReviewItemView[] {
  const items: WordingReviewItemView[] = [];

  const consider = (field: WordingReviewField, index: number, original: string, reviewed: { corrected: string; notes: WordingNote[] }) => {
    if (reviewed.corrected === original && reviewed.notes.length === 0) {
      return;
    }
    items.push({ field, index, original, corrected: reviewed.corrected, notes: reviewed.notes });
  };

  consider("statement", 0, input.statement, review.statement);
  input.successCriteria.forEach((text, index) => consider("successCriteria", index, text, review.successCriteria[index]));
  input.constraints.forEach((text, index) => consider("constraints", index, text, review.constraints[index]));
  input.outOfScope.forEach((text, index) => consider("outOfScope", index, text, review.outOfScope[index]));

  return items;
}

export function applyWordingReviewItem(input: WordingReviewInput, item: WordingReviewItemView, newText: string): WordingReviewInput {
  if (item.field === "statement") {
    return { ...input, statement: newText };
  }
  const next = [...input[item.field]];
  next[item.index] = newText;
  return { ...input, [item.field]: next };
}

export function wordingItemLabel(item: WordingReviewItemView): string {
  if (item.field === "statement") {
    return "Statement";
  }
  const names: Record<Exclude<WordingReviewField, "statement">, string> = {
    successCriteria: "Success criterion",
    constraints: "Constraint",
    outOfScope: "Out of scope"
  };
  return `${names[item.field]} ${item.index + 1}`;
}

export function wordingItemDetail(item: WordingReviewItemView): string {
  const parts: string[] = [];
  if (item.corrected !== item.original) {
    parts.push(`"${item.original}" → "${item.corrected}"`);
  }
  for (const note of item.notes) {
    parts.push(`⚠ "${note.phrase}": ${note.reason}${note.suggestion ? ` (e.g. "${note.suggestion}")` : ""}`);
  }
  return parts.join("  ·  ");
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
