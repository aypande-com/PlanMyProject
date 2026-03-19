import * as path from "path";
import * as vscode from "vscode";
import {
  addTask,
  createTaskNode,
  deleteTask,
  isResearchLikeTask,
  isTaskBlocked,
  markTaskStatus,
  recomputeDerivedStatuses,
  type FileSendPolicy,
  type PlanDocument,
  type ProjectGoal,
  type TaskNode,
  type TaskType,
  type WorkspaceScan
} from "../model";
import { parsePlanMarkdown, upgradeSchemaV1ToV2 } from "../parser";
import { PlanRepository, ScanCacheStore, findPlanUris, getGitUserName, getWorkspaceRootUri, hasOpenWorkspace, readTextFile, uriExists } from "../storage";
import { buildImplementationPrompt, summarizeDraftTasks } from "../ai/PromptBuilder";
import { parseImplementationResponse } from "../ai/ResponseParser";
import { AIService } from "../ai/AIService";
import { TaskGenerator } from "../generation";
import { WorkspaceScanner } from "../scanner";
import { ResearchIndex } from "../research";
import { DebateArchiver, DebatePanel, DebateService, type DebateAction } from "../debate";
import { createGoalIdGenerator, resolveFileSendPolicy, resolveSafeTargetPath, isSensitiveWorkspacePath } from "../util";
import { GoalSetupPanel, PlanStatusBar, PlanTreeProvider } from "../ui";

const ACTIVE_REQUEST_CLEAR_MS = 2200;
const MAX_LINKED_FILE_CONTENT_BYTES = 45_000;
const MAX_LINKED_FILES_IN_PROMPT = 8;

interface TaskCommandRef {
  taskId?: string;
  fileUri?: vscode.Uri;
}

export class PlanController implements vscode.Disposable {
  private readonly repository: PlanRepository;
  private readonly scanCacheStore = new ScanCacheStore();
  private readonly scanner = new WorkspaceScanner();
  private readonly aiService: AIService;
  private readonly taskGenerator: TaskGenerator;
  private readonly researchIndex = new ResearchIndex();
  private readonly goalSetupPanel = new GoalSetupPanel();
  private readonly statusBar = new PlanStatusBar();
  private readonly treeProvider = new PlanTreeProvider();
  private readonly debatePanel: DebatePanel;
  private readonly debateService: DebateService;

  private planUri: vscode.Uri | undefined;
  private plan: PlanDocument | undefined;
  private scan: WorkspaceScan | undefined;

