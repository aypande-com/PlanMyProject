import * as path from "path";
import * as vscode from "vscode";
import {
  addTask,
  createTaskNode,
  deleteTask,
  getTaskBlockReason,
  isResearchLikeTask,
  markTaskStatus,
  type FileSendPolicy,
  type PlanDocument,
  type TaskBlockReason,
  type TaskNode,
  type TaskType
} from "../model/index";
import { buildImplementationPrompt, summarizeDraftTasks } from "../ai/PromptBuilder";
import { parseImplementationResponse } from "../ai/ResponseParser";
import { type AIService } from "../ai/AIService";
import { type TaskGenerator } from "../generation";
import { type ResearchIndex } from "../research";
import { type DebatePanel, type DebateService, type DebateAction } from "../debate";
import { type ScanService } from "../scanner/ScanService";
import { findLinkedFilesWithScanDelta } from "../scanner/ScanDelta";
import { type ConsentService } from "../ai/ConsentService";
import { type PlanTreeProvider } from "../ui";
import {
  createTaskIdGenerator,
  resolveFileSendPolicy,
  resolveSafeTargetPath,
  isSensitiveWorkspacePath,
  isSecretBearingPath,
  resolveStricterBooleanGate,
  resolveStricterNumberGate
} from "../util";
import { getWorkspaceRootUri, uriExists } from "../storage";

const MAX_LINKED_FILE_CONTENT_BYTES = 45_000;
const MAX_LINKED_FILES_IN_PROMPT = 8;

interface LinkedFileSnapshotResult {
  snapshots: Array<{ path: string; content: string }>;
  // P0-D2: workspace-relative paths that were refused on egress because they
  // matched a SECRET_BEARING pattern (.env*, .git/**, .vscode/**, .github/**,
  // .devcontainer/**), named so the user knows exactly what was excluded.
  refused: string[];
}

// ---------------------------------------------------------------------------
// Dependency interfaces injected by PlanController
// ---------------------------------------------------------------------------

/** Callbacks wrapping PlanController state and core plan operations. */
export interface TaskCommandContext {
  getPlan: () => PlanDocument | undefined;
  getPlanUri: () => vscode.Uri | undefined;
  ensureMutablePlan: (commandName: string) => Promise<void>;
  persistAndRefresh: () => Promise<void>;
  refreshScan: (options?: { quiet?: boolean }) => Promise<void>;
  withActiveRequest: (taskId: string, runner: (token: vscode.CancellationToken) => Promise<void>) => Promise<void>;
  buildWorkspaceSummary: () => string;
  resolveTaskFromArg: (arg: unknown) => TaskNode | undefined;
  getConfiguration: () => vscode.WorkspaceConfiguration;
}

/** Stateful services owned and passed by PlanController. */
export interface TaskCommandServices {
  aiService: AIService;
  taskGenerator: TaskGenerator;
  researchIndex: ResearchIndex;
  debatePanel: DebatePanel;
  debateService: DebateService;
  scanService: ScanService;
  consentService: ConsentService;
  treeProvider: PlanTreeProvider;
}

// ---------------------------------------------------------------------------
// TaskCommandService
// ---------------------------------------------------------------------------

export class TaskCommandService {
  constructor(
    private readonly ctx: TaskCommandContext,
    private readonly svc: TaskCommandServices
  ) {}

  async addTask(arg: unknown, forceRoot: boolean): Promise<void> {
    await this.ctx.ensureMutablePlan("Add Task");
    const plan = this.ctx.getPlan();
    if (!plan || !this.ctx.getPlanUri()) {
      return;
    }

    const type = await this.promptTaskType();
    if (!type) {
      return;
    }

    const title = await vscode.window.showInputBox({
      prompt: forceRoot ? "Add root task" : "Add task",
      placeHolder: "Describe the task"
    });

    if (!title?.trim()) {
      return;
    }

    const parent = forceRoot ? undefined : this.ctx.resolveTaskFromArg(arg);
    const createId = createTaskIdGenerator(plan);
    const task = createTaskNode({
      id: createId(),
      title: title.trim(),
      type,
      parentId: parent?.id ?? null,
      origin: "manual",
      goalRef: parent?.goalRef ?? plan.goals[0]?.id ?? null,
      fileSendPolicy: this.ctx.getConfiguration().get<FileSendPolicy>("defaultTaskFileSendPolicy", "global")
    });

    addTask(plan, task);
    await this.ctx.persistAndRefresh();
  }

