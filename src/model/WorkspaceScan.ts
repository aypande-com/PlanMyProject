export interface LanguageInfo {
  language: string;
  files: number;
}

export interface ExternalDep {
  manager: string;
  name: string;
  version: string;
}

export interface SignatureSummary {
  file: string;
  exports: string[];
  classes: string[];
  interfaces: string[];
  todos: string[];
}

export interface ModuleInfo {
  name: string;
  files: string[];
  estimatedCompletion: "none" | "partial" | "complete";
  inferredPurpose: string;
  signatures: SignatureSummary[];
}

export interface FeatureSummary {
  moduleName: string;
  summary: string;
  confidence: number;
}

export interface CoverageHint {
  sourceFile: string;
  testFile: string | null;
  hasTest: boolean;
}

export interface WorkspaceScan {
  scannedAt: string;
  rootPath: string;
  detectedLanguages: LanguageInfo[];
  entryPoints: string[];
  modules: ModuleInfo[];
  existingFeatures: FeatureSummary[];
  missingAreas: string[];
  dependencies: ExternalDep[];
  testCoverage: CoverageHint[];
}

export const EMPTY_WORKSPACE_SCAN: WorkspaceScan = {
  scannedAt: new Date(0).toISOString(),
  rootPath: "",
  detectedLanguages: [],
  entryPoints: [],
  modules: [],
  existingFeatures: [],
  missingAreas: [],
  dependencies: [],
  testCoverage: []
};