  private activeRequest: vscode.CancellationTokenSource | undefined;
  private sessionAllowAllConsent = false;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = this.getConfiguration();
    this.repository = new PlanRepository(config.get<string>("planFileName", "planmyproject.md"));
    this.aiService = new AIService(context);
    this.taskGenerator = new TaskGenerator(this.aiService);
    this.debatePanel = new DebatePanel(context.extensionUri);
    this.debateService = new DebateService(this.aiService, async () => getGitUserName());
  }

  async activate(): Promise<void> {
    this.context.subscriptions.push(
      this.treeProvider,
      this.statusBar,
      vscode.window.registerTreeDataProvider("planmyproject.tree", this.treeProvider),
      vscode.languages.registerCodeLensProvider({ scheme: "file", pattern: "**/*.md" }, new (await import("../ui/CodeLensProvider")).PlanCodeLensProvider())
    );

    this.registerCommands();
    this.registerWatchers();

    this.scan = await this.scanCacheStore.load();
    this.treeProvider.setWorkspaceScan(this.scan);
    this.statusBar.setScanTimestamp(this.scan?.scannedAt);

    await this.refreshPlanState();
  }

  dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.statusBar.dispose();
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

    register("planmyproject.setProjectGoal", async () => this.setProjectGoal());
    register("planmyproject.refreshScan", async () => this.refreshScan());
    register("planmyproject.debateTask", async (arg) => this.debateTask(arg));
    register("planmyproject.markResearchComplete", async (arg) => this.markResearchComplete(arg));
    register("planmyproject.showTaskRationale", async (arg) => this.showTaskRationale(arg));
    register("planmyproject.viewLinkedFiles", async (arg) => this.viewLinkedFiles(arg));
    register("planmyproject.importGoalStatement", async () => this.importGoalStatement());
    register("planmyproject.exportPlanSummary", async () => this.exportPlanSummary());
    register("planmyproject.viewResearchIndex", async () => this.viewResearchIndex());
    register("planmyproject.viewDebateArchive", async (arg) => this.viewDebateArchive(arg));
    register("planmyproject.setTaskFileSendPolicy", async (arg) => this.setTaskFileSendPolicy(arg));
    register("planmyproject.scanTask", async () => this.refreshScan());
  }

  private registerWatchers(): void {
    const watcher = vscode.workspace.createFileSystemWatcher("{planmyproject.md,projectplan.md}");
    this.context.subscriptions.push(
      watcher,
      watcher.onDidCreate(async () => this.refreshPlanState()),
      watcher.onDidChange(async () => this.refreshPlanState()),
      watcher.onDidDelete(async () => this.refreshPlanState()),
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        const planUris = await findPlanUris();
        if (!planUris.some((uri) => uri.toString() === document.uri.toString())) {
          return;
        }
        await this.refreshPlanState();
      }),
      vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor) {
          return;
        }

        const planUris = await findPlanUris();
        if (planUris.some((uri) => uri.toString() === editor.document.uri.toString())) {
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
  }

  private async refreshPlanState(): Promise<void> {
    const loaded = await this.repository.loadPlan();
    this.planUri = loaded.uri;

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
    this.treeProvider.setWorkspaceScan(this.scan);
    this.statusBar.setMissingGoal(this.plan.goals.length === 0);
    this.statusBar.setScanTimestamp(this.scan?.scannedAt);

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
    const createId = (await import("../util")).createTaskIdGenerator(this.plan);
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
    recomputeDerivedStatuses(this.plan);
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

    if (!(await this.ensureAiConsent(`Plan task ${task.id}`, [
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

    await this.refreshScan({ quiet: true });

    const knowledge = await this.researchIndex.queryRelevant({
      taskTitle: task.title,
      goalStatement: this.plan.goals.find((goal) => goal.id === task.goalRef)?.statement,
      topN: 5
    });

    await this.withActiveRequest(task.id, async (token) => {
      const output = await this.taskGenerator.generate({
        plan: this.plan as PlanDocument,
        parent: task,
        scan: this.scan,
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

      recomputeDerivedStatuses(this.plan as PlanDocument);
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

    const researchGate = this.getConfiguration().get<boolean>("researchGate", true);
    if (isTaskBlocked(this.plan, task.id, researchGate)) {
      void vscode.window.showWarningMessage(`Task ${task.id} is blocked by unresolved research or dependencies.`);
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

    if (!(await this.ensureAiConsent(`Implement task ${task.id}`, [
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

      const root = getWorkspaceRootUri();
      for (const change of parsed.changes) {
        const targetPath = await resolveSafeTargetPath(root.fsPath, change.path);
        const targetUri = vscode.Uri.file(targetPath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetPath)));
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(change.content, "utf8"));
      }

      markTaskStatus(this.plan as PlanDocument, task.id, "done");
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
    recomputeDerivedStatuses(this.plan);
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

  private async setProjectGoal(): Promise<void> {
    await this.ensureMutablePlan("Set Project Goal");
    if (!this.plan) {
      return;
    }

    const goal = await this.goalSetupPanel.promptForGoal(this.plan.goals);
    if (!goal) {
      return;
    }

    this.plan.goals.push(goal);
    if (this.plan.rootTaskIds.length > 0) {
      for (const rootId of this.plan.rootTaskIds) {
        const task = this.plan.tasks[rootId];
        if (task && !task.goalRef) {
          task.goalRef = goal.id;
        }
      }
    }

    await this.persistAndRefresh();
  }

  private async refreshScan(options?: { quiet?: boolean }): Promise<void> {
    if (!this.plan) {
      await this.refreshPlanState();
    }

    const config = this.getConfiguration();
    const maxFiles = config.get<number>("scanner.maxFilesScanned", 500);
    const maxFileSizeKb = config.get<number>("scanner.maxFileSizeKb", 50);
    const extractSignatures = config.get<boolean>("scanner.extractSignatures", true);

    this.scan = await this.scanner.scan({
      goals: this.plan?.goals,
      settings: {
        maxFilesScanned: maxFiles,
        maxFileSizeKb,
        extractSignatures
      },
      onProgress: (detail) => {
        this.statusBar.setActiveRequest(true);
        this.treeProvider.setRequestStatus({
          taskId: this.plan?.rootTaskIds[0] ?? "scan",
          detail,
          state: "running"
        });
      }
    });

    await this.scanCacheStore.save(this.scan);
    this.treeProvider.setWorkspaceScan(this.scan);
    this.statusBar.setActiveRequest(false);
    this.statusBar.setScanTimestamp(this.scan.scannedAt);
    this.treeProvider.setRequestStatus(undefined);

    if (!options?.quiet) {
      void vscode.window.showInformationMessage(`Workspace scan complete: ${this.scan.modules.length} module(s).`);
    }
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

    if (!this.scan) {
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
        await this.handleDebateAction(task, action);
      }
    });

    const opening = await this.debateService.generateOpening(task, summary);
    await this.debateService.appendEntry(task, { role: "ai", content: opening.content });
    this.debatePanel.postAssistantMessage(opening.content);
    await this.persistAndRefresh();
  }

  private async handleDebateAction(task: TaskNode, action: DebateAction): Promise<void> {
    if (!this.plan) {
      return;
    }

    if (action === "rewrite") {
      const nextTitle = await vscode.window.showInputBox({ prompt: `Rewrite title for ${task.id}`, value: task.title });
      if (!nextTitle?.trim()) {
        return;
      }

      const result = await this.debateService.applyAction(this.plan, task, action, { rewriteTitle: nextTitle });
      if (result.changed) {
        await this.persistAndRefresh();
      }
      void vscode.window.showInformationMessage(result.message);
      return;
    }

    if (action === "split") {
      const titlesText = await vscode.window.showInputBox({
        prompt: `Split ${task.id} into 2-4 tasks (comma-separated titles)`,
        placeHolder: "Research API contract, Implement API handler, Add tests"
      });
      if (!titlesText?.trim()) {
        return;
      }

      const splitTitles = titlesText.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
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
    void vscode.window.showInformationMessage(task.rationale ? `Rationale (${task.id}): ${task.rationale}` : `No rationale recorded for ${task.id}.`);
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
    for (const filePath of task.linkedFiles) {
      const uri = vscode.Uri.joinPath(root, ...filePath.split("/"));
      if (!(await uriExists(uri))) {
        continue;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  }

  private async importGoalStatement(): Promise<void> {
    await this.ensureMutablePlan("Import Goal Statement");
    if (!this.plan) {
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
    const goal = this.parseGoalFromMarkdown(content, this.plan.goals);
    this.plan.goals.push(goal);
    if (this.plan.rootTaskIds.length > 0) {
      for (const rootTaskId of this.plan.rootTaskIds) {
        const task = this.plan.tasks[rootTaskId];
        if (task && !task.goalRef) {
          task.goalRef = goal.id;
        }
      }
    }

    await this.persistAndRefresh();
    void vscode.window.showInformationMessage(`Imported goal ${goal.id} from ${selected.label}.`);
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
    await this.repository.savePlan(this.planUri, this.plan, {
      researchGate: config.get<boolean>("researchGate", true),
      showRationaleInline: config.get<boolean>("showRationaleInline", true)
    });

    const text = await readTextFile(this.planUri);
    const parsed = parsePlanMarkdown(text);
    this.plan = parsed.plan;

    this.maybeArchiveDebateEntries();
    this.render();
  }

  private maybeArchiveDebateEntries(): void {
    if (!this.plan) {
      return;
    }

    const archiveAfterDays = this.getConfiguration().get<number>("debate.archiveAfterDays", 90);
    const archiver = new DebateArchiver(archiveAfterDays);
    for (const task of Object.values(this.plan.tasks)) {
      void archiver.archiveOldEntries(task).then((result) => {
        task.debateLog = result.activeEntries;
        task.archivedDebatePath = result.archivePath;
      }).catch(() => {
        // best-effort archive
      });
    }
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

  private async ensureAiConsent(operation: string, summaryLines: string[]): Promise<boolean> {
    if (this.sessionAllowAllConsent) {
      return true;
    }

    const message = [
      `${operation} sends context to configured AI provider.`,
      "Summary:",
      ...summaryLines.map((line) => `- ${line}`),
      "Continue?"
    ].join("\n");

    const decision = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Send to AI",
      "Allow All"
    );

    if (decision === "Allow All") {
      this.sessionAllowAllConsent = true;
      return true;
    }

    return decision === "Send to AI";
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

  private parseGoalFromMarkdown(content: string, existingGoals: ProjectGoal[]): ProjectGoal {
    const goalIdFactory = createGoalIdGenerator(existingGoals);
    const lines = content.split(/\r?\n/);
    const heading = lines.find((line) => /^#{1,2}\s+/.test(line.trim()));
    const statement = heading
      ? heading.replace(/^#{1,2}\s+/, "").trim()
      : lines.find((line) => line.trim().length > 0)?.trim() ?? "Imported project goal";

    const bulletLines = lines
      .filter((line) => /^\s*[-*+]\s+/.test(line))
      .map((line) => line.replace(/^\s*[-*+]\s+/, "").trim())
      .filter((line) => line.length > 0);

    return {
      id: goalIdFactory(),
      statement,
      successCriteria: bulletLines.slice(0, 6),
      constraints: [],
      outOfScope: []
    };
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
    if (!this.scan) {
      return "Workspace scan unavailable.";
    }

    const summaryLines: string[] = [];
    summaryLines.push(`Scanned: ${this.scan.scannedAt}`);
    summaryLines.push(`Languages: ${this.scan.detectedLanguages.map((item) => `${item.language}(${item.files})`).join(", ") || "none"}`);
    summaryLines.push(`Modules: ${this.scan.modules.length}`);

    for (const module of this.scan.modules.slice(0, 8)) {
      summaryLines.push(`- ${module.name}: ${module.estimatedCompletion} (${module.files.length} files)`);
    }

    if (this.scan.missingAreas.length > 0) {
      summaryLines.push(`Missing Areas: ${this.scan.missingAreas.join(", ")}`);
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