  async planTask(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Plan Task");
    const plan = this.ctx.getPlan();
    if (!plan || !this.ctx.getPlanUri()) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task) {
      void vscode.window.showWarningMessage("No task selected. Place cursor on a task line or run from task context menu.");
      return;
    }

    if (!(await this.svc.consentService.requestConsent(`Plan task ${task.id}`, [
      `Task: [${task.id}] ${task.title}`,
      `Provider: ${this.svc.aiService.getSelectedProvider()}`,
      "Workspace scan summary and research index entries may be sent."
    ]))) {
      return;
    }

    const mode = await this.promptPlanningMode(task);
    if (!mode) {
      return;
    }

    if (!this.svc.scanService.isFresh()) {
      await this.ctx.refreshScan({ quiet: true });
    }

    const knowledge = await this.svc.researchIndex.queryRelevant({
      taskTitle: task.title,
      goalStatement: plan.goals.find((goal) => goal.id === task.goalRef)?.statement,
      topN: 5
    });

    await this.ctx.withActiveRequest(task.id, async (token) => {
      const output = await this.svc.taskGenerator.generate({
        plan: plan as PlanDocument,
        parent: task,
        scan: this.svc.scanService.getScan(),
        knowledge,
        confidenceThreshold: resolveStricterNumberGate(this.ctx.getConfiguration(), "confidenceThreshold", 0.5),
        includeSignatures: this.ctx.getConfiguration().get<boolean>("scanner.extractSignatures", true),
        onChunk: async () => {
          this.svc.treeProvider.setRequestStatus({
            taskId: task.id,
            detail: "Streaming plan...",
            state: "running"
          });
          if (token.isCancellationRequested) {
            throw new Error("Cancelled");
          }
        }
      });

      let draftsToCommit = output.accepted;
      if (output.requiresReview.length > 0) {
        const decision = await vscode.window.showQuickPick(
          [
            { label: "Commit accepted tasks only", value: "accepted" as const },
            { label: "Include low-confidence tasks", value: "all" as const },
            { label: "Cancel", value: "cancel" as const }
          ],
          {
            placeHolder: `${output.requiresReview.length} low-confidence task(s) generated. Choose commit strategy.`
          }
        );

        if (!decision || decision.value === "cancel") {
          throw new Error("Cancelled");
        }

        if (decision.value === "all") {
          draftsToCommit = output.drafts;
        }
      }

      if (mode === "replace") {
        for (const childId of [...task.children]) {
          deleteTask(plan as PlanDocument, childId);
        }
        task.children = [];
      }

      const materialized = this.svc.taskGenerator.materializeDrafts(plan as PlanDocument, task, draftsToCommit);
      for (const created of materialized) {
        addTask(plan as PlanDocument, created);
      }

      // recomputeDerivedStatuses is called inside persistAndRefresh → serializePlanMarkdown,
      // and the result is reflected back via parsePlanMarkdown. No separate call needed here.
      await this.ctx.persistAndRefresh();

      void vscode.window.showInformationMessage(
        `Generated ${materialized.length} child task(s) for ${task.id}.\n${summarizeDraftTasks(draftsToCommit)}`
      );
    });
  }

  // P4-B2: TaskNode.origin has always supported "code-inferred" but nothing
  // ever produced one - TaskGenerator.materializeDrafts hardcoded
  // "ai-generated" regardless of caller, and there was no command that
  // generated tasks from a scan rather than an interactive planning
  // conversation. This reuses the same TaskGenerator pipeline as planTask
  // (confidence threshold, low-confidence review prompt, materialization)
  // with knowledge deliberately empty (this is about what the code reveals,
  // not prior research conclusions) and always appends rather than offering
  // replace/refine - it is the CodeLens "Scan" action's secondary option, a
  // lighter-weight action than Plan Task, so it should never be destructive.
  async inferTasksFromScan(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Infer Tasks From Scan");
    const plan = this.ctx.getPlan();
    if (!plan || !this.ctx.getPlanUri()) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task) {
      void vscode.window.showWarningMessage("No task selected. Place cursor on a task line or run from task context menu.");
      return;
    }

    if (!(await this.svc.consentService.requestConsent(`Infer tasks from scan for ${task.id}`, [
      `Task: [${task.id}] ${task.title}`,
      `Provider: ${this.svc.aiService.getSelectedProvider()}`,
      "Workspace scan signatures for this task's linked files may be sent."
    ]))) {
      return;
    }

    await this.svc.scanService.refreshForTask(task);

    await this.ctx.withActiveRequest(task.id, async (token) => {
      const output = await this.svc.taskGenerator.generate({
        plan: plan as PlanDocument,
        parent: task,
        scan: this.svc.scanService.getScan(),
        knowledge: [],
        confidenceThreshold: resolveStricterNumberGate(this.ctx.getConfiguration(), "confidenceThreshold", 0.5),
        includeSignatures: this.ctx.getConfiguration().get<boolean>("scanner.extractSignatures", true),
        onChunk: async () => {
          this.svc.treeProvider.setRequestStatus({
            taskId: task.id,
            detail: "Inferring tasks from scan...",
            state: "running"
          });
          if (token.isCancellationRequested) {
            throw new Error("Cancelled");
          }
        }
      });

      let draftsToCommit = output.accepted;
      if (output.requiresReview.length > 0) {
        const decision = await vscode.window.showQuickPick(
          [
            { label: "Commit accepted tasks only", value: "accepted" as const },
            { label: "Include low-confidence tasks", value: "all" as const },
            { label: "Cancel", value: "cancel" as const }
          ],
          {
            placeHolder: `${output.requiresReview.length} low-confidence task(s) inferred. Choose commit strategy.`
          }
        );

        if (!decision || decision.value === "cancel") {
          throw new Error("Cancelled");
        }

        if (decision.value === "all") {
          draftsToCommit = output.drafts;
        }
      }

      const materialized = this.svc.taskGenerator.materializeDrafts(plan as PlanDocument, task, draftsToCommit, "code-inferred");
      for (const created of materialized) {
        addTask(plan as PlanDocument, created);
      }

      await this.ctx.persistAndRefresh();

      void vscode.window.showInformationMessage(
        `Inferred ${materialized.length} child task(s) for ${task.id} from scan.\n${summarizeDraftTasks(draftsToCommit)}`
      );
    });
  }

  async implementTask(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Implement Task");
    const plan = this.ctx.getPlan();
    if (!plan || !this.ctx.getPlanUri()) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task) {
      void vscode.window.showWarningMessage("No task selected.");
      return;
    }
    if (task.type !== "implementation") {
      void vscode.window.showWarningMessage(`Task ${task.id} is ${task.type}. Only implementation tasks can run Implement Task.`);
      return;
    }

    const researchGate = resolveStricterBooleanGate(this.ctx.getConfiguration(), "researchGate", true);
    const blockReason = getTaskBlockReason(plan, task.id, researchGate);
    if (blockReason) {
      void vscode.window.showWarningMessage(describeTaskBlockMessage(task.id, blockReason));
      return;
    }

    const ancestorChain = this.collectAncestorChain(plan, task.id);
    const conclusions = this.collectResearchConclusions(plan, task);
    const { snapshots: linkedSnapshots, refused: refusedLinkedFiles } = await this.collectLinkedFileSnapshots(task);

    if (refusedLinkedFiles.length > 0) {
      void vscode.window.showWarningMessage(
        `Task ${task.id}: refused to send ${refusedLinkedFiles.length} sensitive linked file(s) to AI: ${refusedLinkedFiles.join(", ")}`
      );
    }

    const prompt = buildImplementationPrompt({
      task,
      ancestors: ancestorChain,
      linkedFileSnapshots: linkedSnapshots,
      researchConclusions: conclusions
    });

    if (!(await this.svc.consentService.requestConsent(`Implement task ${task.id}`, [
      `Task: [${task.id}] ${task.title}`,
      `Provider: ${this.svc.aiService.getSelectedProvider()}`,
      `Linked files included: ${linkedSnapshots.length}`,
      ...(refusedLinkedFiles.length > 0 ? [`Linked files refused (sensitive): ${refusedLinkedFiles.join(", ")}`] : [])
    ]))) {
      return;
    }

    await this.ctx.withActiveRequest(task.id, async (token) => {
      // P4-B1: snapshotted before the write so it can be diffed against the
      // post-implement rescan below - this is what lets a scan delta on
      // task.linkedFiles corroborate completion when the AI's own
      // taskCompleted flag says otherwise.
      const preScan = this.svc.scanService.getScan();

      const response = await this.svc.aiService.generateText(prompt, {
        cancellationToken: token,
        onChunk: async () => {
          this.svc.treeProvider.setRequestStatus({
            taskId: task.id,
            detail: "Receiving implementation...",
            state: "running"
          });
        }
      });

      const parsed = parseImplementationResponse(response.text);

      const sensitiveTargets = parsed.changes
        .map((change) => change.path)
        .filter((filePath) => isSensitiveWorkspacePath(filePath));

      if (sensitiveTargets.length > 0) {
        const approval = await vscode.window.showWarningMessage(
          `AI output includes ${sensitiveTargets.length} sensitive file(s). Apply anyway?`,
          { modal: true },
          "Apply"
        );
        if (approval !== "Apply") {
          throw new Error("Cancelled");
        }
      }

      const shouldProceed = await this.confirmWriteToCompleteFiles(parsed.changes.map((change) => change.path));
      if (!shouldProceed) {
        throw new Error("Cancelled");
      }

      const root = getWorkspaceRootUri();
      for (const change of parsed.changes) {
        const targetPath = await resolveSafeTargetPath(root.fsPath, change.path);
        const targetUri = vscode.Uri.file(targetPath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetPath)));
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(change.content, "utf8"));
      }

      markTaskStatus(plan as PlanDocument, task.id, parsed.taskCompleted ? "done" : "in-progress");
      await this.ctx.persistAndRefresh();

      if (this.ctx.getConfiguration().get<boolean>("autoRescanOnImplement", true)) {
        await this.ctx.refreshScan({ quiet: true });

        // P4-B1: only relevant when the AI's own report left the task
        // in-progress - if taskCompleted already marked it done above, a
        // second confirmation for the same outcome is just noise.
        if (!parsed.taskCompleted && task.linkedFiles.length > 0) {
          const postScan = this.svc.scanService.getScan();
          const changedLinkedFiles = findLinkedFilesWithScanDelta(preScan, postScan, task.linkedFiles);
          if (changedLinkedFiles.length > 0) {
            const confirmation = await vscode.window.showInformationMessage(
              `Scan detected changes to linked file(s) for ${task.id}: ${changedLinkedFiles.join(", ")}. Mark ${task.id} complete?`,
              "Mark Complete",
              "Not Yet"
            );
            if (confirmation === "Mark Complete") {
              markTaskStatus(plan as PlanDocument, task.id, "done");
              await this.ctx.persistAndRefresh();
            }
          }
        }
      }

      void vscode.window.showInformationMessage(`Implemented ${task.id}: wrote ${parsed.changes.length} file(s).`);
    });
  }

  async deleteTask(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Delete Task");
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    const approval = await vscode.window.showWarningMessage(
      `Delete task ${task.id} and all descendants?`,
      { modal: true },
      "Delete"
    );

    if (approval !== "Delete") {
      return;
    }

    deleteTask(plan, task.id);
    await this.ctx.persistAndRefresh();
  }

  async debateTask(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Debate Task");
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    if (!this.svc.scanService.isFresh()) {
      await this.ctx.refreshScan({ quiet: true });
    }

    const summary = this.ctx.buildWorkspaceSummary();
    this.svc.debatePanel.show(task, summary, {
      onUserMessage: async (message) => {
        await this.svc.debateService.appendEntry(task, { role: "user", content: message });
        const response = await this.svc.debateService.continueDebate(task, message, summary);
        await this.svc.debateService.appendEntry(task, { role: "ai", content: response.content });
        this.svc.debatePanel.postAssistantMessage(response.content);
        await this.ctx.persistAndRefresh();
      },
      onAction: async (action) => {
        await this.handleDebateAction(task, action, summary);
      }
    });

    if (task.debateLog.length === 0) {
      const opening = await this.svc.debateService.generateOpening(task, summary);
      await this.svc.debateService.appendEntry(task, { role: "ai", content: opening.content });
      this.svc.debatePanel.postAssistantMessage(opening.content);
      await this.ctx.persistAndRefresh();
    }
  }

  async markResearchComplete(arg: unknown): Promise<void> {
    await this.ctx.ensureMutablePlan("Mark Research Complete");
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    const task = this.ctx.resolveTaskFromArg(arg);
    if (!task || !isResearchLikeTask(task.type)) {
      void vscode.window.showWarningMessage("Select a research or decision task to complete.");
      return;
    }

    const conclusion = await vscode.window.showInputBox({
      prompt: `Record your finding/decision for ${task.id}`,
      placeHolder: "Decided: use pdfkit v4.0.2"
    });

    if (!conclusion?.trim()) {
      return;
    }

    task.notes = conclusion.trim();
    markTaskStatus(plan, task.id, "done");
    await this.svc.researchIndex.appendFromTask(task, conclusion.trim());

    await this.ctx.persistAndRefresh();
    void vscode.window.showInformationMessage(`✓ Research indexed: ${task.id}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async handleDebateAction(task: TaskNode, action: DebateAction, workspaceSummary: string): Promise<void> {
    const plan = this.ctx.getPlan();
    if (!plan) {
      return;
    }

    if (action === "rewrite") {
      const nextTitle = await vscode.window.showInputBox({ prompt: `Rewrite title for ${task.id}`, value: task.title });
      if (!nextTitle?.trim()) {
        return;
      }

      const rewrittenRationale = await this.svc.debateService.regenerateRationale(task, nextTitle, workspaceSummary);
      const result = await this.svc.debateService.applyAction(plan, task, action, {
        rewriteTitle: nextTitle,
        rewrittenRationale
      });
      if (result.changed) {
        await this.ctx.persistAndRefresh();
      }
      void vscode.window.showInformationMessage(result.message);
      return;
    }

    if (action === "split") {
      // Ask intent first — only fire an AI call when the user explicitly requests suggestions.
      const intentPick = await vscode.window.showQuickPick(
        [
          { label: "Get AI suggestions", value: "ai" as const },
          { label: "Enter titles manually", value: "manual" as const }
        ],
        { placeHolder: `How would you like to split ${task.id}?` }
      );
      if (!intentPick) {
        return;
      }

      let splitTitles: string[] = [];

      if (intentPick.value === "ai") {
        const suggestedTitles = await this.svc.debateService.suggestSplitTitles(task, workspaceSummary);
        if (suggestedTitles.length > 0) {
          const picked = await vscode.window.showQuickPick(
            suggestedTitles.map((title) => ({ label: title })),
            { canPickMany: true, placeHolder: `Select split tasks for ${task.id}` }
          );
          if (!picked) {
            return;
          }
          splitTitles = picked.map((item) => item.label);
        }
      }

      if (splitTitles.length === 0) {
        const titlesText = await vscode.window.showInputBox({
          prompt: `Split ${task.id} into 2-4 tasks (comma-separated titles)`,
          placeHolder: "Research API contract, Implement API handler, Add tests"
        });
        if (!titlesText?.trim()) {
          return;
        }
        splitTitles = titlesText.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
      }

      const result = await this.svc.debateService.applyAction(plan, task, action, { splitTitles });
      if (result.changed) {
        await this.ctx.persistAndRefresh();
      }
      void vscode.window.showInformationMessage(result.message);
      return;
    }

    const result = await this.svc.debateService.applyAction(plan, task, action);
    if (result.changed) {
      await this.ctx.persistAndRefresh();
    }
    void vscode.window.showInformationMessage(result.message);
  }

  private collectAncestorChain(plan: PlanDocument, taskId: string): TaskNode[] {
    const chain: TaskNode[] = [];
    let current: TaskNode | undefined = plan.tasks[taskId];
    while (current) {
      chain.unshift(current);
      current = current.parentId ? plan.tasks[current.parentId] : undefined;
    }
    return chain;
  }

  private collectResearchConclusions(plan: PlanDocument, task: TaskNode): string[] {
    const result: string[] = [];
    for (const depId of task.dependsOn) {
      const dep = plan.tasks[depId];
      if (dep && dep.status === "done" && dep.notes) {
        result.push(`${dep.id}: ${dep.notes}`);
      }
    }

    if (task.parentId) {
      const parent = plan.tasks[task.parentId];
      if (parent) {
        for (const siblingId of parent.children) {
          const sibling = plan.tasks[siblingId];
          if (!sibling || sibling.id === task.id) {
            continue;
          }
          if (isResearchLikeTask(sibling.type) && sibling.status === "done" && sibling.notes) {
            result.push(`${sibling.id}: ${sibling.notes}`);
          }
        }
      }
    }

    return result;
  }

  private async collectLinkedFileSnapshots(task: TaskNode): Promise<LinkedFileSnapshotResult> {
    const root = getWorkspaceRootUri();
    const config = this.ctx.getConfiguration();
    const resolvedPolicy = resolveFileSendPolicy(task.fileSendPolicy, config.get<boolean>("sendFileContentsToAI", false));

    if (resolvedPolicy === "dont-send") {
      return { snapshots: [], refused: [] };
    }

    if (resolvedPolicy === "ask") {
      const approval = await vscode.window.showWarningMessage(
        `Task ${task.id} is set to ask before sending linked file contents. Send linked files to AI?`,
        "Send",
        "Skip"
      );
      if (approval !== "Send") {
        return { snapshots: [], refused: [] };
      }
    }

    // P0-D2: SECRET_BEARING paths (.env*, .git/**, .vscode/**, .github/**,
    // .devcontainer/**) are refused outright on egress, with no override -
    // unlike the write-path check below (which still warns-and-allows for the
    // BUILD_METADATA class via isSensitiveWorkspacePath), a file that might
    // contain a live secret should never leave the workspace just because it
    // was added to linkedFiles, deliberately or by an imported/AI-suggested
    // plan.
    const snapshots: Array<{ path: string; content: string }> = [];
    const refused: string[] = [];
    const paths = task.linkedFiles.slice(0, MAX_LINKED_FILES_IN_PROMPT);
    for (const relativePath of paths) {
      if (isSecretBearingPath(relativePath)) {
        refused.push(relativePath);
        continue;
      }

      const uri = vscode.Uri.joinPath(root, ...relativePath.split("/"));
      if (!(await uriExists(uri))) {
        continue;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString("utf8").slice(0, MAX_LINKED_FILE_CONTENT_BYTES);
      snapshots.push({ path: relativePath, content });
    }

    return { snapshots, refused };
  }

  private async confirmWriteToCompleteFiles(paths: string[]): Promise<boolean> {
    const scan = this.svc.scanService.getScan();
    if (!scan || paths.length === 0) {
      return true;
    }

    const completeFiles = new Set(
      scan.modules
        .filter((module) => module.estimatedCompletion === "complete")
        .flatMap((module) => module.files.map((file) => file.replace(/\\/g, "/").toLowerCase()))
    );
    if (completeFiles.size === 0) {
      return true;
    }

    const overwrites = paths
      .map((item) => item.replace(/\\/g, "/").toLowerCase())
      .filter((item) => completeFiles.has(item));
    if (overwrites.length === 0) {
      return true;
    }

    const preview = overwrites.slice(0, 3).join(", ");
    const extra = overwrites.length > 3 ? ` (+${overwrites.length - 3} more)` : "";
    const decision = await vscode.window.showWarningMessage(
      `AI output will overwrite ${overwrites.length} file(s) currently marked complete by scan: ${preview}${extra}. Continue?`,
      { modal: true },
      "Apply"
    );
    return decision === "Apply";
  }

  private async promptTaskType(): Promise<TaskType | undefined> {
    const selected = await vscode.window.showQuickPick(
      [
        { label: "Implementation", value: "implementation" as const },
        { label: "Research", value: "research" as const },
        { label: "Decision", value: "decision" as const },
        { label: "Milestone", value: "milestone" as const }
      ],
      { placeHolder: "Select task type" }
    );

    return selected?.value;
  }

  private async promptPlanningMode(task: TaskNode): Promise<"replace" | "refine" | undefined> {
    if (task.children.length === 0) {
      return "replace";
    }

    const selected = await vscode.window.showQuickPick(
      [
        { label: "Refine existing children", value: "refine" as const },
        { label: "Replace existing children", value: "replace" as const }
      ],
      { placeHolder: `Task ${task.id} already has children.` }
    );
    return selected?.value;
  }
}

// ---------------------------------------------------------------------------
// Module-level pure helper (exported for testability)
// ---------------------------------------------------------------------------

export function describeTaskBlockMessage(taskId: string, reason: TaskBlockReason): string {
  if (reason === "dependency") {
    return `Task ${taskId} is blocked by unresolved dependencies.`;
  }
  if (reason === "research-gate") {
    return `Task ${taskId} is blocked by unresolved sibling research or decision tasks.`;
  }
  return `Task ${taskId} is blocked until the debate thread is resolved.`;
}
