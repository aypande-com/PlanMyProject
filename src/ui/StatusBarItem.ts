import * as vscode from "vscode";

export class PlanStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private scanTimestamp: string | undefined;
  private activeRequest = false;
  private missingGoal = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "planmyproject.refreshScan";
    this.item.show();
    this.render();
  }

  setScanTimestamp(isoDate: string | undefined): void {
    this.scanTimestamp = isoDate;
    this.render();
  }

  setActiveRequest(active: boolean): void {
    this.activeRequest = active;
    this.render();
  }

  setMissingGoal(missingGoal: boolean): void {
    this.missingGoal = missingGoal;
    this.render();
  }

  private render(): void {
    if (this.activeRequest) {
      this.item.text = "$(sync~spin) PlanMyProject: AI request running";
      this.item.tooltip = "An AI request is in progress. Click to refresh scan after completion.";
      return;
    }

    if (this.missingGoal) {
      this.item.text = "$(warning) PlanMyProject: No project goal set";
      this.item.tooltip = "Click to run Refresh Scan. Use Set Project Goal to add one.";
      return;
    }

    if (this.scanTimestamp) {
      const ago = formatAgo(this.scanTimestamp);
      this.item.text = `$(search) PlanMyProject: Scanned ${ago}`;
      this.item.tooltip = `Last workspace scan: ${this.scanTimestamp}. Click to refresh.`;
      return;
    }

    this.item.text = "$(search) PlanMyProject: Scan pending";
    this.item.tooltip = "Workspace has not been scanned yet. Click to run Refresh Scan.";
  }

  dispose(): void {
    this.item.dispose();
  }
}

function formatAgo(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return "recently";
  }

  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
