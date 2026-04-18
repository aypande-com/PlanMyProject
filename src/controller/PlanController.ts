import * as vscode from "vscode";
import {
  type FileSendPolicy,
  type PlanDocument,
  type TaskNode
} from "../model/index";
import { parsePlanMarkdown, upgradeSchemaV1ToV2 } from "../parser";
import { PlanRepository, findPlanUris, getGitUserName, getWorkspaceRootUri, hasOpenWorkspace, readTextFile, uriExists } from "../storage";
import { AIService } from "../ai/AIService";
import { TaskGenerator } from "../generation";
import { ResearchIndex } from "../research";
import { DebateArchiver, DebatePanel, DebateService } from "../debate";
import { GoalSetupPanel, PlanStatusBar, PlanTreeProvider } from "../ui";
import { ScanService } from "../scanner/ScanService";
import { ConsentService } from "../ai/ConsentService";
import { GoalCommandService } from "./GoalCommandService";
import { TaskCommandService, type TaskCommandContext, type TaskCommandServices } from "./TaskCommandService";

const ACTIVE_REQUEST_CLEAR_MS = 2200;

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
  private readonly taskCommandService: TaskCommandService;

  private planUri: vscode.Uri | undefined;
  private plan: PlanDocument | undefined;

  private activeRequest: vscode.CancellationTokenSource | undefined;
  private readonly warnedDebateConflicts = new Set<string>();
  private isSelfWriting = false;
  private readonly undoStack: string[] = [];
  private static readonly UNDO_STACK_MAX = 10;

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

    const taskCtx: TaskCommandContext = {
      getPlan: () => this.plan,
      getPlanUri: () => this.planUri,
      ensureMutablePlan: (name) => this.ensureMutablePlan(name),
      persistAndRefresh: () => this.persistAndRefresh(),
      refreshScan: (opts) => this.refreshScan(opts),
      withActiveRequest: (id, runner) => this.withActiveRequest(id, runner),
      buildWorkspaceSummary: () => this.buildWorkspaceSummary(),
      resolveTaskFromArg: (arg) => this.resolveTaskFromArg(arg),
      getConfiguration: () => this.getConfiguration()
    };
    const taskSvc: TaskCommandServices = {
      aiService: this.aiService,
      taskGenerator: this.taskGenerator,
      researchIndex: this.researchIndex,
      debatePanel: this.debatePanel,
      debateService: this.debateService,
      scanService: this.scanService,
      consentService: this.consentService,
      treeProvider: this.treeProvider
    };
    this.taskCommandService = new TaskCommandService(taskCtx, taskSvc);
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
    register("planmyproject.planTask", async (arg) => this.taskCommandService.planTask(arg));
    register("planmyproject.addTask", async (arg) => this.taskCommandService.addTask(arg, false));
    register("planmyproject.addRootTask", async () => this.taskCommandService.addTask(undefined, true));
    register("planmyproject.drillDown", async (arg) => this.drillDown(arg));
    register("planmyproject.implementTask", async (arg) => this.taskCommandService.implementTask(arg));
    register("planmyproject.deleteTask", async (arg) => this.taskCommandService.deleteTask(arg));
    register("planmyproject.rebuildQueue", async () => this.persistAndRefresh());
    register("planmyproject.refreshTree", async () => this.refreshPlanState());
    register("planmyproject.cancelActiveRequest", async () => this.cancelActiveRequest());

    register("planmyproject.setProjectGoal", async () => this.goalCommandService.setProjectGoal());
    register("planmyproject.refreshScan", async () => this.refreshScan());
    register("planmyproject.debateTask", async (arg) => this.taskCommandService.debateTask(arg));
    register("planmyproject.markResearchComplete", async (arg) => this.taskCommandService.markResearchComplete(arg));
    register("planmyproject.showTaskRationale", async (arg) => this.showTaskRationale(arg));
    register("planmyproject.viewLinkedFiles", async (arg) => this.viewLinkedFiles(arg));
    register("planmyproject.importGoalStatement", async () => this.goalCommandService.importGoalStatement());
    register("planmyproject.exportPlanSummary", async () => this.exportPlanSummary());
    register("planmyproject.viewResearchIndex", async () => this.viewResearchIndex());
    register("planmyproject.viewDebateArchive", async (arg) => this.viewDebateArchive(arg));
    register("planmyproject.setTaskFileSendPolicy", async (arg) => this.setTaskFileSendPolicy(arg));
    register("planmyproject.scanTask", async (arg) => this.scanTask(arg));
    register("planmyproject.undoLastChange", async () => this.undoLastChange());
    register("planmyproject.setApiKey", async () => this.promptSetApiKey());
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
    void vscode.commands.executeCommand("setContext", "planmyproject.schemaV1", this.plan.schemaVersion === "v1");
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

    // Snapshot current file content before overwriting (for undo).
    const currentContent = await readTextFile(this.planUri);
    pushUndoEntry(this.undoStack, currentContent, PlanController.UNDO_STACK_MAX);

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

  private async undoLastChange(): Promise<void> {
    if (!this.planUri || this.undoStack.length === 0) {
      void vscode.window.showInformationMessage("Nothing to undo.");
      return;
    }

    const previous = this.undoStack.pop()!;
    this.isSelfWriting = true;
    try {
      await vscode.workspace.fs.writeFile(this.planUri, Buffer.from(previous, "utf8"));
    } finally {
      this.isSelfWriting = false;
    }

    await this.refreshPlanState();
    void vscode.window.showInformationMessage("Undo: reverted to previous plan state.");
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

  private async promptSetApiKey(): Promise<void> {
    const providerChoice = await vscode.window.showQuickPick(
      [
        { label: "Claude (Anthropic)", value: "claude" as const },
        { label: "OpenAI",             value: "openai" as const }
      ],
      { placeHolder: "Which provider's key do you want to set?" }
    );
    if (!providerChoice) { return; }

    const key = await vscode.window.showInputBox({
      prompt: `Enter your ${providerChoice.label} API key`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => v?.trim() ? undefined : "Key cannot be empty"
    });
    if (!key) { return; }

    await this.aiService.setApiKey(providerChoice.value, key.trim());
    void vscode.window.showInformationMessage(
      `${providerChoice.label} API key saved to Secret Storage.`
    );
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

// ---------------------------------------------------------------------------
// Module-level helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Pushes `entry` onto `stack` and trims it to `maxSize` by removing
 * the oldest entries. Mutates the array in place and returns it.
 */
export function pushUndoEntry(stack: string[], entry: string, maxSize: number): string[] {
  stack.push(entry);
  while (stack.length > maxSize) {
    stack.shift();
  }
  return stack;
}
