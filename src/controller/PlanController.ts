import * as path from "path";
import * as vscode from "vscode";
import {
  addTask,
  createTaskNode,
  deleteTask,
  getTaskBlockReason,
  isResearchLikeTask,
  markTaskStatus,
  recomputeDerivedStatuses,
  type FileSendPolicy,
  type PlanDocument,
  type TaskBlockReason,
  type TaskNode,
  type TaskType
} from "../model/index";
import { parsePlanMarkdown, upgradeSchemaV1ToV2 } from "../parser";
import { PlanRepository, findPlanUris, getGitUserName, getWorkspaceRootUri, hasOpenWorkspace, readTextFile, uriExists } from "../storage";
import { buildImplementationPrompt, summarizeDraftTasks } from "../ai/PromptBuilder";
import { parseImplementationResponse } from "../ai/ResponseParser";
import { AIService } from "../ai/AIService";
import { TaskGenerator } from "../generation";
import { ResearchIndex } from "../research";
import { DebateArchiver, DebatePanel, DebateService, type DebateAction } from "../debate";
import { createTaskIdGenerator, resolveFileSendPolicy, resolveSafeTargetPath, isSensitiveWorkspacePath } from "../util";
import { GoalSetupPanel, PlanStatusBar, PlanTreeProvider } from "../ui";
import { ScanService } from "../scanner/ScanService";
import { ConsentService } from "../ai/ConsentService";
import { GoalCommandService } from "./GoalCommandService";

const ACTIVE_REQUEST_CLEAR_MS = 2200;
const MAX_LINKED_FILE_CONTENT_BYTES = 45_000;
const MAX_LINKED_FILES_IN_PROMPT = 8;

export interface TaskCommandRef {
  taskId?: string;
  fileUri?: vscode.Uri;
}

export class PlanController implements vscode.Disposable {
  private readonly repository: PlanRepository;
  private readonly aiService: AIService;
  private readonly taskGenerator: TaskGenerator;
  private readonly researchIndex: ResearchIndex;
  private readonly statusBar = new PlanStatusBar();
  private readonly treeProvider = new PlanTreeProvider();
  private readonly debatePanel: DebatePanel;
  private readonly debateService: DebateService;
  private readonly outputChannel = vscode.window.createOutputChannel("PlanMyProject");
  private readonly scanService: ScanService;
  private readonly consentService: ConsentService;
  private readonly goalCommandService: GoalCommandService;

  private planUri: vscode.Uri | undefined;
  private plan: PlanDocument | undefined;

