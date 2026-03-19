import * as vscode from "vscode";
import type { ExternalDep } from "../model/index";

export async function extractDependencies(root: vscode.Uri): Promise<ExternalDep[]> {
  const dependencies: ExternalDep[] = [];

  await maybeReadJson(root, "package.json", (json) => {
    const merged = {
      ...(asRecord(json.dependencies)),
      ...(asRecord(json.devDependencies)),
      ...(asRecord(json.peerDependencies))
    };

    for (const [name, version] of Object.entries(merged)) {
      dependencies.push({
        manager: "npm",
        name,
        version: String(version)
      });
    }
  });

  await maybeReadText(root, "requirements.txt", (text) => {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const [name, version] = trimmed.split(/==|>=|<=|~=|>|</);
      dependencies.push({
        manager: "pip",
        name: name?.trim() ?? trimmed,
        version: version?.trim() ?? "*"
      });
    }
  });

  await maybeReadText(root, "go.mod", (text) => {
    const requireBlock = /require\s*\(([^)]+)\)/m.exec(text);
    if (requireBlock) {
      for (const line of requireBlock[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//")) {
          continue;
        }
        const [name, version] = trimmed.split(/\s+/);
        if (name && version) {
          dependencies.push({ manager: "go", name, version });
        }
      }
      return;
    }

    for (const line of text.split(/\r?\n/)) {
      const match = /^require\s+(\S+)\s+(\S+)/.exec(line.trim());
      if (!match) {
        continue;
      }
      dependencies.push({ manager: "go", name: match[1], version: match[2] });
    }
  });

  await maybeReadText(root, "Cargo.toml", (text) => {
    const dependenciesSection = extractTomlSection(text, "dependencies");
    for (const [name, version] of Object.entries(dependenciesSection)) {
      dependencies.push({ manager: "cargo", name, version: String(version) });
    }
  });

  dependencies.sort((a, b) => a.name.localeCompare(b.name));
  return dependencies;
}

async function maybeReadJson(
  root: vscode.Uri,
  filename: string,
  visitor: (value: Record<string, unknown>) => void
): Promise<void> {
  try {
    const uri = vscode.Uri.joinPath(root, filename);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>;
    visitor(parsed);
  } catch {
    // missing file or parse error
  }
}

async function maybeReadText(root: vscode.Uri, filename: string, visitor: (value: string) => void): Promise<void> {
  try {
    const uri = vscode.Uri.joinPath(root, filename);
    const bytes = await vscode.workspace.fs.readFile(uri);
    visitor(Buffer.from(bytes).toString("utf8"));
  } catch {
    // missing file
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function extractTomlSection(text: string, section: string): Record<string, string> {
  const pattern = new RegExp(`\\[${section}\\]([\\s\\S]*?)(?:\\n\\[|$)`, "m");
  const match = pattern.exec(text);
  if (!match) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [name, rawVersion] = trimmed.split("=", 2);
    result[name.trim()] = rawVersion.trim().replace(/^"|"$/g, "");
  }
  return result;
}
