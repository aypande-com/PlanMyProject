import * as vscode from "vscode";
import {
  TASK_TYPE_ICONS,
  getTaskBlockReason,
  type PlanDocument,
  type TaskBlockReason,
  type TaskNode,
  type WorkspaceScan
} from "../model/index";

interface RequestStatus {
  taskId: string;
  detail: string;
  state: "running" | "success" | "error" | "cancelled";
}

class WorkspaceSnapshotItem extends vscode.TreeItem {
  constructor(scan: WorkspaceScan | undefined) {
    super("Workspace Snapshot", vscode.TreeItemCollapsibleState.Collapsed);
    if (!scan) {
      this.description = "No scan yet";
      this.tooltip = "No workspace scan available yet.";
    } else {
      const partialCount = scan.modules.filter((module) => module.estimatedCompletion === "partial").length;
      const completeCount = scan.modules.filter((module) => module.estimatedCompletion === "complete").length;
      this.description = `${scan.modules.length} modules`;
      this.tooltip = `Scan: ${scan.modules.length} modules | ${partialCount} partial | ${completeCount} complete`;
    }
    this.iconPath = new vscode.ThemeIcon("search");
    this.contextValue = "workspaceSnapshot";
  }
}

class TaskTreeItem extends vscode.TreeItem {
  constructor(
    readonly task: TaskNode,
    private readonly plan: PlanDocument,
    sourceUri: vscode.Uri | undefined,
    requestStatus: RequestStatus | undefined,
    researchGate: boolean
  ) {
    const blockReason = getTaskBlockReason(plan, task.id, researchGate);
    const blocked = blockReason !== undefined;

    super(
      `${blocked ? "🔒 " : ""}${TASK_TYPE_ICONS[task.type]} ${task.title}`,
      task.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    const confidence = task.confidence === null ? "n/a" : `${Math.round(task.confidence * 100)}%`;
    const confidenceBadge = formatConfidenceBadge(task);
    const originBadge = formatOriginBadge(task);
    const requestDetail = requestStatus?.taskId === task.id ? ` • ${requestStatus.detail}` : "";

    this.id = task.id;
    this.description = `${task.id} • ${originBadge}${confidenceBadge ? ` • ${confidenceBadge}` : ""}${blocked ? " • blocked" : ""}${requestDetail}`;
    this.tooltip = [
      `${task.id} [${task.status}] ${task.type}`,
      `Goal: ${task.goalRef ?? "none"}`,
      `Origin: ${task.origin}`,
      `Confidence: ${confidence}`,
      blocked ? describeBlockReason(blockReason) : "Ready based on current dependencies"
    ].join("\n");

    this.contextValue = blocked
      ? `task:${task.type}:blocked`
      : `task:${task.type}`;

    this.iconPath = iconForTask(task, requestStatus);
    this.command = {
      command: "planmyproject.drillDown",
      title: "Drill Down",
      arguments: [{ taskId: task.id, fileUri: sourceUri?.toString() }]
    };

    if (sourceUri) {
      this.resourceUri = sourceUri;
    }
  }
}

export class PlanTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private plan: PlanDocument | undefined;
  private sourceUri: vscode.Uri | undefined;
  private scan: WorkspaceScan | undefined;
  private requestStatus: RequestStatus | undefined;
  private researchGate = true;

  setPlan(plan: PlanDocument, sourceUri?: vscode.Uri, researchGate = true): void {
    this.plan = plan;
    this.sourceUri = sourceUri;
    this.researchGate = researchGate;
    this.refresh();
  }

  setWorkspaceScan(scan: WorkspaceScan | undefined): void {
    this.scan = scan;
    this.refresh();
  }

  setRequestStatus(status: RequestStatus | undefined): void {
    this.requestStatus = status;
    this.refresh();
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!this.plan) {
      return [new WorkspaceSnapshotItem(this.scan)];
    }

    if (!element) {
      const roots: vscode.TreeItem[] = [new WorkspaceSnapshotItem(this.scan)];
      for (const rootId of this.plan.rootTaskIds) {
        const task = this.plan.tasks[rootId];
        if (!task) {
          continue;
        }
        roots.push(new TaskTreeItem(task, this.plan, this.sourceUri, this.requestStatus, this.researchGate));
      }
      return roots;
    }

    if (element instanceof WorkspaceSnapshotItem) {
      if (!this.scan) {
        return [new vscode.TreeItem("No scan available")];
      }

      const items: vscode.TreeItem[] = [];
      items.push(new vscode.TreeItem(`Languages: ${this.scan.detectedLanguages.map((item) => `${item.language}(${item.files})`).join(", ") || "none"}`));
      items.push(new vscode.TreeItem(`Dependencies: ${this.scan.dependencies.length}`));
      items.push(new vscode.TreeItem(`Modules: ${this.scan.modules.length}`));
      items.push(new vscode.TreeItem(`Missing Areas: ${this.scan.missingAreas.join(", ") || "none"}`));
      return items;
    }

    if (!(element instanceof TaskTreeItem)) {
      return [];
    }

    const task = element.task;
    const children: vscode.TreeItem[] = [];
    for (const childId of task.children) {
      const child = this.plan.tasks[childId];
      if (!child) {
        continue;
      }
      children.push(new TaskTreeItem(child, this.plan, this.sourceUri, this.requestStatus, this.researchGate));
    }
    return children;
  }
}

function iconForTask(task: TaskNode, requestStatus: RequestStatus | undefined): vscode.ThemeIcon {
  if (requestStatus?.taskId === task.id) {
    if (requestStatus.state === "running") {
      return new vscode.ThemeIcon("loading~spin");
    }
    if (requestStatus.state === "success") {
      return new vscode.ThemeIcon("check");
    }
    if (requestStatus.state === "cancelled") {
      return new vscode.ThemeIcon("circle-slash");
    }
    return new vscode.ThemeIcon("error");
  }

  if (task.status === "done") {
    return new vscode.ThemeIcon("check");
  }

  if (task.status === "in-progress") {
    return new vscode.ThemeIcon("dash");
  }

  return new vscode.ThemeIcon("circle-large-outline");
}

function describeBlockReason(reason: TaskBlockReason | undefined): string {
  if (reason === "dependency") {
    return "Blocked by unresolved dependencies.";
  }
  if (reason === "research-gate") {
    return "Blocked by unresolved sibling research/decision tasks.";
  }
  if (reason === "debate-thread") {
    return "Blocked until the debate thread is resolved.";
  }
  return "Blocked.";
}

function formatOriginBadge(task: TaskNode): string {
  if (task.origin === "ai-generated") {
    return "AI";
  }
  if (task.origin === "code-inferred") {
    return "INF";
  }
  return "ME";
}

function formatConfidenceBadge(task: TaskNode): string | undefined {
  if (task.origin !== "ai-generated" || task.confidence === null) {
    return undefined;
  }
  if (task.confidence >= 0.8) {
    return "🟢";
  }
  if (task.confidence >= 0.5) {
    return "🟡";
  }
  return "🔴";
}
