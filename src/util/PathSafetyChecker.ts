import * as path from "path";
import { promises as fs } from "fs";

const SENSITIVE_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  ".gitignore",
  ".gitattributes",
  ".editorconfig"
]);

export function normalizeWorkspaceRelativePath(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.includes("://")) {
    return undefined;
  }

  const unix = trimmed.replace(/\\/g, "/").replace(/^\.\//, "");
  const normalized = path.posix.normalize(unix);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }

  return normalized;
}

export function isSensitiveWorkspacePath(input: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.startsWith(".git/")
    || lower.startsWith(".vscode/")
    || lower.startsWith(".github/")
    || lower.startsWith(".devcontainer/")
  ) {
    return true;
  }

  const basename = path.posix.basename(lower);
  if (basename.startsWith(".env")) {
    return true;
  }
  if (SENSITIVE_BASENAMES.has(basename)) {
    return true;
  }
  if (/^tsconfig(?:\..+)?\.json$/.test(basename)) {
    return true;
  }

  return false;
}

export async function resolveSafeTargetPath(rootPath: string, relativePath: string): Promise<string> {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!normalized) {
    throw new Error(`Invalid relative path: ${relativePath}`);
  }

  const root = path.resolve(rootPath);
  const target = path.resolve(root, normalized);
  if (!isPathWithin(root, target)) {
    throw new Error(`Refusing to write outside workspace root: ${relativePath}`);
  }

  const canonicalRoot = await resolveCanonicalPath(root);
  const ancestorRealPath = await findNearestExistingAncestorRealPath(target, root);
  if (ancestorRealPath && !isPathWithin(canonicalRoot, ancestorRealPath)) {
    throw new Error(`Refusing to write through symlink outside workspace root: ${relativePath}`);
  }

  return target;
}

async function resolveCanonicalPath(fsPath: string): Promise<string> {
  try {
    return await fs.realpath(fsPath);
  } catch {
    return path.resolve(fsPath);
  }
}

async function findNearestExistingAncestorRealPath(targetFsPath: string, rootFsPath: string): Promise<string | undefined> {
  let current = targetFsPath;
  while (isPathWithin(rootFsPath, current)) {
    try {
      return await fs.realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
  }

  return undefined;
}

function isPathWithin(parentPath: string, childPath: string): boolean {
  const parent = normalizePathForComparison(parentPath);
  const child = normalizePathForComparison(childPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePathForComparison(fsPath: string): string {
  const resolved = path.resolve(fsPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
