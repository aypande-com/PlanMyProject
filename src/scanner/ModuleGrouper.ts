import * as path from "path";
import type { ModuleInfo, SignatureSummary } from "../model";

export function groupFilesIntoModules(filePaths: string[], signaturesByFile: Map<string, SignatureSummary>): ModuleInfo[] {
  const grouped = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const moduleName = segments.length > 1 ? segments[0] : path.parse(normalized).name;
    if (!grouped.has(moduleName)) {
      grouped.set(moduleName, []);
    }
    grouped.get(moduleName)?.push(normalized);
  }

  const modules: ModuleInfo[] = [];
  for (const [name, files] of grouped.entries()) {
    files.sort((a, b) => a.localeCompare(b));
    const signatures = files
      .map((file) => signaturesByFile.get(file))
      .filter((entry): entry is SignatureSummary => Boolean(entry));

    let estimatedCompletion: ModuleInfo["estimatedCompletion"] = "none";
    if (files.length > 0) {
      estimatedCompletion = "partial";
    }
    if (files.length >= 5 || signatures.some((entry) => entry.exports.length >= 3)) {
      estimatedCompletion = "complete";
    }

    modules.push({
      name,
      files,
      estimatedCompletion,
      inferredPurpose: inferPurpose(name, files, signatures),
      signatures
    });
  }

  modules.sort((a, b) => a.name.localeCompare(b.name));
  return modules;
}

function inferPurpose(moduleName: string, files: string[], signatures: SignatureSummary[]): string {
  const lower = moduleName.toLowerCase();
  if (lower.includes("auth")) {
    return "Authentication and access control";
  }
  if (lower.includes("api") || files.some((file) => file.includes("route") || file.includes("controller"))) {
    return "HTTP/API surface";
  }
  if (lower.includes("ui") || lower.includes("view") || lower.includes("component")) {
    return "User interface";
  }
  if (lower.includes("test")) {
    return "Testing and validation";
  }
  if (signatures.some((entry) => entry.interfaces.length > 0)) {
    return "Core domain models and contracts";
  }
  return "General module";
}
