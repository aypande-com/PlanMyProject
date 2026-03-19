import * as vscode from "vscode";

const DEFAULT_IGNORES = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  "out",
  "out-test"
];

export class IgnoreMatcher {
  private readonly patterns: string[];

  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  static async fromWorkspace(root: vscode.Uri): Promise<IgnoreMatcher> {
    const patterns = [...DEFAULT_IGNORES];
    try {
      const ignoreUri = vscode.Uri.joinPath(root, ".pmpignore");
      const bytes = await vscode.workspace.fs.readFile(ignoreUri);
      const text = Buffer.from(bytes).toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        patterns.push(trimmed);
      }
    } catch {
      // optional ignore file
    }

    return new IgnoreMatcher(patterns);
  }

  shouldIgnore(relativePath: string): boolean {
    const normalized = normalize(relativePath);
    const segments = normalized.split("/");

    for (const pattern of this.patterns) {
      const normalizedPattern = normalize(pattern);
      if (!normalizedPattern) {
        continue;
      }

      if (!normalizedPattern.includes("*")) {
        if (normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`)) {
          return true;
        }
        if (segments.includes(normalizedPattern)) {
          return true;
        }
        continue;
      }

      const regex = globToRegExp(normalizedPattern);
      if (regex.test(normalized)) {
        return true;
      }
    }

    return false;
  }
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}
