# PlanMyProject VS Code Extension - AI Expert Guide

## Overview

**PlanMyProject** is a VS Code extension (v1.0.2+, Node.js/TypeScript) that transforms a rough project idea into a structured, research-first, goal-aligned implementation plan. It bridges the gap between AI-assisted code generation and actual project planning by:

- Grounding tasks in project goals
- Surfacing research/decision questions before implementation
- Accounting for partially written code in the workspace
- Integrating debate and refinement loops
- Auto-maintaining an execution queue of ready-to-implement tasks

**Current branch:** `pmp-v2-rewrite` (latest: fix P2-B10 "parse structured sections from imported goal markdown")

**Repository:** https://github.com/apFire/PlanMyProject  
**License:** MIT  
**Latest Version:** 1.0.2 (published to VS Code Marketplace as "aypande.plan-my-project")

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Models](#data-models)
3. [Core Subsystems](#core-subsystems)
4. [Key Files & Responsibilities](#key-files--responsibilities)
5. [Parser Logic (PlanParser.ts)](#parser-logic)
6. [Commands & VS Code Integration](#commands--vs-code-integration)
7. [Configuration & Settings](#configuration--settings)
8. [Test Setup](#test-setup)
9. [Design Patterns & Conventions](#design-patterns--conventions)
10. [Workspace Scan Engine](#workspace-scan-engine)
11. [Research Index & Task Generation](#research-index--task-generation)
12. [Debate System](#debate-system)

---

## Architecture Overview

### Extension Activation & Lifecycle

The extension follows a standard VS Code extension pattern:

```
extension.ts (activate/deactivate)
  ↓
PlanController (main orchestrator)
  ├─ PlanRepository (persistence layer)
  ├─ WorkspaceScanner (codebase analysis)
  ├─ AIService (Copilot/Claude/OpenAI abstraction)
  ├─ TaskGenerator (AI-driven task creation)
  ├─ DebateService & DebatePanel (task refinement)
  ├─ ResearchIndex (knowledge persistence)
  ├─ PlanTreeProvider (UI tree view)
  ├─ PlanCodeLensProvider (editor inline actions)
  └─ File Watchers (monitor plan file changes)
```

### Activation Events

- `workspaceContains:planmyproject.md` — Plan file exists
- `workspaceContains:projectplan.md` — Legacy plan file exists
- `onView:planmyproject.tree` — User clicks extension icon

### State Management

**In-memory state** (PlanController):
- `plan: PlanDocument` — Full task tree + goals
- `scan: WorkspaceScan` — Cached codebase analysis
- `activeRequest: CancellationTokenSource` — Current AI operation
- `isSelfWriting: boolean` — Flag to ignore self-triggered file watches

---

## Data Models

### Core Types

#### TaskNode
```typescript
interface TaskNode {
  id: string;                    // Globally unique: T0001, T0002, ...
  title: string;                 // Normalized, no leading icons
  type: TaskType;                // "research" | "implementation" | "decision" | "milestone"
  status: TaskStatus;            // "todo" | "in-progress" | "done"
  parentId: string | null;       // null = root task
  children: string[];            // Child task IDs
  origin: TaskOrigin;            // "manual" | "ai-generated" | "code-inferred"
  goalRef: string | null;        // References ProjectGoal.id (e.g., "G0001")
  dependsOn: string[];           // List of task IDs this depends on
  confidence: number | null;     // 0.0-1.0, null = not set
  rationale: string | null;      // Why this task exists (from AI)
  notes: string | null;          // User-added notes
  linkedFiles: string[];         // Workspace-relative paths to relevant code
  debateLog: DebateEntry[];      // Thread of debate interactions
  completedAt: string | null;    // ISO timestamp when marked done
  createdAt: string;             // ISO timestamp of creation
  fileSendPolicy: FileSendPolicy;// "global" | "always" | "never" | "ask"
  line?: number;                 // Line number in plan file (parser fills this)
  archivedDebatePath?: string;   // Path to archived debate entries
}
```

**Task Types:**
- **research**: Knowledge-gathering task; blocks dependent implementations
- **decision**: A deliberation task; blocks dependent implementations
- **implementation**: Code-writing task
- **milestone**: Placeholder for completion gates; not in execution queue

**Status Propagation Rule:**
- Leaf tasks: explicit (from UI or manual edit)
- Parent tasks: derived from children
  - All done → parent done
  - All todo → parent todo
  - Mixed → parent "in-progress"

#### PlanDocument
```typescript
interface PlanDocument {
  schemaVersion: "v1" | "v2";
  goals: ProjectGoal[];          // Project goals (usually 1)
  rootTaskIds: string[];         // Top-level task IDs
  tasks: Record<string, TaskNode>; // All tasks by ID
}
```

#### ProjectGoal
```typescript
interface ProjectGoal {
  id: string;                    // G0001, G0002, ...
  statement: string;             // e.g., "Build multi-tenant invoicing"
  successCriteria: string[];     // What success looks like
  constraints: string[];         // Limitations (tech stack, etc.)
  outOfScope: string[];          // What's explicitly out of scope
}
```

#### WorkspaceScan
Snapshot of codebase structure:
```typescript
interface WorkspaceScan {
  scannedAt: string;             // ISO timestamp
  rootPath: string;
  detectedLanguages: LanguageInfo[];
  entryPoints: string[];         // index.ts, main.js, etc.
  modules: ModuleInfo[];         // Grouped files with signatures
  existingFeatures: FeatureSummary[]; // Inferred functionality
  missingAreas: string[];        // Gaps identified
  dependencies: ExternalDep[];   // npm/pip/go.mod packages
  testCoverage: CoverageHint[];  // Source ↔ test file mapping
}
```

#### ResearchIndexEntry
```typescript
interface ResearchIndexEntry {
  taskId: string;
  taskTitle: string;
  type: "research" | "decision";
  conclusion: string;            // Key findings/decisions
  tags: string[];                // Extracted keywords for queries
  goalRef: string | null;
  completedAt: string;           // ISO timestamp
  usedInPrompts: number;         // Counter for relevance scoring
}
```

#### DebateEntry
```typescript
interface DebateEntry {
  timestamp: string;             // ISO timestamp
  role: "user" | "ai" | "system";
  content: string;               // Message body
  action?: DebateAction;         // "accept", "rewrite", "split", "dismiss", "defer"
  author?: string;               // Git user name for "user" entries
}
```

---

## Core Subsystems

### 1. PlanController (src/controller/PlanController.ts)

**Main orchestrator**, ~1200 lines. Responsibilities:

- Command registration and dispatch
- File watching (plan file changes, text document saves)
- Plan state lifecycle (load → parse → render)
- AI operation gating (consent, active request management)
- Integration of all subsystems

**Key Methods:**
- `activate()` — Register commands, file watchers, CodeLens
- `refreshPlanState()` — Load plan from disk, parse, update UI
- `persistAndRefresh()` — Save plan, clear caches, re-render tree
- `planTask()` — Generate child tasks via AI + TaskGenerator
- `implementTask()` — Send task to AI for code implementation
- `debateTask()` — Open debate panel for task refinement
- `refreshScan()` — Trigger WorkspaceScanner, cache result
- `withActiveRequest()` — CancellationToken wrapper for in-flight AI ops

**File Watching Strategy:**
- Monitors `**/${planFileName}` (default: `planmyproject.md`)
- Watches `onDidSaveTextDocument` for cold-start planUri detection
- Sets `isSelfWriting` flag to avoid re-parsing own writes

### 2. PlanRepository (src/storage/PlanRepository.ts)

**Persistence layer**, manages plan file I/O.

- `loadPlan()` → Reads file, parses with `parsePlanMarkdown()`
- `savePlan(uri, plan, options)` → Serializes with `serializePlanMarkdown()`
- `ensurePlanFile()` → Creates if missing
- `createV1Backup()` → Schema migration support

File locations:
- Primary: `${workspaceRoot}/planmyproject.md` (configurable)
- Legacy: `${workspaceRoot}/projectplan.md`
- Scan cache: `${workspaceRoot}/.pmp/scan-cache.json`
- Research index: `${workspaceRoot}/.pmp/research-index.json`

### 3. WorkspaceScanner (src/scanner/WorkspaceScanner.ts)

**Codebase analysis engine**. Discovers and indexes workspace structure:

**Steps:**
1. Discover files (respecting `.gitignore`, `.eslintignore`, etc.)
2. Filter: source files + test files
3. Extract dependencies (package.json, go.mod, pyproject.toml, etc.)
4. Extract signatures (concurrent, max 10 files at a time)
5. Group files into modules (by directory structure)
6. Infer features & missing areas

**Signature Extraction** (SignatureExtractor.ts):
- Extracts exports, classes, interfaces, TODOs
- Language-aware regex patterns (TypeScript, Python, Go, Java, Kotlin, C#)
- Max 200 signatures per file (configurable)

**Module Grouping** (ModuleGrouper.ts):
- Groups files into logical modules by directory
- Infers module purpose from directory names + file counts
- Marks completion: "none" (rarely), "partial" (mixed), "complete" (mature)

**Caching:**
- Cached in `.pmp/scan-cache.json`
- TTL: `scanner.cacheTtlMinutes` (default: 5 mins)
- Fresh scan on explicit refresh or before AI ops if expired

### 4. AIService (src/ai/AIService.ts)

**AI provider abstraction**. Routes to Copilot, Claude, or OpenAI.

**Providers:**
- `CopilotProvider` — Uses VS Code's built-in Copilot extension
- `ClaudeProvider` — Anthropic API (requires API key in secrets)
- `OpenAIProvider` — OpenAI API (requires API key in secrets)

**API:**
- `generateText(prompt, options)` → `AITextResponse`
- Supports streaming chunks via `onChunk` callback
- Supports cancellation via `CancellationToken`
- Masks sensitive patterns before sending (PromptMasker.ts)

**Provider Selection:**
- From config `planmyproject.aiProvider` (default: "copilot")
- API keys stored in VS Code `secrets` storage (not plaintext settings)

### 5. TaskGenerator (src/generation/TaskGenerator.ts)

**AI-driven task creation**. Generates child tasks for a parent task.

**Input:**
- Parent task context
- Project goal
- Workspace scan (structural overview)
- Research index (prior conclusions)
- Confidence threshold (auto-commit threshold)

**Output:**
```typescript
interface TaskGenerationOutput {
  drafts: GeneratedTaskDraft[];        // All generated tasks
  accepted: GeneratedTaskDraft[];      // Confidence >= threshold
  requiresReview: GeneratedTaskDraft[]; // Confidence < threshold
}
```

**Prompt Construction** (PromptBuilder.ts):
- System layer: "You are a senior software architect"
- Goal layer: Project goal + success criteria + constraints
- Workspace layer: Modules, features, missing areas
- Knowledge layer: Relevant completed research tasks
- Task context: Parent task + existing children
- Instruction: Return JSON schema for tasks

**Response Parsing** (ResponseParser.ts):
- Extracts JSON from AI response (handles markdown fences)
- Validates schema: title, type, confidence, etc.
- Normalizes paths (rejects `..`, absolute paths)
- Returns structured `GeneratedTaskDraft[]`

**Materialization:**
- Converts drafts to TaskNode objects
- Assigns IDs via IdGenerator (next in sequence)
- Sets origin to "ai-generated"
- Resolves dependency edges between generated tasks

### 6. DebateService & DebatePanel (src/debate/)

**Task refinement via multi-turn conversation**.

**DebateService.ts:**
- `generateOpening(task, workspaceSummary)` — Starts debate
- `continueDebate(task, userMessage, workspaceSummary)` — Continues
- `suggestSplitTitles(task, workspaceSummary)` — Proposes splits

Prompts enforce critical style: justify, challenge, rationalize.

**DebatePanel.ts:**
- WebView-based side panel
- Renders debate history with role badges ("PlanBot", "You")
- Input box for user messages
- Buttons for resolution actions

**DebateArchiver.ts:**
- Archives old debate entries to separate `.pmp/` JSON files
- Auto-cleanup based on `debate.archiveAfterDays` setting

### 7. ResearchIndex (src/research/ResearchIndex.ts)

**Knowledge persistence & retrieval**.

- Stores completed research/decision task conclusions
- Tag-based similarity matching for future task generation
- Tracks usage frequency for relevance scoring
- Query API: `queryRelevant({ taskTitle, goalStatement, topN })`

Queries return top-N most relevant entries, re-ranked by tag overlap + usage.

### 8. Tree View & CodeLens (src/ui/)

**TreeProvider.ts:**
- Hierarchical tree of tasks from plan
- Workspace snapshot item (shows scan module count)
- Task item styling (type icon, origin badge, block reason tooltip)
- Throttled refresh during streaming (max 500ms)
- Request status updates (running/success/error/cancelled)

**CodeLensProvider.ts:**
- Registers on the configured plan file
- Inline actions on each task line: Plan | Debate | Implement | Scan
- Drives command dispatch with task ID + file URI

---

## Key Files & Responsibilities

### Source Structure

```
src/
├── extension.ts                 # Entry point (activate/deactivate)
├── controller/
│   └── PlanController.ts        # Main orchestrator (~1200 LOC)
├── model/
│   ├── TaskNode.ts              # Task type + status enums, normalization
│   ├── ProjectGoal.ts           # Goal interface
│   ├── PlanModel.ts             # PlanDocument, tree operations
│   ├── WorkspaceScan.ts         # Scan snapshot interface
│   ├── ResearchIndexEntry.ts    # Research knowledge entry
│   └── index.ts                 # Re-exports all model types
├── parser/
│   ├── PlanParser.ts            # Markdown ↔ PlanDocument bidirectional
│   └── SchemaUpgrader.ts        # v1 → v2 migration
├── storage/
│   ├── PlanRepository.ts        # Plan I/O (load/save)
│   ├── WorkspaceFiles.ts        # Workspace URI utilities
│   ├── ScanCacheStore.ts        # Scan cache persistence
│   └── index.ts                 # Storage utilities
├── ai/
│   ├── AIService.ts             # Provider abstraction & caching
│   ├── CopilotProvider.ts       # Copilot extension integration
│   ├── ClaudeProvider.ts        # Anthropic API
│   ├── OpenAIProvider.ts        # OpenAI API
│   ├── PromptBuilder.ts         # Prompt construction
│   ├── ResponseParser.ts        # JSON response parsing
│   └── types.ts                 # AIProvider, AITextResponse interfaces
├── generation/
│   ├── TaskGenerator.ts         # Draft generation + materialization
│   └── index.ts                 # Re-exports
├── scanner/
│   ├── WorkspaceScanner.ts      # Main scan orchestrator
│   ├── LanguageDetector.ts      # File extension → language
│   ├── DependencyExtractor.ts   # Package manager parsing
│   ├── SignatureExtractor.ts    # Function/class/interface extraction
│   ├── FeatureInferrer.ts       # Feature + missing area inference
│   ├── ModuleGrouper.ts         # Group files into modules
│   ├── IgnoreMatcher.ts         # .gitignore/.eslintignore matcher
│   └── index.ts                 # Re-exports
├── research/
│   ├── ResearchIndex.ts         # Knowledge index I/O & querying
│   ├── TagExtractor.ts          # Extract tags from text
│   └── index.ts                 # Re-exports
├── debate/
│   ├── DebateService.ts         # AI debate conversation
│   ├── DebatePanel.ts           # WebView UI
│   ├── DebateArchiver.ts        # Debate history archival
│   └── index.ts                 # Re-exports
├── ui/
│   ├── TreeProvider.ts          # Task tree view provider
│   ├── CodeLensProvider.ts      # Inline editor actions
│   ├── StatusBarItem.ts         # Status bar indicator
│   ├── GoalSetupPanel.ts        # Goal input WebView
│   └── index.ts                 # Re-exports
├── util/
│   ├── PathSafetyChecker.ts     # Workspace-relative path validation
│   ├── PromptMasker.ts          # Redact secrets before AI sends
│   ├── FileSendPolicyResolver.ts # Per-task file send decisions
│   ├── IdGenerator.ts           # Task ID sequencing
│   ├── GoalParser.ts            # Goal statement parsing
│   └── index.ts                 # Re-exports all utils
└── queue/
    └── QueueBuilder.ts          # Execution queue derivation
```

### Configuration Files

- **package.json** — Extension manifest, commands, keybindings, settings schema, scripts
- **tsconfig.json** — Compiler options (ES2022, strict mode, commonjs)
- **tsconfig.test.json** — Test-specific config (includes test/ + src/)
- **.vscodeignore** — Files excluded from VSIX package

### Test Files

```
test/
├── parser.test.ts               # PlanParser round-trip tests
├── schema-upgrader.test.ts      # v1 → v2 migration
├── response-parser.test.ts      # AI response JSON parsing
├── queue.test.ts                # Execution queue building
├── scanner.test.ts              # Workspace scan logic
├── path-safety.test.ts          # Path validation edge cases
├── goal-parser.test.ts          # Goal statement parsing
├── policy.test.ts               # File send policy resolution
└── shims/
    └── vscode.js                # Minimal VS Code module mock
```

---

## Parser Logic

### Markdown Schema (v2)

```markdown
# Project Plan

<!-- pmp:schema=v2 -->

<!-- pmp:goal:id=G0001;statement=Build invoicing system;scanned=2026-03-29T00:00:00Z -->

## Goals

- [G0001] Build invoicing system
  <!-- pmp:goal-meta:id=G0001;criteria=["Users can create invoices"];constraints=["Node backend"];out-of-scope=["Payments"] -->

## Plan Tree

- [ ] [T0001] 🔍 Evaluate database options
  <!-- pmp:id=T0001;parent=ROOT;type=research;origin=ai-generated;confidence=0.9 -->
  > Rationale: Need to choose between PostgreSQL and MongoDB for multi-tenant data

- [ ] [T0002] 🏗️ Design schema
  <!-- pmp:id=T0002;parent=T0001;type=implementation;origin=ai-generated;dependency=T0001 -->

## Execution Queue (Auto-Generated, Leaf Tasks Only)

### ⚠️ Blocked (Dependencies, Research, Debate)
1. [T0002] 🏗️ Design schema

### 🔍 Research Tasks (act first)
1. [T0001] 🔍 Evaluate database options

### ⚙️ Ready to Implement
(none yet — complete research tasks and resolve open debate threads)
```

### Parsing Algorithm (parsePlanMarkdown)

1. **Line-by-line scan** for headings: `## Plan Tree`, `## Execution Queue`, `## Goals`
2. **Parse Goals** (between Goals and Plan Tree)
   - Inline metadata: `<!-- pmp:goal:id=...;statement=...;scanned=... -->`
   - Meta comments: `<!-- pmp:goal-meta:id=...;criteria=...;constraints=...;out-of-scope=... -->`
3. **Parse Tasks** (between Plan Tree and Execution Queue)
   - Regex: `/^(\s*)- \[( |\/|x|X)\] \[([A-Za-z0-9_-]+)\]\s+(.+)$/`
   - Extract: indentation → depth, status, task ID, title
   - Build tree via stack: push/pop based on depth changes
   - Parse metadata comments below each task line
4. **Recompute derived statuses** (post-order traversal)
5. **Return ParseResult** with schemaVersion, debateConflicts, hasGoal

### Serialization Algorithm (serializePlanMarkdown)

1. **Header** + schema marker (v2)
2. **Goals section** with metadata comments
3. **Plan Tree** (recursive renderTask function)
4. **Execution Queue** (via QueueBuilder)
   - Blocked (with block reason: dependency / research-gate / debate-thread)
   - Research/Decision tasks
   - Ready to Implement
   - Milestones (optional)

**Key normalization:**
- Strips leading status/type icons from titles
- Normalizes whitespace
- Escapes inline values in comments

### Schema Migration (v1 → v2)

**upgradeSchemaV1ToV2():**
- Sets all v1 tasks to `type: "implementation"` and `origin: "manual"`
- Assigns goal reference from first goal if available
- Creates backup: `.pmp/planmyproject.v1.backup.md`
- Prompts user for confirmation

---

## Commands & VS Code Integration

### Registered Commands (package.json → PlanController)

| Command | Handler | UI Trigger |
|---------|---------|-----------|
| `planmyproject.openPlan` | `openPlan()` | Command palette |
| `planmyproject.addRootTask` | `addTask(_, true)` | Tree title bar button |
| `planmyproject.addTask` | `addTask(arg, false)` | Task context menu |
| `planmyproject.planTask` | `planTask(arg)` | CodeLens, Alt+P, Task menu |
| `planmyproject.debateTask` | `debateTask(arg)` | CodeLens, Task menu |
| `planmyproject.implementTask` | `implementTask(arg)` | CodeLens, Task menu |
| `planmyproject.deleteTask` | `deleteTask(arg)` | Task menu |
| `planmyproject.drillDown` | `drillDown(arg)` | Tree item click |
| `planmyproject.refreshTree` | `refreshPlanState()` | Tree title bar button |
| `planmyproject.refreshScan` | `refreshScan()` | Tree title bar button |
| `planmyproject.rebuildQueue` | `persistAndRefresh()` | Tree title bar button |
| `planmyproject.cancelActiveRequest` | `cancelActiveRequest()` | Task menu (active) |
| `planmyproject.setProjectGoal` | `setProjectGoal()` | Welcome view, Tree menu |
| `planmyproject.importGoalStatement` | `importGoalStatement()` | Command palette |
| `planmyproject.exportPlanSummary` | `exportPlanSummary()` | Command palette |
| `planmyproject.markResearchComplete` | `markResearchComplete(arg)` | Task menu (research-like) |
| `planmyproject.showTaskRationale` | `showTaskRationale(arg)` | Task menu |
| `planmyproject.viewLinkedFiles` | `viewLinkedFiles(arg)` | Task menu |
| `planmyproject.viewResearchIndex` | `viewResearchIndex()` | Command palette |
| `planmyproject.viewDebateArchive` | `viewDebateArchive(arg)` | Task menu |
| `planmyproject.setTaskFileSendPolicy` | `setTaskFileSendPolicy(arg)` | Task menu |
| `planmyproject.scanTask` | `scanTask(arg)` | CodeLens |

### Context Values

Control when commands appear in menus:

- `planmyproject.workspaceOpen` — true if folder/workspace open
- `planmyproject.treeEmpty` — true if no root tasks
- `viewItem =~ /^task:/ ` — task in menu
- `viewItem =~ /^task:research$|^task:decision$/` — research-like task

### CodeLens Provider

**Trigger:** Files matching pattern `**/${planFileName}` (default: `planmyproject.md`)

**Provides (per task line):**
- Plan | Debate | Implement | Scan

---

## Configuration & Settings

### Settings Schema (package.json → contributes.configuration)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `planmyproject.aiProvider` | enum | "copilot" | Provider: copilot, claude, openai |
| `planmyproject.claudeApiKey` | string | "" | Claude API key (→ secrets) |
| `planmyproject.openaiApiKey` | string | "" | OpenAI API key (→ secrets) |
| `planmyproject.sendFileContentsToAI` | boolean | false | Global default for file context |
| `planmyproject.defaultTaskFileSendPolicy` | enum | "global" | Per-task default: global, always, never, ask |
| `planmyproject.scanner.extractSignatures` | boolean | true | Extract function/class names |
| `planmyproject.scanner.maxFilesScanned` | number | 500 | File discovery limit |
| `planmyproject.scanner.maxFileSizeKb` | number | 50 | Max file size for signature extraction |
| `planmyproject.scanner.cacheTtlMinutes` | number | 5 | Scan cache freshness (0 = always rescan) |
| `planmyproject.autoRescanOnImplement` | boolean | true | Auto-refresh workspace scan after implement |
| `planmyproject.confidenceThreshold` | number | 0.5 | Min confidence to auto-commit tasks (0-1) |
| `planmyproject.researchGate` | boolean | true | Block implementations until research done |
| `planmyproject.debate.archiveAfterDays` | number | 90 | Debate cleanup threshold |
| `planmyproject.planFileName` | string | "planmyproject.md" | Plan file name |
| `planmyproject.showRationaleInline` | boolean | true | Write AI rationale in plan file |
| `planmyproject.gitignorePmpDir` | boolean | true | Suggest .gitignore for .pmp/ |
| `planmyproject.requireAiConsent` | enum | "first-per-session" | Prompt mode: always, first-per-session, never |

### Privacy & Consent

**Consent Modes:**
- `always` — Prompt before every AI operation
- `first-per-session` — Prompt once, subsequent ops auto-approved
- `never` — No prompts (send context without confirmation)

**Sensitive File Blocking:**
- `.env*`, `.git/**`, `.github/**`, `.vscode/**`
- `.devcontainer/**`
- `tsconfig*.json`, lock files, etc.
- Require extra confirmation to include

---

## Test Setup

### Test Framework

**Node.js built-in `test` module** (no external test runner)

```bash
npm run test           # Compile + run all tests
npm run test:coverage # With code coverage
```

### Test Structure

```
test/
├── parser.test.ts          # Round-trip markdown parsing
├── schema-upgrader.test.ts # v1 → v2 migration
├── response-parser.test.ts # AI response JSON validation
├── queue.test.ts           # Execution queue derivation
├── scanner.test.ts         # File discovery + module grouping
├── path-safety.test.ts     # Path validation (symlinks, traversal)
├── goal-parser.test.ts     # Goal extraction from markdown
├── policy.test.ts          # File send policy resolution
└── shims/
    └── vscode.js           # Mock VS Code API for unit tests
```

### Build & CI

**Scripts:**
- `npm run compile` — TypeScript compilation only
- `npm run watch` — Watch mode compilation
- `npm run build` — Update README build status badges
- `npm run package` — Create .vsix (requires VSCE)
- `npm run publish:vsce` — Publish to VS Code Marketplace

**Build Status Integration:**
- README.md contains markers: `<!-- pmp:build-status:start -->...<!-- pmp:build-status:end -->`
- `scripts/update-readme-build-status.js` updates badges
- Test count, coverage %, feature coverage tracked

---

## Design Patterns & Conventions

### ID Generation

**Task IDs:** `T` + zero-padded sequence (T0001, T0002, ...)  
**Goal IDs:** `G` + zero-padded sequence (G0001, ...)

```typescript
// IdGenerator.ts
export function createTaskIdGenerator(plan: PlanDocument) {
  return () => {
    const maxId = Math.max(0, ...Object.keys(plan.tasks)
      .filter(id => id.startsWith('T'))
      .map(id => parseInt(id.slice(1), 10))
    );
    return `T${String(maxId + 1).padStart(4, '0')}`;
  };
}
```

### Task Type Icons

```typescript
const TASK_TYPE_ICONS: Record<TaskType, string> = {
  research: "🔍",
  implementation: "⚙️",
  decision: "⚖️",
  milestone: "🏁"
};
```

### Error Handling

- **Synchronous**: Throw `Error` with descriptive message
- **Async in commands**: Caught by command wrapper, shown via `vscode.window.showErrorMessage()`
- **No silent failures**: All errors surface to user

### Async Patterns

- **AI operations**: Wrapped in `withActiveRequest(taskId, handler)` for cancellation
- **File I/O**: Via VS Code's `vscode.workspace.fs` (URI-based)
- **Concurrency**: Batch operations with `Promise.all()` (e.g., signature extraction: 10 files at a time)

### State Isolation

- **Per-workspace state**: Stored in `context.workspaceState`
- **Global secrets**: `context.secrets` for API keys
- **Session-only state**: In-memory variables (e.g., `activeRequest`, `scan`)

---

## Workspace Scan Engine

### How Scans Work

```
discoverFiles() → 500 files max
  ↓
Separate source vs test files
  ↓
extractDependencies() → npm, pip, go.mod, etc.
  ↓
extractSignatures() → Parallel (10 at a time)
  ↓
groupFilesIntoModules() → Directory-based clustering
  ↓
inferFeatures() → What's implemented
inferMissingAreas() → What's missing
  ↓
Save to .pmp/scan-cache.json
```

### Signature Extraction Details

**Language support:**
- TypeScript/JavaScript: exports, classes, interfaces, consts
- Python: def, async def, class
- Go: uppercase func, type struct, type interface
- Java/Kotlin/C#: public class, public interface, public methods

**TODO/FIXME extraction:**
- Pattern: `/\b(TODO|FIXME|HACK)\b[:\-]?\s*(.+)?/gi`
- Collected per file

### Module Grouping

**Strategy:**
- Group files by directory tree
- Each directory becomes a potential module
- Infer module name from directory (e.g., `src/auth/` → module "auth")
- Completion estimate: "complete" (10+ files), "partial" (2-9 files), "none" (1 file)
- Infer purpose from directory name + signature count

---

## Research Index & Task Generation

### Research Workflow

1. **Task marked as research:** User runs "Plan Task" on a research-type task
2. **AI generates sub-tasks** (with types and confidence)
3. **User resolves research** (completes research task)
4. **Completion gate:** User marks task done (status → [x])
5. **Knowledge captured:** Conclusion added to research index
6. **Indexed:** Future task generation queries this knowledge
7. **Relevance:** Tag-based matching + usage frequency scoring

### Tag Extraction

```typescript
// Extract keywords: lowercase, split, filter
extractTags("Build authentication system") 
  // → ["build", "authentication", "system"]
```

### Query Scoring

```
score = (tag_overlap * 2) + min(2, floor(usage_count / 3))
```

Rank by score descending, then by completion timestamp.

---

## Debate System

### Debate Flow

1. **User runs "Debate Task"** → Opens DebatePanel WebView
2. **AI generates opening** via `DebateService.generateOpening()`
3. **User messages** → Sent to AI with prior thread
4. **AI critiques** → Justify/challenge/rationalize
5. **Resolution actions** → User clicks: accept, rewrite, split, dismiss, defer
6. **Blocks implementation** → Until debate marked resolved
7. **Archive old debates** → After `debate.archiveAfterDays`

### Unresolved Debate Detection

```typescript
hasUnresolvedDebateThread(task: TaskNode): boolean
  // Returns true if latest user message is after last resolution action
```

### Debate Metadata

Entries tagged with:
- `[action:accept]` — Approved task as-is
- `[action:rewrite]` — AI suggested rewording
- `[action:split]` — AI suggested child tasks
- `[action:dismiss]` — Marked out of scope
- `[action:defer]` — Deferred for later

---

## Notable Implementation Details

### Masked Prompting (PromptMasker.ts)

Before sending prompts to AI, redact:
- Common token patterns
- Email addresses (optional)
- IP addresses (optional)
- Secrets (AWS keys, etc.)

### Path Safety (PathSafetyChecker.ts)

**Validations for workspace writes:**
1. Relative path only (no `/`, no drive letters)
2. No `..` traversal
3. No symlink escape (resolve canonically, check ancestors)
4. Must stay within workspace root

### File Send Policy Resolution (FileSendPolicyResolver.ts)

**Decision tree per task:**
```
Task file send policy:
  global → Use config.sendFileContentsToAI
  always → Send file contents
  never → Don't send
  ask → Prompt user each time
```

### Active Request Management

```typescript
async withActiveRequest(taskId: string, handler: (token) => Promise<void>) {
  // Create cancellation token
  // Set request status on tree
  // Run handler
  // Clear status after ACTIVE_REQUEST_CLEAR_MS (2200ms)
}
```

---

## Recent Commits & Development Context

Current branch: `pmp-v2-rewrite`

Recent fixes (latest first):
- **P2-B10:** Parse structured sections from imported goal markdown
- **P2-B9:** Make scanTask task-scoped when linked files are present
- **P2-B8:** Build file watcher glob from configured planFileName
- **P2-B7:** Batch debate conflict warnings into a single notification
- **P2-B6:** Restrict CodeLens registration to the configured plan file
- **P2-B5:** Add file picker to viewLinkedFiles
- **P2-B4:** Show task rationale in OutputChannel instead of toast
- **P2-B3:** Skip rescan before AI ops when scan is fresh
- **P2-B2:** Defer AI split suggestions until user confirms intent
- **P2-B1:** Make AI consent session-only, add requireAiConsent setting

Performance optimizations (P1-A series):
- Removed redundant `recomputeDerivedStatuses` calls
- Fixed O(n²) queue.shift() in discoverFiles
- Parallelize signature extraction with batched Promise.all
- Throttle tree refresh during streaming (500ms)
- Cache plan URI to avoid filesystem calls
- Eliminate double-triggered plan refresh on save

---

## For Further Development

### Entry Points for Common Tasks

1. **Add new command:** 
   - Register in `PlanController.registerCommands()`
   - Add to package.json `contributes.commands`

2. **Add configuration option:**
   - Define schema in package.json `contributes.configuration.properties`
   - Access via `vscode.workspace.getConfiguration("planmyproject")`

3. **Modify markdown schema:**
   - Edit regex patterns in `PlanParser.ts`
   - Update serialization in `serializePlanMarkdown()`
   - Add migration logic if needed

4. **Extend scanner:**
   - Add language support to `SignatureExtractor.ts`
   - Extend `ModuleGrouper.ts` for new heuristics
   - Add new scan result fields to `WorkspaceScan` interface

5. **Test new features:**
   - Add test file under `test/`
   - Use `test()` + `assert` from Node.js
   - Run `npm test`

---

## Key Dependencies

- **vscode** — ^1.95.0 (VS Code API)
- **@types/vscode** — ^1.95.0 (Types)
- **typescript** — ^5.6.2
- **rimraf** — ^6.1.3 (Clean builds)
- **@vscode/vsce** — ^3.7.1 (Packaging)

No external runtime dependencies (pure TS/Node stdlib).

