import * as vscode from "vscode";
import { type ProjectGoal, type TaskNode, type WorkspaceScan } from "../model/index";
import { type PlanStatusBar, type PlanTreeProvider } from "../ui/index";
import { ScanCacheStore } from "../storage/ScanCacheStore";
import { getWorkspaceRootUri, readTextFile, uriExists, writeTextFile } from "../storage/WorkspaceFiles";
import { WorkspaceScanner } from "./WorkspaceScanner";

const LAST_SCAN_STATE_KEY = "planmyproject.lastScanTimestamp";
const GITIGNORE_SUGGESTION_STATE_KEY = "planmyproject.gitignoreSuggestionDismissed";

export class ScanService {
  private scan: WorkspaceScan | undefined;
  private readonly scanCacheStore = new ScanCacheStore();
  private readonly scanner = new WorkspaceScanner();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getConfiguration: () => vscode.WorkspaceConfiguration,
    private readonly treeProvider: PlanTreeProvider,
    private readonly statusBar: PlanStatusBar,
    private readonly getGoals: () => ProjectGoal[]
  ) {}

  getScan(): WorkspaceScan | undefined {
    return this.scan;
  }

  /**
   * Returns true when the cached scan is older than ttlMinutes (or when
   * no scan exists). Implements the spec's isStale(ttlMinutes) API.
   */
  isStale(ttlMinutes: number): boolean {
    if (!this.scan?.scannedAt) {
      return true;
    }
    if (ttlMinutes <= 0) {
      return true;
    }
    const ageMs = Date.now() - Date.parse(this.scan.scannedAt);
    return ageMs >= ttlMinutes * 60 * 1000;
  }

  /** Convenience wrapper that reads cacheTtlMinutes from config. */
  isFresh(): boolean {
    const ttlMinutes = this.getConfiguration().get<number>("scanner.cacheTtlMinutes", 5);
    return !this.isStale(ttlMinutes);
  }

  /** Load the persisted scan cache on extension activation. */
  async loadCached(): Promise<void> {
    this.scan = await this.scanCacheStore.load();
    const lastScanFromState = this.context.workspaceState.get<string>(LAST_SCAN_STATE_KEY);
    this.treeProvider.setWorkspaceScan(this.scan);
    this.statusBar.setScanTimestamp(this.scan?.scannedAt ?? lastScanFromState);
  }

  /** Full workspace scan — equivalent to the old PlanController.refreshScan(). */
  async refresh(options?: { quiet?: boolean }): Promise<void> {
    const config = this.getConfiguration();
    const maxFiles = config.get<number>("scanner.maxFilesScanned", 500);
    const maxFileSizeKb = config.get<number>("scanner.maxFileSizeKb", 50);
    const extractSignatures = config.get<boolean>("scanner.extractSignatures", true);

    this.scan = await this.scanner.scan({
      goals: this.getGoals(),
      settings: { maxFilesScanned: maxFiles, maxFileSizeKb, extractSignatures },
      onProgress: (detail) => {
        this.statusBar.setActiveRequest(true);
        this.treeProvider.setRequestStatus({
          taskId: "scan",
          detail,
          state: "running"
        });
      }
    });

    await this.scanCacheStore.save(this.scan);
    await this.context.workspaceState.update(LAST_SCAN_STATE_KEY, this.scan.scannedAt);
    await this.maybeSuggestGitignoreEntry();
    this.treeProvider.setWorkspaceScan(this.scan);
    this.statusBar.setActiveRequest(false);
    this.statusBar.setScanTimestamp(this.scan.scannedAt);
    this.treeProvider.setRequestStatus(undefined);

    if (!options?.quiet) {
      void vscode.window.showInformationMessage(`Workspace scan complete: ${this.scan.modules.length} module(s).`);
    }
  }

  /**
   * Targeted refresh for a task with linked files. Re-reads only those files
   * and patches their signatures into the existing scan. Falls back to a full
   * refresh when no prior scan exists.
   */
  async refreshForTask(task: TaskNode): Promise<void> {
    if (this.scan) {
      const config = this.getConfiguration();
      this.scan = await this.scanner.refreshLinkedFiles(task.linkedFiles, this.scan, {
        extractSignatures: config.get<boolean>("scanner.extractSignatures", true),
        maxFileSizeKb: config.get<number>("scanner.maxFileSizeKb", 50)
      });
      await this.scanCacheStore.save(this.scan);
      this.treeProvider.setWorkspaceScan(this.scan);
      this.statusBar.setScanTimestamp(this.scan.scannedAt);
    } else {
      await this.refresh({ quiet: true });
    }
  }

  private async maybeSuggestGitignoreEntry(): Promise<void> {
    const config = this.getConfiguration();
    if (!config.get<boolean>("gitignorePmpDir", true)) {
      return;
    }
    if (this.context.workspaceState.get<boolean>(GITIGNORE_SUGGESTION_STATE_KEY, false)) {
      return;
    }

    const root = getWorkspaceRootUri();
    const gitignoreUri = vscode.Uri.joinPath(root, ".gitignore");
    let content = "";

    if (await uriExists(gitignoreUri)) {
      content = await readTextFile(gitignoreUri);
      if (/(^|\n)\s*\.pmp\/scan-cache\.json\s*(\n|$)/.test(content) || /(^|\n)\s*\.pmp\/\s*(\n|$)/.test(content)) {
        return;
      }
    }

    const decision = await vscode.window.showInformationMessage(
      "Add `.pmp/scan-cache.json` to .gitignore? This scan cache is machine-specific.",
      "Add",
      "Not now",
      "Don't ask again"
    );

    if (!decision || decision === "Not now") {
      return;
    }

    if (decision === "Don't ask again") {
      await this.context.workspaceState.update(GITIGNORE_SUGGESTION_STATE_KEY, true);
      return;
    }

    const next = appendGitignoreLine(content, ".pmp/scan-cache.json");
    await writeTextFile(gitignoreUri, next);
    await this.context.workspaceState.update(GITIGNORE_SUGGESTION_STATE_KEY, true);
    void vscode.window.showInformationMessage("Added `.pmp/scan-cache.json` to .gitignore.");
  }
}

function appendGitignoreLine(content: string, line: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed) {
    return `${line}\n`;
  }
  return `${trimmed}\n${line}\n`;
}
