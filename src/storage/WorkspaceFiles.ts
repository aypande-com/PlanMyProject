import * as path from "path";
import * as vscode from "vscode";

export const DEFAULT_PLAN_FILENAME = "planmyproject.md";
export const LEGACY_PLAN_FILENAME = "projectplan.md";
export const PLAN_FILENAMES = [DEFAULT_PLAN_FILENAME, LEGACY_PLAN_FILENAME] as const;

export function getWorkspaceRootUri(): vscode.Uri {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    throw new Error("PlanMyProject requires an open folder or workspace.");
  }
  return root;
}

export function hasOpenWorkspace(): boolean {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

export async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export async function findPlanUris(): Promise<vscode.Uri[]> {
  if (!hasOpenWorkspace()) {
    return [];
  }

  const root = getWorkspaceRootUri();
  const result: vscode.Uri[] = [];
  for (const filename of PLAN_FILENAMES) {
    const candidate = vscode.Uri.joinPath(root, filename);
    if (await uriExists(candidate)) {
      result.push(candidate);
    }
  }
  return result;
}

export async function findExistingPlanUri(): Promise<vscode.Uri | undefined> {
  const candidates = await findPlanUris();
  return candidates[0];
}

export async function findOrCreatePlanUri(planFileName: string): Promise<vscode.Uri> {
  const existing = await findExistingPlanUri();
  if (existing) {
    return existing;
  }

  const root = getWorkspaceRootUri();
  const target = vscode.Uri.joinPath(root, sanitizePlanFileName(planFileName));
  return target;
}

export function sanitizePlanFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_PLAN_FILENAME;
  }

  const basename = path.basename(trimmed);
  if (!basename.toLowerCase().endsWith(".md")) {
    return `${basename}.md`;
  }
  return basename;
}

export function getPmpDirUri(root = getWorkspaceRootUri()): vscode.Uri {
  return vscode.Uri.joinPath(root, ".pmp");
}

export function getScanCacheUri(root = getWorkspaceRootUri()): vscode.Uri {
  return vscode.Uri.joinPath(getPmpDirUri(root), "scan-cache.json");
}

export function getResearchIndexUri(root = getWorkspaceRootUri()): vscode.Uri {
  return vscode.Uri.joinPath(getPmpDirUri(root), "research-index.json");
}

export function getDebateArchiveDirUri(root = getWorkspaceRootUri()): vscode.Uri {
  return vscode.Uri.joinPath(getPmpDirUri(root), "debate-archive");
}

export async function ensurePmpDir(root = getWorkspaceRootUri()): Promise<vscode.Uri> {
  const pmpDir = getPmpDirUri(root);
  await vscode.workspace.fs.createDirectory(pmpDir);
  return pmpDir;
}

export async function readTextFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}

export async function writeTextFile(uri: vscode.Uri, content: string): Promise<void> {
  const parent = vscode.Uri.joinPath(uri, "..");
  await vscode.workspace.fs.createDirectory(parent);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

export async function ensureTextFile(uri: vscode.Uri, content: string): Promise<void> {
  if (await uriExists(uri)) {
    return;
  }
  const parent = vscode.Uri.joinPath(uri, "..");
  await vscode.workspace.fs.createDirectory(parent);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

export async function getGitUserName(root = getWorkspaceRootUri()): Promise<string | undefined> {
  try {
    const result = await vscode.commands.executeCommand<string>("git config user.name");
    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }
  } catch {
    // ignore
  }

  const os = await import("os");
  const username = os.userInfo().username;
  return username || undefined;
}
