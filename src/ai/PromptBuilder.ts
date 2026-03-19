import type { GeneratedTaskDraft } from "./types";
import { TASK_TYPE_ICONS, type ProjectGoal, type ResearchIndexEntry, type TaskNode, type WorkspaceScan } from "../model/index";

export interface TaskGenerationPromptInput {
  goal: ProjectGoal | undefined;
  scan: WorkspaceScan | undefined;
  knowledge: ResearchIndexEntry[];
  parentTask: TaskNode;
  existingChildren: TaskNode[];
  alreadyExistingAreas: string[];
  includeSignatures: boolean;
}

export interface ImplementPromptInput {
  task: TaskNode;
  ancestors: TaskNode[];
  linkedFileSnapshots: Array<{ path: string; content: string }>;
  researchConclusions: string[];
}

export function buildTaskGenerationPrompt(input: TaskGenerationPromptInput): string {
  const goalLayer = input.goal
    ? [
      `Project Goal: ${input.goal.statement}`,
      `Success Criteria: ${input.goal.successCriteria.join(" | ") || "(none)"}`,
      `Constraints: ${input.goal.constraints.join(" | ") || "(none)"}`,
      `Out of Scope: ${input.goal.outOfScope.join(" | ") || "(none)"}`
    ].join("\n")
    : "Project Goal: (not set)";

  const workspaceLayer = input.scan
    ? buildWorkspaceLayer(input.scan, input.includeSignatures)
    : "Workspace scan unavailable.";

  const knowledgeLayer = input.knowledge.length === 0
    ? "(no indexed research yet)"
    : input.knowledge.map((entry) => `- [${entry.taskId}] ${entry.taskTitle} -> ${entry.conclusion}`).join("\n");

  const existingChildren = input.existingChildren.length === 0
    ? "(none)"
    : input.existingChildren.map((task) => `- [${task.id}] ${TASK_TYPE_ICONS[task.type]} ${task.title}`).join("\n");

  const exclusion = input.alreadyExistingAreas.length === 0
    ? "(none)"
    : input.alreadyExistingAreas.map((item) => `- ${item}`).join("\n");

  return [
    "[SYSTEM LAYER]",
    "You are a senior software architect helping plan a software project.",
    "Always respond in JSON with the requested schema.",
    "Never generate implementation tasks for areas with open research questions.",
    "",
    "[GOAL LAYER]",
    goalLayer,
    "",
    "[WORKSPACE LAYER]",
    workspaceLayer,
    "",
    "[KNOWLEDGE LAYER]",
    knowledgeLayer,
    "",
    "[TASK CONTEXT LAYER]",
    `Parent Task: [${input.parentTask.id}] ${input.parentTask.title}`,
    `Parent Type: ${input.parentTask.type}`,
    "Current Children:",
    existingChildren,
    "",
    "[INSTRUCTION LAYER]",
    "Generate immediate child tasks for the parent task above.",
    "Rules:",
    "1. Generate research/decision tasks for any open questions first.",
    "2. Do not generate tasks for already-existing areas listed below.",
    "3. Every task must reference which goal criterion it serves.",
    "4. Return JSON only using this schema:",
    "{",
    "  \"tasks\": [",
    "    {",
    "      \"title\": \"string\",",
    "      \"type\": \"research|implementation|decision|milestone\",",
    "      \"rationale\": \"string\",",
    "      \"goalCriterionIndex\": 0,",
    "      \"confidence\": 0.0,",
    "      \"dependsOnTitles\": [\"string\"],",
    "      \"linkedFiles\": [\"workspace-relative path\"]",
    "    }",
    "  ]",
    "}",
    "",
    "Already-existing areas:",
    exclusion
  ].join("\n");
}

export function buildImplementationPrompt(input: ImplementPromptInput): string {
  const hierarchy = input.ancestors
    .map((node, index) => `${index + 1}. [${node.id}] ${TASK_TYPE_ICONS[node.type]} ${node.title}`)
    .join("\n");

  const research = input.researchConclusions.length > 0
    ? input.researchConclusions.map((entry) => `- ${entry}`).join("\n")
    : "(none)";

  const snapshots = input.linkedFileSnapshots.length > 0
    ? input.linkedFileSnapshots.map((snapshot) => {
      const escaped = snapshot.content.replace(/```/g, "``\\`");
      return `File: ${snapshot.path}\n\`\`\`\n${escaped}\n\`\`\``;
    }).join("\n\n")
    : "(none)";

  return [
    "You are an implementation agent for a VS Code workspace.",
    "Use the task and research context to prepare safe file writes.",
    "Respond with JSON only.",
    "",
    `Selected Task: [${input.task.id}] ${input.task.title}`,
    `Task Type: ${input.task.type}`,
    "",
    "Ancestor chain:",
    hierarchy,
    "",
    "Resolved research and decision findings:",
    research,
    "",
    "Linked file snapshots:",
    snapshots,
    "",
    "JSON schema:",
    "{",
    "  \"summary\": \"short summary\",",
    "  \"taskCompleted\": true,",
    "  \"changes\": [{ \"path\": \"src/file.ts\", \"content\": \"full file\" }],",
    "  \"tests\": [\"...\"],",
    "  \"risks\": [\"...\"],",
    "  \"researchUsed\": [\"T0003: conclusion\"]",
    "}",
    "Rules: workspace-relative paths only, no deletions, include at least one change."
  ].join("\n");
}

export function summarizeDraftTasks(drafts: GeneratedTaskDraft[]): string {
  return drafts
    .map((task) => `${TASK_TYPE_ICONS[task.type]} ${task.title} (${Math.round(task.confidence * 100)}%)`)
    .join("\n");
}

function buildWorkspaceLayer(scan: WorkspaceScan, includeSignatures: boolean): string {
  const modules = scan.modules
    .slice(0, 12)
    .map((module) => {
      const signatureSummary = includeSignatures
        ? module.signatures
          .slice(0, 3)
          .map((entry) => `${entry.file}: ${entry.exports.slice(0, 3).join(", ") || "(no exports)"}`)
          .join(" | ")
        : "(signature extraction disabled)";
      return `- ${module.name} [${module.estimatedCompletion}] ${module.inferredPurpose}; signatures: ${signatureSummary}`;
    })
    .join("\n");

  const deps = scan.dependencies
    .slice(0, 15)
    .map((dep) => `${dep.name}@${dep.version}`)
    .join(", ");

  const language = scan.detectedLanguages[0]
    ? `${scan.detectedLanguages[0].language} (${scan.detectedLanguages[0].files} files)`
    : "unknown";

  return [
    `Scanned At: ${scan.scannedAt}`,
    `Primary Language: ${language}`,
    `Dependencies: ${deps || "none"}`,
    "Modules:",
    modules || "(none)",
    `Missing Areas: ${scan.missingAreas.join(", ") || "none"}`
  ].join("\n");
}
