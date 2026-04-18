import type { FeatureSummary, ModuleInfo, ProjectGoal } from "../model/index";

export function inferFeatures(modules: ModuleInfo[]): FeatureSummary[] {
  const features: FeatureSummary[] = [];

  for (const module of modules) {
    const summary = module.signatures.length > 0
      ? `Contains ${module.signatures.reduce((sum, entry) => sum + entry.exports.length, 0)} exported functions and ${module.signatures.reduce((sum, entry) => sum + entry.classes.length, 0)} classes`
      : `Contains ${module.files.length} files`;

    const confidence = module.estimatedCompletion === "complete"
      ? 0.85
      : module.estimatedCompletion === "partial"
        ? 0.65
        : 0.4;

    features.push({
      moduleName: module.name,
      summary,
      confidence
    });
  }

  return features;
}

export function inferMissingAreas(goals: ProjectGoal[], modules: ModuleInfo[]): string[] {
  if (goals.length === 0) {
    return [];
  }

  const moduleText = modules
    .map((module) => `${module.name} ${module.inferredPurpose}`.toLowerCase())
    .join(" ");

  const missing = new Set<string>();
  for (const goal of goals) {
    const source = [goal.statement, ...goal.successCriteria].join(" ");
    const keywords = source
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 5);

    for (const keyword of keywords.slice(0, 20)) {
      if (!moduleText.includes(keyword)) {
        missing.add(keyword);
      }
    }
  }

  return Array.from(missing).slice(0, 20);
}
