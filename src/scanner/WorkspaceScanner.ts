import * as path from "path";
import * as vscode from "vscode";
import type { CoverageHint, ProjectGoal, SignatureSummary, WorkspaceScan } from "../model/index";
import { detectLanguagesByExtension } from "./LanguageDetector";
import { extractDependencies } from "./DependencyExtractor";
import { extractSignatures } from "./SignatureExtractor";
import { groupFilesIntoModules } from "./ModuleGrouper";
import { inferFeatures, inferMissingAreas } from "./FeatureInferrer";
import { IgnoreMatcher } from "./IgnoreMatcher";
import { getWorkspaceRootUri } from "../storage";

const DEFAULT_SETTINGS: WorkspaceScannerSettings = {
  extractSignatures: true,
  maxFilesScanned: 500,
  maxFileSizeKb: 50
};

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".java", ".kt", ".cs", ".rs", ".php", ".rb"
]);

const TEST_PATTERNS = [/\.test\./i, /\.spec\./i, /_test\./i];
const ENTRY_FILE_NAMES = new Set(["index.ts", "index.js", "main.ts", "main.js", "app.ts", "app.js", "server.ts", "server.js"]);

export interface WorkspaceScannerSettings {
  extractSignatures: boolean;
  maxFilesScanned: number;
  maxFileSizeKb: number;
}

export interface ScanOptions {
  goals?: ProjectGoal[];
  settings?: Partial<WorkspaceScannerSettings>;
  onProgress?: (message: string) => void;
}

export class WorkspaceScanner {
  async scan(options?: ScanOptions): Promise<WorkspaceScan> {
    const root = getWorkspaceRootUri();
    const settings = { ...DEFAULT_SETTINGS, ...(options?.settings ?? {}) };
    const matcher = await IgnoreMatcher.fromWorkspace(root);

    options?.onProgress?.("Discovering workspace files...");
    const allFiles = await discoverFiles(root, matcher, settings.maxFilesScanned);

    const sourceFiles = allFiles.filter((file) => isSourceFile(file));
    const testFiles = allFiles.filter((file) => isTestFile(file));

    options?.onProgress?.("Extracting dependency information...");
    const dependencies = await extractDependencies(root);

    options?.onProgress?.("Extracting signatures...");
    const signaturesByFile = new Map<string, SignatureSummary>();
    if (settings.extractSignatures) {
      const filesToScan = sourceFiles.filter((file) => !isGeneratedPath(file));
      const CONCURRENCY = 10;
      for (let i = 0; i < filesToScan.length; i += CONCURRENCY) {
        const batch = filesToScan.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (file) => {
            const uri = vscode.Uri.joinPath(root, ...file.split("/"));
            const bytes = await vscode.workspace.fs.readFile(uri);
            if (bytes.length > settings.maxFileSizeKb * 1024) {
              return null;
            }
            const content = Buffer.from(bytes).toString("utf8");
            return { file, signatures: extractSignatures(file, content, { maxPerFile: 200 }) };
          })
        );
        for (const result of results) {
          if (result) {
            signaturesByFile.set(result.file, result.signatures);
          }
        }
      }
    }

    options?.onProgress?.("Building module map...");
    const modules = groupFilesIntoModules(sourceFiles, signaturesByFile);
    const existingFeatures = inferFeatures(modules);
    const missingAreas = inferMissingAreas(options?.goals ?? [], modules);
    const testCoverage = buildCoverageHints(sourceFiles, testFiles);

    const detectedLanguages = detectLanguagesByExtension(sourceFiles);
    const entryPoints = allFiles.filter((file) => ENTRY_FILE_NAMES.has(path.posix.basename(file)));

    return {
      scannedAt: new Date().toISOString(),
      rootPath: root.fsPath,
      detectedLanguages,
      entryPoints,
      modules,
      existingFeatures,
      missingAreas,
      dependencies,
      testCoverage
    };
  }
}

async function discoverFiles(root: vscode.Uri, matcher: IgnoreMatcher, maxFiles: number): Promise<string[]> {
  const discovered: string[] = [];
  const queue: Array<{ uri: vscode.Uri; relativePath: string }> = [{ uri: root, relativePath: "" }];
  let head = 0; // index-based dequeue avoids O(n) array shift

  while (head < queue.length && discovered.length < maxFiles) {
    const current = queue[head++];

    const entries = await vscode.workspace.fs.readDirectory(current.uri);
    for (const [name, type] of entries) {
      const relativePath = current.relativePath ? `${current.relativePath}/${name}` : name;
      if (matcher.shouldIgnore(relativePath)) {
        continue;
      }

      if (type === vscode.FileType.Directory) {
        queue.push({
          uri: vscode.Uri.joinPath(current.uri, name),
          relativePath
        });
        continue;
      }

      if (type === vscode.FileType.File) {
        discovered.push(relativePath.replace(/\\/g, "/"));
        if (discovered.length >= maxFiles) {
          break;
        }
      }
    }
  }

  discovered.sort((a, b) => a.localeCompare(b));
  return discovered;
}

function isSourceFile(filePath: string): boolean {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }
  return !isTestFile(filePath);
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return TEST_PATTERNS.some((pattern) => pattern.test(lower)) || lower.includes("/test/") || lower.includes("/tests/");
}

function isGeneratedPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.includes("/generated/") || lower.includes("/dist/") || lower.includes("/build/");
}

function buildCoverageHints(sourceFiles: string[], testFiles: string[]): CoverageHint[] {
  const testIndex = new Set(
    testFiles.map((file) => file
      .toLowerCase()
      .replace(/\.test\.|\.spec\.|_test\./, ".")
      .replace(/\/tests?\//, "/"))
  );

  const hints: CoverageHint[] = [];
  for (const source of sourceFiles) {
    const normalized = source.toLowerCase();
    const hasTest = testIndex.has(normalized);
    const guessedTest = guessTestPath(source, hasTest ? source : undefined);
    hints.push({
      sourceFile: source,
      testFile: hasTest ? guessedTest : null,
      hasTest
    });
  }

  return hints;
}

function guessTestPath(sourcePath: string, matchedSourcePath?: string): string {
  if (matchedSourcePath) {
    return matchedSourcePath;
  }

  const extension = path.posix.extname(sourcePath);
  const stem = sourcePath.slice(0, sourcePath.length - extension.length);
  return `${stem}.test${extension}`;
}