  private activeRequest: vscode.CancellationTokenSource | undefined;
  private readonly warnedDebateConflicts = new Set<string>();
  private isSelfWriting = false;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = this.getConfiguration();
    this.repository = new PlanRepository(config.get<string>("planFileName", "planmyproject.md"));
    this.aiService = new AIService(context);
    this.taskGenerator = new TaskGenerator(this.aiService);
    this.researchIndex = new ResearchIndex();
    this.debatePanel = new DebatePanel(context.extensionUri);
    this.debateService = new DebateService(this.aiService, async () => getGitUserName());
    this.scanService = new ScanService(
      context,
      () => this.getConfiguration(),
      this.treeProvider,
      this.statusBar,
      () => this.plan?.goals ?? []
    );
    this.consentService = new ConsentService(() => this.getConfiguration());
    this.goalCommandService = new GoalCommandService(
      {
        getPlan: () => this.plan,
        ensureMutablePlan: (name) => this.ensureMutablePlan(name),
        persistAndRefresh: () => this.persistAndRefresh(),
        getConfiguration: () => this.getConfiguration()
      },
      new GoalSetupPanel()
    );
  }

  async activate(): Promise<void> {
    this.context.subscriptions.push(
      this.treeProvider,
      this.statusBar,
      vscode.window.registerTreeDataProvider("planmyproject.tree", this.treeProvider),
      vscode.languages.registerCodeLensProvider(
        { scheme: "file", pattern: `**/${this.getConfiguration().get<string>("planFileName", "planmyproject.md")}` },
        new (await import("../ui/CodeLensProvider")).PlanCodeLensProvider()
      )
    );

    this.registerCommands();
    this.registerWatchers();

    await this.scanService.loadCached();

    await this.refreshPlanState();
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.statusBar.dispose();
    this.outputChannel.dispose();
  }

  private registerCommands(): void {
    const register = (command: string, handler: (arg?: unknown) => Promise<void>): void => {
      const disposable = vscode.commands.registerCommand(command, async (arg?: unknown) => {
        if (!hasOpenWorkspace()) {
          void vscode.window.showWarningMessage("PlanMyProject requires an open folder or workspace.");
          return;
        }

        try {
          await handler(arg);
        } catch (error) {
          void vscode.window.showErrorMessage(this.toErrorMessage(error));
        }
      });
      this.context.subscriptions.push(disposable);
    };

    register("planmyproject.openPlan", async () => this.openPlan());
    register("planmyproject.planTask", async (arg) => this.planTask(arg));
    register("planmyproject.addTask", async (arg) => this.addTask(arg, false));
    register("planmyproject.addRootTask", async () => this.addTask(undefined, true));
    register("planmyproject.drillDown", async (arg) => this.drillDown(arg));
    register("planmyproject.implementTask", async (arg) => this.implementTask(arg));
    register("planmyproject.deleteTask", async (arg) => this.deleteTask(arg));
    register("planmyproject.rebuildQueue", async () => this.persistAndRefresh());
    register("planmyproject.refreshTree", async () => this.refreshPlanState());
    register("planmyproject.cancelActiveRequest", async () => this.cancelActiveRequest());

    register("planmyproject.setProjectGoal", async () => this.goalCommandService.setProjectGoal());
    register("planmyproject.refreshScan", async () => this.refreshScan());
    register("planmyproject.debateTask", async (arg) => this.debateTask(arg));
    register("planmyproject.markResearchComplete", async (arg) => this.markResearchComplete(arg));
    register("planmyproject.showTaskRationale", async (arg) => this.showTaskRationale(arg));
    register("planmyproject.viewLinkedFiles", async (arg) => this.viewLinkedFiles(arg));
    register("planmyproject.importGoalStatement", async () => this.goalCommandService.importGoalStatement());
    register("planmyproject.exportPlanSummary", async () => this.exportPlanSummary());
    register("planmyproject.viewResearchIndex", async () => this.viewResearchIndex());
    register("planmyproject.viewDebateArchive", async (arg) => this.viewDebateArchive(arg));
    register("planmyproject.setTaskFileSendPolicy", async (arg) => this.setTaskFileSendPolicy(arg));
    register("planmyproject.scanTask", async (arg) => this.scanTask(arg));
  }

  private registerWatchers(): void {
    const planFileName = this.getConfiguration().get<string>("planFileName", "planmyproject.md");
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${planFileName}`);
    // Note: onDidChangeActiveTextEditor is intentionally NOT subscribed here.
    // The plan stays current via the file-system watcher (onDidChange/Create/Delete)
    // and the onDidSaveTextDocument handler below. Switching editor tabs must not
    // trigger a re-parse — it causes redundant I/O and interferes with streaming.
    this.context.subscriptions.push(
      watcher,
      watcher.onDidCreate(async () => this.refreshPlanState()),
      watcher.onDidChange(async () => {
        if (this.isSelfWriting) {
          return;
        }
        await this.refreshPlanState();
      }),
      watcher.onDidDelete(async () => this.refreshPlanState()),
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (this.isSelfWriting) {
          return;
        }
        // Fast path: planUri is already known — compare directly, no filesystem call.
        if (this.planUri) {
          if (document.uri.toString() === this.planUri.toString()) {
            await this.refreshPlanState();
          }
          return;
        }
        // Cold-start fallback: planUri not yet resolved, check filesystem once.
        const planUris = await findPlanUris();
        if (planUris.some((uri) => uri.toString() === document.uri.toString())) {
          await this.refreshPlanState();
        }
      })
    );
  }

  private async openPlan(): Promise<void> {
    const uri = await this.repository.ensurePlanFile();
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await this.refreshPlanState();

    if (!this.scanService.getScan()) {
      await this.refreshScan({ quiet: true });
    }
  }

  private async refreshPlanState(): Promise<void> {
    const loaded = await this.repository.loadPlan();
    this.planUri = loaded.uri;
    this.warnDebateConflicts(loaded.parsed.debateConflicts);

    if (loaded.parsed.schemaVersion === "v1") {
      const migrated = await this.tryMigrateV1(loaded.uri);
      if (!migrated) {
        this.plan = loaded.parsed.plan;
      }
    } else {
      this.plan = loaded.parsed.plan;
    }

    this.render();
  }

  private async tryMigrateV1(uri: vscode.Uri): Promise<boolean> {
    const shouldMigrate = await vscode.window.showInformationMessage(
      "PlanMyProject v2 detected a v1 plan file. Migrate now?",
      "Migrate",
      "Keep v1 (read-only)"
    );

    if (shouldMigrate !== "Migrate") {
      return false;
    }

    const before = await readTextFile(uri);
    await this.repository.createV1Backup(uri, before);
    const parsed = parsePlanMarkdown(before);
    const migration = upgradeSchemaV1ToV2(parsed.plan);
    await this.repository.savePlan(uri, migration.upgraded, {
      researchGate: this.getConfiguration().get<boolean>("researchGate", true),
      showRationaleInline: this.getConfiguration().get<boolean>("showRationaleInline", true)
    });

    this.plan = migration.upgraded;
    void vscode.window.showInformationMessage("Migrated plan file to schema v2.");
    return true;
  }

  private render(): void {
    if (!this.plan) {
      return;
    }

    const researchGate = this.getConfiguration().get<boolean>("researchGate", true);
    this.treeProvider.setPlan(this.plan, this.planUri, researchGate);
    this.treeProvider.setWorkspaceScan(this.scanService.getScan());
    this.statusBar.setMissingGoal(this.plan.goals.length === 0);
    this.statusBar.setScanTimestamp(this.scanService.getScan()?.scannedAt);

    void vscode.commands.executeCommand("setContext", "planmyproject.workspaceOpen", hasOpenWorkspace());
    void vscode.commands.executeCommand("setContext", "planmyproject.treeEmpty", this.plan.rootTaskIds.length === 0);
  }

  private async addTask(arg: unknown, forceRoot: boolean): Promise<void> {
    await this.ensureMutablePlan("Add Task");
    if (!this.plan || !this.planUri) {
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

    const parent = forceRoot ? undefined : this.resolveTaskFromArg(arg);
    const createId = createTaskIdGenerator(this.plan);
    const task = createTaskNode({
      id: createId(),
      title: title.trim(),
      type,
      parentId: parent?.id ?? null,
      origin: "manual",
      goalRef: parent?.goalRef ?? this.plan.goals[0]?.id ?? null,
      fileSendPolicy: this.getConfiguration().get<FileSendPolicy>("defaultTaskFileSendPolicy", "global")
    });

    addTask(this.plan, task);
    await this.persistAndRefresh();
  }

  private async drillDown(arg: unknown): Promise<void> {
    if (!this.planUri || !this.plan) {
      await this.refreshPlanState();
    }
    if (!this.planUri || !this.plan) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    const doc = await vscode.workspace.openTextDocument(this.planUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const line = Math.max(0, task.line ?? 0);
    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  private async planTask(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Plan Task");
    if (!this.plan || !this.planUri) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      void vscode.window.showWarningMessage("No task selected. Place cursor on a task line or run from task context menu.");
      return;
    }

    if (!(await this.consentService.requestConsent(`Plan task ${task.id}`, [
      `Task: [${task.id}] ${task.title}`,
      `Provider: ${this.aiService.getSelectedProvider()}`,
      "Workspace scan summary and research index entries may be sent."
    ]))) {
      return;
    }

    const mode = await this.promptPlanningMode(task);
    if (!mode) {
      return;
    }

    if (!this.scanService.isFresh()) {
      await this.refreshScan({ quiet: true });
    }

    const knowledge = await this.researchIndex.queryRelevant({
      taskTitle: task.title,
      goalStatement: this.plan.goals.find((goal) => goal.id === task.goalRef)?.statement,
      topN: 5
    });

    await this.withActiveRequest(task.id, async (token) => {
      const output = await this.taskGenerator.generate({
        plan: this.plan as PlanDocument,
        parent: task,
        scan: this.scanService.getScan(),
        knowledge,
        confidenceThreshold: this.getConfiguration().get<number>("confidenceThreshold", 0.5),
        includeSignatures: this.getConfiguration().get<boolean>("scanner.extractSignatures", true),
        onChunk: async () => {
          this.treeProvider.setRequestStatus({
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
          deleteTask(this.plan as PlanDocument, childId);
        }
        task.children = [];
      }

      const materialized = this.taskGenerator.materializeDrafts(this.plan as PlanDocument, task, draftsToCommit);
      for (const created of materialized) {
        addTask(this.plan as PlanDocument, created);
      }

      // recomputeDerivedStatuses is called inside persistAndRefresh → serializePlanMarkdown,
      // and the result is reflected back via parsePlanMarkdown. No separate call needed here.
      await this.persistAndRefresh();

      void vscode.window.showInformationMessage(
        `Generated ${materialized.length} child task(s) for ${task.id}.\n${summarizeDraftTasks(draftsToCommit)}`
      );
    });
  }

  private async implementTask(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Implement Task");
    if (!this.plan || !this.planUri) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      void vscode.window.showWarningMessage("No task selected.");
      return;
    }
    if (task.type !== "implementation") {
      void vscode.window.showWarningMessage(`Task ${task.id} is ${task.type}. Only implementation tasks can run Implement Task.`);
      return;
    }

    const researchGate = this.getConfiguration().get<boolean>("researchGate", true);
    const blockReason = getTaskBlockReason(this.plan, task.id, researchGate);
    if (blockReason) {
      void vscode.window.showWarningMessage(describeTaskBlockMessage(task.id, blockReason));
      return;
    }

    const ancestorChain = this.collectAncestorChain(task.id);
    const conclusions = this.collectResearchConclusions(task);

    const linkedSnapshots = await this.collectLinkedFileSnapshots(task);
    const prompt = buildImplementationPrompt({
      task,
      ancestors: ancestorChain,
      linkedFileSnapshots: linkedSnapshots,
      researchConclusions: conclusions
    });

    if (!(await this.consentService.requestConsent(`Implement task ${task.id}`, [
      `Task: [${task.id}] ${task.title}`,
      `Provider: ${this.aiService.getSelectedProvider()}`,
      `Linked files included: ${linkedSnapshots.length}`
    ]))) {
      return;
    }

    await this.withActiveRequest(task.id, async (token) => {
      const response = await this.aiService.generateText(prompt, {
        cancellationToken: token,
        onChunk: async () => {
          this.treeProvider.setRequestStatus({
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

      markTaskStatus(this.plan as PlanDocument, task.id, parsed.taskCompleted ? "done" : "in-progress");
      await this.persistAndRefresh();

      if (this.getConfiguration().get<boolean>("autoRescanOnImplement", true)) {
        await this.refreshScan({ quiet: true });
      }

      void vscode.window.showInformationMessage(`Implemented ${task.id}: wrote ${parsed.changes.length} file(s).`);
    });
  }

  private async deleteTask(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Delete Task");
    if (!this.plan) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
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

    deleteTask(this.plan, task.id);
    await this.persistAndRefresh();
  }

  private async cancelActiveRequest(): Promise<void> {
    if (!this.activeRequest) {
      return;
    }
    this.activeRequest.cancel();
    this.activeRequest.dispose();
    this.activeRequest = undefined;
    this.statusBar.setActiveRequest(false);
    this.treeProvider.setRequestStatus(undefined);
    void vscode.window.showInformationMessage("Cancelled active AI request.");
  }

  private async refreshScan(options?: { quiet?: boolean }): Promise<void> {
    if (!this.plan) {
      await this.refreshPlanState();
    }
    await this.scanService.refresh(options);
  }

  private async scanTask(arg: unknown): Promise<void> {
    if (!this.plan) {
      await this.refreshPlanState();
    }
    const task = this.resolveTaskFromArg(arg);

    // No task or no linked files → full workspace scan.
    if (!task || task.linkedFiles.length === 0) {
      await this.scanService.refresh({ quiet: true });
      const msg = task
        ? `Workspace scan refreshed for ${task.id}. No linked files on this task.`
        : "Workspace scan refreshed.";
      void vscode.window.showInformationMessage(msg);
      return;
    }

    // Task has linked files → lightweight targeted refresh (falls back to full scan internally).
    await this.scanService.refreshForTask(task);
    const linkedCount = task.linkedFiles.length;
    void vscode.window.showInformationMessage(
      `Signatures refreshed for ${task.id} (${linkedCount} linked file${linkedCount === 1 ? "" : "s"}).`
    );
  }

  private async debateTask(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Debate Task");
    if (!this.plan) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    if (!this.scanService.isFresh()) {
      await this.refreshScan({ quiet: true });
    }

    const summary = this.buildWorkspaceSummary();
    this.debatePanel.show(task, summary, {
      onUserMessage: async (message) => {
        await this.debateService.appendEntry(task, { role: "user", content: message });
        const response = await this.debateService.continueDebate(task, message, summary);
        await this.debateService.appendEntry(task, { role: "ai", content: response.content });
        this.debatePanel.postAssistantMessage(response.content);
        await this.persistAndRefresh();
      },
      onAction: async (action) => {
        await this.handleDebateAction(task, action, summary);
      }
    });

    if (task.debateLog.length === 0) {
      const opening = await this.debateService.generateOpening(task, summary);
      await this.debateService.appendEntry(task, { role: "ai", content: opening.content });
      this.debatePanel.postAssistantMessage(opening.content);
      await this.persistAndRefresh();
    }
  }

  private async handleDebateAction(task: TaskNode, action: DebateAction, workspaceSummary: string): Promise<void> {
    if (!this.plan) {
      return;
    }

    if (action === "rewrite") {
      const nextTitle = await vscode.window.showInputBox({ prompt: `Rewrite title for ${task.id}`, value: task.title });
      if (!nextTitle?.trim()) {
        return;
      }

      const rewrittenRationale = await this.debateService.regenerateRationale(task, nextTitle, workspaceSummary);
      const result = await this.debateService.applyAction(this.plan, task, action, {
        rewriteTitle: nextTitle,
        rewrittenRationale
      });
      if (result.changed) {
        await this.persistAndRefresh();
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
        const suggestedTitles = await this.debateService.suggestSplitTitles(task, workspaceSummary);
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

      const result = await this.debateService.applyAction(this.plan, task, action, { splitTitles });
      if (result.changed) {
        await this.persistAndRefresh();
      }
      void vscode.window.showInformationMessage(result.message);
      return;
    }

    const result = await this.debateService.applyAction(this.plan, task, action);
    if (result.changed) {
      await this.persistAndRefresh();
    }
    void vscode.window.showInformationMessage(result.message);
  }

  private async markResearchComplete(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Mark Research Complete");
    if (!this.plan) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
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
    markTaskStatus(this.plan, task.id, "done");
    await this.researchIndex.appendFromTask(task, conclusion.trim());

    await this.persistAndRefresh();
    void vscode.window.showInformationMessage(`✓ Research indexed: ${task.id}`);
  }

  private async showTaskRationale(arg: unknown): Promise<void> {
    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    this.outputChannel.clear();
    if (task.rationale) {
      this.outputChannel.appendLine(`Rationale — [${task.id}] ${task.title}`);
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(task.rationale);
      if (task.notes) {
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(`Notes: ${task.notes}`);
      }
    } else {
      this.outputChannel.appendLine(`No rationale recorded for [${task.id}] ${task.title}.`);
    }
    this.outputChannel.show(true); // preserve focus
  }

  private async viewLinkedFiles(arg: unknown): Promise<void> {
    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    if (task.linkedFiles.length === 0) {
      void vscode.window.showInformationMessage(`Task ${task.id} has no linked files.`);
      return;
    }

    const root = getWorkspaceRootUri();

    // With a single linked file skip the picker and open directly.
    let filesToOpen: string[];
    if (task.linkedFiles.length === 1) {
      filesToOpen = task.linkedFiles;
    } else {
      const picks = await vscode.window.showQuickPick(
        task.linkedFiles.map((filePath) => ({ label: filePath })),
        { canPickMany: true, placeHolder: `Open linked files for ${task.id}` }
      );
      if (!picks) {
        return;
      }
      filesToOpen = picks.map((pick) => pick.label);
    }

    for (const filePath of filesToOpen) {
      const uri = vscode.Uri.joinPath(root, ...filePath.split("/"));
      if (!(await uriExists(uri))) {
        continue;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  }

  private async exportPlanSummary(): Promise<void> {
    if (!this.plan) {
      await this.refreshPlanState();
    }
    if (!this.plan) {
      return;
    }

    const summary = this.buildPlanSummaryMarkdown();
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(getWorkspaceRootUri(), "plan-summary.md"),
      filters: { Markdown: ["md"] }
    });

    if (!target) {
      return;
    }

    await vscode.workspace.fs.writeFile(target, Buffer.from(summary, "utf8"));
    void vscode.window.showInformationMessage(`Exported plan summary to ${vscode.workspace.asRelativePath(target, false)}.`);
  }

  private async viewResearchIndex(): Promise<void> {
    const uri = (await import("../storage")).getResearchIndexUri();
    if (!(await uriExists(uri))) {
      void vscode.window.showInformationMessage("Research index does not exist yet.");
      return;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async viewDebateArchive(arg: unknown): Promise<void> {
    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    const archiveDir = (await import("../storage")).getDebateArchiveDirUri();
    const fileUri = vscode.Uri.joinPath(archiveDir, `${task.id}.md`);
    if (!(await uriExists(fileUri))) {
      void vscode.window.showInformationMessage(`No archived debate entries found for ${task.id}.`);
      return;
    }

    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async setTaskFileSendPolicy(arg: unknown): Promise<void> {
    await this.ensureMutablePlan("Set Task File Send Policy");
    if (!this.plan) {
      return;
    }

    const task = this.resolveTaskFromArg(arg);
    if (!task) {
      return;
    }

    const selected = await vscode.window.showQuickPick(
      [
        { label: "global", description: "Use global setting" },
        { label: "always", description: "Always send linked file contents with consent" },
        { label: "never", description: "Never send linked file contents" },
        { label: "ask", description: "Prompt each time" }
      ],
      { placeHolder: `Set file send policy for ${task.id}` }
    );

    if (!selected) {
      return;
    }

    task.fileSendPolicy = selected.label as FileSendPolicy;
    await this.persistAndRefresh();
  }

  private async ensureMutablePlan(commandName: string): Promise<void> {
    if (!this.plan) {
      await this.refreshPlanState();
    }

    if (!this.plan) {
      throw new Error(`Unable to load plan for ${commandName}.`);
    }

    if (this.plan.schemaVersion === "v1") {
      throw new Error(`${commandName} requires schema v2. Run migration first.`);
    }
  }

  private async persistAndRefresh(): Promise<void> {
    if (!this.plan || !this.planUri) {
      return;
    }

    const config = this.getConfiguration();
    this.isSelfWriting = true;
    let serialized: string;
    try {
      serialized = await this.repository.savePlan(this.planUri, this.plan, {
        researchGate: config.get<boolean>("researchGate", true),
        showRationaleInline: config.get<boolean>("showRationaleInline", true)
      });
    } finally {
      this.isSelfWriting = false;
    }

    const parsed = parsePlanMarkdown(serialized);
    this.plan = parsed.plan;

    await this.maybeArchiveDebateEntries();
    this.render();
  }

  private async maybeArchiveDebateEntries(): Promise<void> {
    if (!this.plan) {
      return;
    }

    const archiveAfterDays = this.getConfiguration().get<number>("debate.archiveAfterDays", 90);
    const archiver = new DebateArchiver(archiveAfterDays);
    await Promise.all(
      Object.values(this.plan.tasks).map(async (task) => {
        try {
          const result = await archiver.archiveOldEntries(task);
          task.debateLog = result.activeEntries;
          task.archivedDebatePath = result.archivePath;
        } catch {
          // best-effort archive — never block persist on archive failure
        }
      })
    );
  }

  private resolveTaskFromArg(arg?: unknown): TaskNode | undefined {
    if (!this.plan) {
      return undefined;
    }

    const ref = this.extractTaskCommandRef(arg);
    if (ref.taskId) {
      return this.plan.tasks[ref.taskId];
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.planUri || editor.document.uri.toString() !== this.planUri.toString()) {
      return undefined;
    }

    const line = editor.selection.active.line;
    return this.findTaskByLine(line);
  }

  private extractTaskCommandRef(arg: unknown): TaskCommandRef {
    const ref: TaskCommandRef = {};
    if (!arg) {
      return ref;
    }

    if (typeof arg === "string") {
      ref.taskId = arg;
      return ref;
    }

    if (Array.isArray(arg) && arg.length > 0 && typeof arg[0] === "string") {
      ref.taskId = arg[0];
      return ref;
    }

    if (typeof arg === "object") {
      const value = arg as Record<string, unknown>;
      if (typeof value.taskId === "string") {
        ref.taskId = value.taskId;
      } else if (typeof value.id === "string") {
        ref.taskId = value.id;
      }

      const uriValue = value.fileUri ?? value.resourceUri ?? value.uri;
      if (typeof uriValue === "string") {
        try {
          ref.fileUri = vscode.Uri.parse(uriValue, true);
        } catch {
          // noop
        }
      }
    }

    return ref;
  }

  private findTaskByLine(line: number): TaskNode | undefined {
    if (!this.plan) {
      return undefined;
    }

    let best: TaskNode | undefined;
    for (const task of Object.values(this.plan.tasks)) {
      if (task.line === undefined) {
        continue;
      }

      if (task.line <= line) {
        if (!best || (best.line ?? -1) < task.line) {
          best = task;
        }
      }
    }

    return best;
  }

  private collectAncestorChain(taskId: string): TaskNode[] {
    if (!this.plan) {
      return [];
    }

    const chain: TaskNode[] = [];
    let current: TaskNode | undefined = this.plan.tasks[taskId];
    while (current) {
      chain.unshift(current);
      current = current.parentId ? this.plan.tasks[current.parentId] : undefined;
    }
    return chain;
  }

  private collectResearchConclusions(task: TaskNode): string[] {
    if (!this.plan) {
      return [];
    }

    const result: string[] = [];
    for (const depId of task.dependsOn) {
      const dep = this.plan.tasks[depId];
      if (dep && dep.status === "done" && dep.notes) {
        result.push(`${dep.id}: ${dep.notes}`);
      }
    }

    if (task.parentId) {
      const parent = this.plan.tasks[task.parentId];
      if (parent) {
        for (const siblingId of parent.children) {
          const sibling = this.plan.tasks[siblingId];
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

  private async collectLinkedFileSnapshots(task: TaskNode): Promise<Array<{ path: string; content: string }>> {
    const root = getWorkspaceRootUri();
    const config = this.getConfiguration();
    const resolvedPolicy = resolveFileSendPolicy(task.fileSendPolicy, config.get<boolean>("sendFileContentsToAI", false));

    if (resolvedPolicy === "dont-send") {
      return [];
    }

    if (resolvedPolicy === "ask") {
      const approval = await vscode.window.showWarningMessage(
        `Task ${task.id} is set to ask before sending linked file contents. Send linked files to AI?`,
        "Send",
        "Skip"
      );
      if (approval !== "Send") {
        return [];
      }
    }

    const snapshots: Array<{ path: string; content: string }> = [];
    const paths = task.linkedFiles.slice(0, MAX_LINKED_FILES_IN_PROMPT);
    for (const relativePath of paths) {
      const uri = vscode.Uri.joinPath(root, ...relativePath.split("/"));
      if (!(await uriExists(uri))) {
        continue;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString("utf8").slice(0, MAX_LINKED_FILE_CONTENT_BYTES);
      snapshots.push({
        path: relativePath,
        content
      });
    }

    return snapshots;
  }

  private warnDebateConflicts(conflictedTaskIds: string[]): void {
    const newIds = conflictedTaskIds.filter((id) => !this.warnedDebateConflicts.has(id));
    if (newIds.length === 0) {
      return;
    }
    for (const id of newIds) {
      this.warnedDebateConflicts.add(id);
    }
    const preview = newIds.slice(0, 5).join(", ");
    const extra = newIds.length > 5 ? ` (+${newIds.length - 5} more)` : "";
    void vscode.window.showWarningMessage(
      `Debate log conflict${newIds.length > 1 ? "s" : ""} detected on: ${preview}${extra}. Please resolve in the plan file.`
    );
  }

  private async confirmWriteToCompleteFiles(paths: string[]): Promise<boolean> {
    const scan = this.scanService.getScan();
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

  private async withActiveRequest(taskId: string, runner: (token: vscode.CancellationToken) => Promise<void>): Promise<void> {
    if (this.activeRequest) {
      this.activeRequest.cancel();
      this.activeRequest.dispose();
    }

    const source = new vscode.CancellationTokenSource();
    this.activeRequest = source;
    this.statusBar.setActiveRequest(true);
    this.treeProvider.setRequestStatus({ taskId, detail: "Request started", state: "running" });

    try {
      await runner(source.token);
      this.treeProvider.setRequestStatus({ taskId, detail: "Completed", state: "success" });
      setTimeout(() => {
        this.treeProvider.setRequestStatus(undefined);
      }, ACTIVE_REQUEST_CLEAR_MS);
    } catch (error) {
      if (source.token.isCancellationRequested || /cancel/i.test(this.toErrorMessage(error))) {
        this.treeProvider.setRequestStatus({ taskId, detail: "Cancelled", state: "cancelled" });
      } else {
        this.treeProvider.setRequestStatus({ taskId, detail: this.toErrorMessage(error), state: "error" });
        throw error;
      }
    } finally {
      if (this.activeRequest === source) {
        this.activeRequest = undefined;
      }
      source.dispose();
      this.statusBar.setActiveRequest(false);
    }
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

  private buildPlanSummaryMarkdown(): string {
    if (!this.plan) {
      return "# Plan Summary\n\n(no plan loaded)\n";
    }

    const lines: string[] = [];
    lines.push("# Plan Summary");
    lines.push("");

    if (this.plan.goals.length > 0) {
      lines.push("## Goals");
      lines.push("");
      for (const goal of this.plan.goals) {
        lines.push(`- [${goal.id}] ${goal.statement}`);
      }
      lines.push("");
    }

    lines.push("## Plan Tree");
    lines.push("");

    const render = (taskId: string, depth: number): void => {
      const task = this.plan?.tasks[taskId];
      if (!task) {
        return;
      }

      const indent = "  ".repeat(depth);
      const status = task.status === "done" ? "x" : task.status === "in-progress" ? "/" : " ";
      lines.push(`${indent}- [${status}] [${task.id}] ${task.title}`);
      for (const childId of task.children) {
        render(childId, depth + 1);
      }
    };

    for (const rootId of this.plan.rootTaskIds) {
      render(rootId, 0);
    }

    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  private buildWorkspaceSummary(): string {
    const scan = this.scanService.getScan();
    if (!scan) {
      return "Workspace scan unavailable.";
    }

    const summaryLines: string[] = [];
    summaryLines.push(`Scanned: ${scan.scannedAt}`);
    summaryLines.push(`Languages: ${scan.detectedLanguages.map((item) => `${item.language}(${item.files})`).join(", ") || "none"}`);
    summaryLines.push(`Modules: ${scan.modules.length}`);

    for (const module of scan.modules.slice(0, 8)) {
      summaryLines.push(`- ${module.name}: ${module.estimatedCompletion} (${module.files.length} files)`);
    }

    if (scan.missingAreas.length > 0) {
      summaryLines.push(`Missing Areas: ${scan.missingAreas.join(", ")}`);
    }

    return summaryLines.join("\n");
  }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("planmyproject");
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    return "Unknown error.";
  }
}

function describeTaskBlockMessage(taskId: string, reason: TaskBlockReason): string {
  if (reason === "dependency") {
    return `Task ${taskId} is blocked by unresolved dependencies.`;
  }
  if (reason === "research-gate") {
    return `Task ${taskId} is blocked by unresolved sibling research or decision tasks.`;
  }
  return `Task ${taskId} is blocked until the debate thread is resolved.`;
}

