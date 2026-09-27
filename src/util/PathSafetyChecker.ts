import * as path from "path";
import { promises as fs } from "fs";

// P0-D2: two distinct classes, deliberately not one "sensitive" bucket.
// BUILD_METADATA is project configuration - not secret, but AI-suggested
// changes to it are worth a confirmation before writing. SECRET_BEARING is
// content that may contain a live credential - refused outright on egress,
// no override (see isSecretBearingPath / collectLinkedFileSnapshots).
const BUILD_METADATA_BASENAMES = new Set([
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

const SECRET_BEARING_DIRECTORY_PREFIXES = [".git/", ".vscode/", ".github/", ".devcontainer/"];

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

// Refuse outright on egress (no user override) - see collectLinkedFileSnapshots.
export function isSecretBearingPath(input: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase();
  if (SECRET_BEARING_DIRECTORY_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return true;
  }

  const basename = path.posix.basename(lower);
  if (basename.startsWith(".env")) {
    return true;
  }

  return false;
}

// Warn-and-allow before an AI-suggested write - see the sensitiveTargets
// check in TaskCommandService.implementTask.
export function isBuildMetadataPath(input: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (!normalized) {
    return false;
  }

  const basename = path.posix.basename(normalized.toLowerCase());
  if (BUILD_METADATA_BASENAMES.has(basename)) {
    return true;
  }
  if (/^tsconfig(?:\..+)?\.json$/.test(basename)) {
    return true;
  }

  return false;
}

// General "needs a confirmation somewhere" check, kept for the write-path
// gate which still treats both classes the same way it always has (warn,
// allow on confirmation). Egress uses isSecretBearingPath directly instead,
// since BUILD_METADATA content is fine to send as AI context.
export function isSensitiveWorkspacePath(input: string): boolean {
  return isSecretBearingPath(input) || isBuildMetadataPath(input);
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
