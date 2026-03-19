# PlanMyProject v2 — Complete Specification
**For Spec-Driven Development**
Version: 2.0.0-rc1 | Date: 2026-03-18 | All open questions resolved

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Core Tenants (Preserved from v1)](#2-core-tenants-preserved-from-v1)
3. [What's Changing in v2](#3-whats-changing-in-v2)
4. [Architecture Overview](#4-architecture-overview)
5. [Data Models](#5-data-models)
6. [Workspace Analysis Engine](#6-workspace-analysis-engine)
7. [Research-Focused Task Generation](#7-research-focused-task-generation)
8. [Plan File Schema v2](#8-plan-file-schema-v2)
9. [UI Components](#9-ui-components)
10. [Commands](#10-commands)
11. [AI Integration Layer](#11-ai-integration-layer)
12. [Partial Codebase Awareness](#12-partial-codebase-awareness)
13. [Task Debate & Refinement Loop](#13-task-debate--refinement-loop)
14. [Execution & Implementation](#14-execution--implementation)
15. [Storage & Persistence](#15-storage--persistence)
16. [Security & Safety](#16-security--safety)
17. [Extension Configuration](#17-extension-configuration)
18. [File Structure](#18-file-structure)
19. [Testing Requirements](#19-testing-requirements)
20. [Migration from v1](#20-migration-from-v1)

---

## 1. Overview & Vision

### Problem Statement

AI-assisted development (e.g., Copilot, Claude, Cursor) accelerates code generation but creates a fundamental planning gap: tasks are generated without regard to (a) what has already been built, (b) what the project's research gaps are before coding can begin, and (c) whether sub-tasks reflect real project goals vs. generic patterns.

PlanMyProject v2 bridges this gap by acting as the **thinking layer before coding begins**, ensuring every task in the plan is:

- **Grounded** in the actual project goals
- **Research-aware** — knowledge gaps are surfaced as first-class tasks before implementation tasks
- **Context-aware** — partial code in the workspace informs what remains to be done
- **Debatable** — every task can be challenged, refined, and broken down until clarity is reached

### Elevator Pitch

> PlanMyProject v2 is a VS Code extension that turns a rough project idea into a structured, research-first, goal-aligned implementation plan — accounting for code you've already written, surfacing unknowns before you hit them, and integrating seamlessly into AI-driven development workflows.

---

## 2. Core Tenants (Preserved from v1)

The following behaviors and design principles are carried forward unchanged in spirit:

| Tenant | Description |
|--------|-------------|
| **Single source of truth** | One plan file per workspace (`planmyproject.md`) in source control |
| **Markdown-first** | Plan is human-readable and editable without the extension |
| **Tree structure** | Tasks form a parent-child hierarchy with globally unique IDs |
| **Leaf-task execution queue** | Auto-generated queue of only leaf (actionable) tasks |
| **One-level AI planning** | AI expands only one level at a time; user controls depth |
| **Implement with AI** | Leaf tasks can be sent to AI for code implementation |
| **Status propagation** | Parent status derives from children (`[ ]`, `[/]`, `[x]`) |
| **Safe workspace writes** | Implemented files are validated before writing; no deletions |
| **Per-request AI consent** | Copilot/LLM calls require explicit approval |
| **Cancel active request** | Any in-flight AI request can be cancelled |

---

## 3. What's Changing in v2

### 3.1 Additions

| Feature | Description |
|---------|-------------|
| **Workspace scanner** | Analyzes existing files, directories, code structure, and (by default) function/class signatures before generating any task |
| **Research task type** | New task type: `[R]` — knowledge/decision tasks that must precede implementation |
| **Goal anchoring** | Every task generated references the project goal it serves |
| **Codebase delta mode** | When partial code exists, task generation focuses on what's missing, not what exists |
| **Debate panel** | Side panel for challenging any task with AI facilitation |
| **Confidence scoring** | Each generated task carries an AI confidence score and rationale |
| **Task origins** | Tasks are tagged with their source: `manual`, `ai-generated`, `code-inferred` |
| **Dependency edges** | Tasks can declare explicit dependencies on other tasks |
| **Research completion gate** | Implementation tasks blocked until their required research tasks are resolved |
| **Research index** | Completed research/decision task notes are indexed and injected into future AI prompts as project knowledge |
| **Per-task file-send override** | `sendFileContentsToAI` can be overridden per-task, independent of the global setting |

### 3.2 Removals / Replacements

| v1 Feature | v2 Status | Reason |
|------------|-----------|--------|
| `Load Requirements File` command | **Replaced** by `Import Goal Statement` — richer intake with structured goal parsing |
| Generic Copilot planning prompt | **Replaced** by goal-anchored, codebase-aware prompt pipeline |
| Flat task creation | **Replaced** by typed task creation (Research / Implementation / Decision) |

### 3.3 Unchanged

- Markdown file format (extended, backward-compatible)
- Tree view in Activity Bar
- CodeLens on plan lines
- Status `[ ]` / `[/]` / `[x]` notation
- Delete + confirmation
- Rebuild Execution Queue

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                   │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│  │   Commands  │    │   Tree Provider  │    │  WebView Panel│   │
│  │  (entry pts)│    │  (sidebar tree)  │    │ (Debate UI)   │   │
│  └──────┬──────┘    └────────┬─────────┘    └───────┬───────┘   │
│         │                    │                      │           │
│         └──────────┬─────────┘                      │           │
│                    ▼                                │           │
│         ┌──────────────────┐                        │           │
│         │  PlanController  │◄───────────────────────┘           │
│         │  (orchestrator)  │                                    │
│         └────────┬─────────┘                                    │
│          ┌───────┼──────────────────────────┐                   │
│          ▼       ▼                          ▼                   │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ PlanParser │  │WorkspaceScanner  │  │   AIService          │ │
│  │ (read/write│  │(code analysis)   │  │ (Copilot/LLM bridge) │ │
│  │  plan file)│  └──────────────────┘  └──────────────────────┘ │
│  └────────────┘                                                 │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────┐                                       │
│  │  PlanModel (in-mem)  │                                       │
│  │  TaskNode[]          │                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `PlanController` | Wires all modules; handles command dispatch and state |
| `PlanParser` | Read/write `planmyproject.md`; parses task tree from Markdown |
| `PlanModel` | In-memory task graph; enforces invariants |
| `WorkspaceScanner` | File discovery, language detection, function/class signature extraction (default on, configurable), dependency graph, coverage heuristics |
| `AIService` | Prompt construction, Copilot/LLM call, response parsing, streaming |
| `TaskGenerator` | Takes scanner output + goal + selected task → generates typed children |
| `DebateService` | Manages multi-turn AI debate sessions per task |
| `TreeProvider` | VS Code `TreeDataProvider` for the sidebar |
| `CodeLensProvider` | CodeLens actions on plan file lines |
| `DebatePanel` | WebView panel for the debate UI |
| `QueueBuilder` | Derives execution queue from leaf tasks + dependency order |

---

## 5. Data Models

### 5.1 TaskNode

```typescript
interface TaskNode {
  id: string;                    // e.g. "T0001"
  title: string;
  type: TaskType;                // 'research' | 'implementation' | 'decision' | 'milestone'
  status: TaskStatus;            // 'todo' | 'in-progress' | 'done'
  parentId: string | null;       // null for root tasks
  children: string[];            // ordered child IDs
  origin: TaskOrigin;            // 'manual' | 'ai-generated' | 'code-inferred'
  goalRef: string | null;        // ID of root goal this task serves
  dependsOn: string[];           // explicit dependency IDs (must complete before this)
  confidence: number | null;     // 0.0–1.0, set by AI on generation
  rationale: string | null;      // AI-generated rationale for this task
  notes: string | null;          // free-text user notes
  linkedFiles: string[];         // workspace-relative paths this task relates to
  debateLog: DebateEntry[];      // recorded debate history
  completedAt: string | null;    // ISO date when marked done
  createdAt: string;
}

type TaskType = 'research' | 'implementation' | 'decision' | 'milestone';
type TaskStatus = 'todo' | 'in-progress' | 'done';
type TaskOrigin = 'manual' | 'ai-generated' | 'code-inferred';
```

### 5.2 ProjectGoal

```typescript
interface ProjectGoal {
  id: string;                    // "G0001"
  statement: string;             // the full goal description
  successCriteria: string[];     // what "done" looks like
  constraints: string[];         // known constraints (tech stack, time, etc.)
  outOfScope: string[];          // explicitly excluded concerns
}
```

### 5.3 WorkspaceScan

```typescript
interface WorkspaceScan {
  scannedAt: string;
  rootPath: string;
  detectedLanguages: LanguageInfo[];
  entryPoints: string[];         // main files (e.g. index.ts, main.py)
  modules: ModuleInfo[];         // logical groupings of files
  existingFeatures: FeatureSummary[]; // inferred from code
  missingAreas: string[];        // gaps inferred from goals vs. code
  dependencies: ExternalDep[];   // package.json / requirements.txt entries
  testCoverage: CoverageHint[];  // files with/without test counterparts
}

interface ModuleInfo {
  name: string;
  files: string[];
  estimatedCompletion: 'none' | 'partial' | 'complete';
  inferredPurpose: string;
}
```

### 5.4 DebateEntry

```typescript
interface DebateEntry {
  timestamp: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  action?: 'split' | 'rewrite' | 'dismiss' | 'accept' | 'defer';
}
```

### 5.5 ResearchIndexEntry

Completed research and decision task conclusions are stored in a queryable index, injected into future AI prompts as accumulated project knowledge.

```typescript
interface ResearchIndexEntry {
  taskId: string;                  // e.g. "T0003"
  taskTitle: string;
  type: 'research' | 'decision';
  conclusion: string;              // user-recorded finding or decision
  tags: string[];                  // auto-extracted keywords for retrieval
  goalRef: string | null;
  completedAt: string;             // ISO date
  usedInPrompts: number;           // count of times injected into AI calls
}
```

The index is stored in `.pmp/research-index.json` and committed alongside the plan file. The `PromptBuilder` queries the index by tag overlap with the current task's title and goal, injecting the top-N most relevant entries into the `[KNOWLEDGE LAYER]` of the prompt (see §11.2).

### 5.6 TaskFileSendPolicy

Per-task override for whether file contents are sent to AI, independent of the global setting:

```typescript
type FileSendPolicy = 'global' | 'always' | 'never' | 'ask';

// Stored as a field on TaskNode:
fileSendPolicy: FileSendPolicy;   // default: 'global' (inherits planmyproject.sendFileContentsToAI)
```

---

## 6. Workspace Analysis Engine

The `WorkspaceScanner` runs before any AI planning call. Its output feeds the `TaskGenerator` with context about what already exists.

### 6.1 Scan Triggers

- On `PlanMyProject: Open Plan` (if workspace not previously scanned)
- On `PlanMyProject: Plan Task` (always, to get fresh context)
- On `PlanMyProject: Refresh Scan` (manual command)
- Automatically after any `Implement Task` completes

### 6.2 Scan Pipeline

```
1. File discovery
   └─ Walk workspace root (respects .gitignore, .pmpignore)
   └─ Classify: source / test / config / asset / generated

2. Language detection
   └─ Detect primary language(s) from extension counts + package files
   └─ Record framework hints (react, express, django, etc.)

3. Dependency extraction
   └─ Parse package.json / requirements.txt / go.mod / Cargo.toml
   └─ List direct dependencies with versions

4. Module grouping
   └─ Group files by directory into logical modules
   └─ Infer module purpose from directory name + file names + export symbols

5. Signature extraction  ← DEFAULT ON; toggle via `scanner.extractSignatures`
   └─ For each source file within size limit:
       └─ Extract: exported function names + parameter shapes
       └─ Extract: class names + public method names
       └─ Extract: interface/type names
       └─ Extract: TODO/FIXME/HACK comments as gap signals
   └─ Produce per-file SignatureSummary[]
   └─ Cap: max 200 signatures per module to bound prompt size

6. Feature inference
   └─ For each module, combine file names + signatures to infer what is implemented
   └─ Match against goal's success criteria to find gaps
   └─ Signature-level inference (when enabled): can detect "login exists, refresh missing"
      vs. file-level inference (when disabled): can only detect "auth/ directory exists"

7. Test coverage hints
   └─ Find .test. / .spec. / _test. files
   └─ Map to source counterparts; flag untested modules

8. Produce WorkspaceScan output
```

### 6.3 Signature Extraction Details

When `scanner.extractSignatures` is enabled (default):

- **TypeScript / JavaScript**: uses regex + lightweight AST walk (no full tsc dependency) to extract `export function`, `export class`, `export const` declarations
- **Python**: extracts `def`, `class`, and `async def` at module level
- **Java / Kotlin / C#**: extracts `public` method and class declarations
- **Go**: extracts exported identifiers (capitalized)
- **Other languages**: falls back to file-level analysis only

Signature extraction is skipped for:
- Files larger than `scanner.maxFileSizeKb` (default 50 KB)
- Files in `generated/`, `dist/`, `build/` directories
- Files matching `.pmpignore` patterns

**Performance note**: Signature extraction adds ~200–800ms to scan time for a 500-file project. A progress indicator is shown in the status bar during scan. Users on large monorepos should consider raising `scanner.maxFilesScanned` with care or using `.pmpignore` to exclude unrelated packages.

### 6.4 Scan Scope Limits

- Maximum files scanned: 2,000 (configurable, default 500)
- Maximum file size read for content analysis: 50 KB per file
- Ignored always: `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`
- User-configurable ignore patterns via `.pmpignore` in workspace root

### 6.5 Scan Result Display

- Shown in a collapsible "Workspace Snapshot" section at the top of the Debate Panel
- Summary line in the tree view status bar: e.g. `Scan: 3 modules | 2 partial | 1 untested`

---

## 7. Research-Focused Task Generation

This is the primary behavioral change in v2. The AI task generator is redesigned to produce research tasks first, implementation tasks second, and never generate implementation tasks for areas where open questions remain.

### 7.1 Task Type Definitions

| Type | Icon | Meaning |
|------|------|---------|
| `research` | 🔍 | Requires investigation, proof-of-concept, or decision before code can be written |
| `decision` | ⚖️ | Architectural or design choice that must be resolved and recorded |
| `implementation` | ⚙️ | Concrete coding task; should only appear once research/decision parents are resolved |
| `milestone` | 🏁 | Non-actionable grouping task with no direct implementation |

### 7.2 Generation Ordering Rules

When generating children for a task, the AI must:

1. **First pass — identify unknowns**: Scan the task title + description + workspace context for any unresolved questions. Each unknown becomes a `research` or `decision` task.
2. **Second pass — identify what already exists**: Using `WorkspaceScan`, skip generating tasks for code that already exists and is complete.
3. **Third pass — generate implementation tasks**: Only for gaps confirmed to require new code, referencing the research tasks they depend on.
4. **Fourth pass — identify missing tests**: If a module exists without tests, add a test task.

### 7.3 Research Task Examples

A task "Build authentication system" for a project with an existing Express.js backend might generate:

```
[R] Research: Evaluate JWT vs. session-based auth for this use case
[⚖️] Decision: Choose token storage strategy (httpOnly cookie vs. localStorage)
[R] Research: Review existing middleware in src/middleware/ for reuse potential  ← code-inferred
[⚙️] Implement: JWT generation and validation utility
[⚙️] Implement: Login endpoint (POST /auth/login)
[⚙️] Implement: Token refresh endpoint
[⚙️] Implement: Auth middleware for protected routes
[⚙️] Test: Auth module unit tests
```

Note: the third item above was generated because `WorkspaceScan` detected existing middleware files — without the scanner, this task would not exist.

### 7.4 Goal Anchoring

Every generated task must carry a `goalRef` linking it to a project goal. When displaying tasks, the goal reference is shown in the detail pane. Tasks without a clear goal linkage are flagged with a ⚠️ icon and surfaced to the user for review.

### 7.5 Confidence Scoring

The AI returns a confidence score (0.0–1.0) per generated task:

- **≥ 0.8**: Displayed normally
- **0.5–0.79**: Shown with a yellow indicator; rationale shown inline
- **< 0.5**: Shown with a red indicator and a "Review" prompt; user must confirm before task is committed to the plan

Low-confidence tasks are not written to the plan file until the user accepts, rewrites, or dismisses them.

---

## 8. Plan File Schema v2

The plan file remains a Markdown file for human readability. v2 extends the comment-based metadata.

### 8.1 File Header

```markdown
# Project Plan

<!-- pmp:schema=v2 -->
<!-- pmp:goal:id=G0001;statement=Build a multi-tenant SaaS invoicing tool;scanned=2026-03-18T10:00:00Z -->

## Goals

- [G0001] Build a multi-tenant SaaS invoicing tool
  <!-- pmp:goal-meta:id=G0001;criteria=["Users can create invoices","Users can send invoices via email"];constraints=["React frontend","Node backend"];out-of-scope=["Payment processing"] -->

## Plan Tree

...

## Execution Queue (Auto-Generated, Leaf Tasks Only)

...
```

### 8.2 Task Line Format

```markdown
- [ ] [T0003] 🔍 Research: Evaluate PDF generation libraries
  <!-- pmp:id=T0003;parent=T0002;type=research;origin=ai-generated;goalRef=G0001;confidence=0.91;dependsOn=[];linkedFiles=[] -->
  > Rationale: PDF generation is a core output of invoicing but library choice affects bundle size and font support. Must be resolved before implementation.
```

### 8.3 Schema Rules

- `pmp:id` — always present on every task line
- `pmp:schema=v2` — in file header; triggers v2 parser
- `pmp:schema=v1` — triggers v1-compatibility parser for migration
- Rationale block (`> Rationale: ...`) is optional but written by AI on generation
- `linkedFiles` is a JSON array of workspace-relative paths
- `dependsOn` is a JSON array of task IDs

### 8.4 Execution Queue Format (v2)

The queue includes task type icons and blocks implementation tasks whose research dependencies are incomplete:

```markdown
## Execution Queue (Auto-Generated, Leaf Tasks Only)

### ⚠️ Blocked (Research incomplete)
1. [T0005] ⚙️ Implement: JWT generation utility — blocked by [T0003]

### 🔍 Research Tasks (act first)
1. [T0003] 🔍 Research: Evaluate PDF generation libraries
2. [T0004] ⚖️ Decision: Choose auth token storage strategy

### ⚙️ Ready to Implement
(none yet — complete research tasks above)
```

---

## 9. UI Components

### 9.1 Activity Bar — Implementation Tree (Unchanged structure, new content)

The tree view retains its v1 structure but adds:

- **Task type icon** prefixed to each task label
- **Confidence indicator**: colored dot (green/yellow/red) on AI-generated tasks
- **Origin badge**: small `AI` / `ME` / `⬛` label
- **Blocked indicator**: 🔒 on tasks whose `dependsOn` tasks are incomplete
- **Workspace Snapshot node**: collapsible, at top of tree, showing scan summary

Tree item context menu additions:
- `Debate Task` (opens Debate Panel for that task)
- `Mark as Research Complete` (on research tasks only)
- `Show Rationale`
- `View Linked Files`

### 9.2 Debate Panel (New — WebView)

A WebView panel that opens to the side of the editor when `Debate Task` is triggered.

**Sections:**

```
┌─────────────────────────────────────────┐
│  🔍 T0003 — Research: Evaluate PDF...   │
│  Goal: G0001 | Confidence: 91%          │
├─────────────────────────────────────────┤
│  WORKSPACE CONTEXT                      │
│  ▾ src/invoices/ — partial (2/5 files)  │
│    ✓ invoice.model.ts                   │
│    ✗ invoice.pdf.ts (missing)           │
├─────────────────────────────────────────┤
│  RATIONALE                              │
│  PDF generation is a core output of..  │
├─────────────────────────────────────────┤
│  DEBATE                                 │
│  [User]: Is this really necessary?...  │
│  [AI]: Yes, because...                 │
│  [User input box]        [Send]        │
├─────────────────────────────────────────┤
│  ACTIONS                               │
│  [Accept] [Rewrite] [Split] [Dismiss]  │
└─────────────────────────────────────────┘
```

**Debate Actions:**

| Action | Effect |
|--------|--------|
| `Accept` | Task is committed to plan as-is |
| `Rewrite` | User edits task title inline; AI updates rationale |
| `Split` | AI proposes breaking task into 2–4 sub-tasks; user approves each |
| `Dismiss` | Task is removed from pending tasks (not added to plan) |
| `Defer` | Task is added to plan with `[deferred]` tag and low queue priority |

### 9.3 Goal Setup Panel (New — WebView or Input Flow)

Shown on first run or via `PlanMyProject: Set Project Goal`.

**Steps:**
1. Enter goal statement (multi-line text input)
2. Enter success criteria (one per line)
3. Enter known constraints (tech stack, timeline, etc.)
4. Enter explicit out-of-scope items
5. Confirm → writes `G0001` to plan file header

### 9.4 CodeLens (Extended)

v1 CodeLens actions: `Plan | Drill | Implement`

v2 CodeLens actions: `Plan | Debate | Implement | Scan`

- `Scan` triggers a targeted re-scan of files linked to this task

### 9.6 Empty State — No Root Task

When the plan file exists but contains no root tasks (or the plan file does not yet exist), the tree view shows an empty-state placeholder instead of a blank panel:

```
┌─────────────────────────────────────┐
│  PlanMyProject                      │
│                                     │
│  No tasks yet.                      │
│                                     │
│  → Add a root task to get started   │  ← clickable link
│  → Set a project goal               │  ← clickable link (if no goal set)
│                                     │
└─────────────────────────────────────┘
```

- "Add a root task to get started" triggers `PlanMyProject: Add Root Task` directly (no command palette needed)
- "Set a project goal" triggers `PlanMyProject: Set Project Goal`
- Planning commands (`Plan Task`, `Implement Task`, `Debate Task`) are **not blocked** — they show a warning notification if invoked without a root task: "No tasks found. Add a root task first." with an inline `Add Root Task` button
- There is no hard gate on planning without a goal — the goal prompt uses warn-only UX with a persistent status bar indicator: `⚠ No project goal set` (clickable → opens Goal Setup Panel)

### 9.7 Status Bar Item

A persistent status bar item showing:
- Current scan status: `🔍 Scanned 3m ago`
- Active request indicator when AI is running
- Click to trigger `Refresh Scan`

---

## 10. Commands

### 10.1 Retained from v1 (behavior may be updated)

| Command | Keybinding | Changes in v2 |
|---------|-----------|---------------|
| `PlanMyProject: Open Plan` | — | Also triggers workspace scan if none exists |
| `PlanMyProject: Plan Task (One Level)` | `Alt+P` | Now produces typed tasks; uses workspace scan |
| `PlanMyProject: Add Task` | — | Prompts for task type |
| `PlanMyProject: Add Root Task` | — | Prompts for task type |
| `PlanMyProject: Drill Down Task` | — | Unchanged |
| `PlanMyProject: Implement Task (Copilot)` | — | Blocked if research dependencies incomplete |
| `PlanMyProject: Delete Task` | — | Unchanged |
| `PlanMyProject: Rebuild Execution Queue` | — | Now includes blocked/research grouping |
| `PlanMyProject: Refresh Tree` | — | Unchanged |
| `PlanMyProject: Cancel Active Request` | — | Unchanged |

### 10.2 New Commands

| Command | Description |
|---------|-------------|
| `PlanMyProject: Set Project Goal` | Opens goal setup panel |
| `PlanMyProject: Refresh Scan` | Re-scans workspace and updates model |
| `PlanMyProject: Debate Task` | Opens Debate Panel for selected task |
| `PlanMyProject: Mark Research Complete` | Marks a research task done; records conclusion; indexes finding; unblocks dependents |
| `PlanMyProject: Show Task Rationale` | Displays rationale in notification or panel |
| `PlanMyProject: View Linked Files` | Opens all `linkedFiles` for the selected task |
| `PlanMyProject: Import Goal Statement` | Replaces v1 `Load Requirements File`; parses a `.md` file into a structured goal |
| `PlanMyProject: Export Plan Summary` | Exports plan tree as a clean Markdown summary (no `pmp:` metadata) |
| `PlanMyProject: View Research Index` | Opens `.pmp/research-index.json` in a read-only formatted editor tab |
| `PlanMyProject: View Debate Archive` | Opens archived debate entries for selected task |
| `PlanMyProject: Set Task File Send Policy` | Sets per-task `fileSendPolicy` override (`global` / `always` / `never` / `ask`) |

### 10.3 Removed Commands

| v1 Command | Replacement |
|------------|-------------|
| `PlanMyProject: Load Requirements File` | `PlanMyProject: Import Goal Statement` |

---

## 11. AI Integration Layer

### 11.1 Provider Support

v2 supports multiple AI providers (abstracted behind `AIService`):

| Provider | Mode | Notes |
|----------|------|-------|
| GitHub Copilot | Primary (as in v1) | Via `vscode.lm` API |
| Anthropic Claude (API key) | Optional | User configures API key in settings |
| OpenAI (API key) | Optional | User configures API key in settings |

Provider selection: `planmyproject.aiProvider` setting (default: `copilot`).

### 11.2 Prompt Architecture

Each AI call uses a structured prompt composed of layers:

```
[SYSTEM LAYER]
You are a senior software architect helping plan a software project.
Always respond in the JSON schema specified.
Never generate implementation tasks for areas with open research questions.

[GOAL LAYER]
Project Goal: {goal.statement}
Success Criteria: {goal.successCriteria}
Constraints: {goal.constraints}
Out of Scope: {goal.outOfScope}

[WORKSPACE LAYER]  ← new in v2
Existing Modules:
  - src/auth/ [partial: login done, refresh missing]
    Signatures: createJWT(payload, secret), verifyJWT(token), loginHandler(req, res)
  - src/invoices/ [partial: model done, PDF missing]
    Signatures: InvoiceModel.create(), InvoiceModel.findById()
Primary Language: TypeScript (Node.js + Express)
Existing Dependencies: express, jsonwebtoken, prisma
Note: signature detail included when scanner.extractSignatures=true AND task fileSendPolicy permits

[KNOWLEDGE LAYER]  ← new in v2; populated from ResearchIndex
Prior research and decisions relevant to this task:
  - [T0003] Evaluated PDF libraries → Decided: pdfkit v4.0.2 (low bundle, good font support)
  - [T0004] Token storage → Decided: httpOnly cookie (XSS protection required)
(top-5 entries by tag overlap with current task; empty if no prior research)

[TASK CONTEXT LAYER]
Parent Task: {task.title}
Current Children (if any): {task.children}
Task Type: {task.type}

[INSTRUCTION LAYER]
Generate immediate child tasks for the parent task above.
Rules:
1. Generate research/decision tasks for any open questions first.
2. Do not generate tasks for: {alreadyExistingAreas}
3. Every task must reference which goal criterion it serves.
4. Return JSON only — schema below.

[RESPONSE SCHEMA]
{
  "tasks": [
    {
      "title": "string",
      "type": "research|implementation|decision|milestone",
      "rationale": "string",
      "goalCriterionIndex": number,
      "confidence": number (0.0-1.0),
      "dependsOnTitles": ["string"],  // titles of sibling tasks this depends on
      "linkedFiles": ["workspace-relative path"]  // if relevant
    }
  ]
}
```

### 11.3 Response Validation

Before any tasks are committed to the plan:

1. JSON parse validation
2. Schema field validation (required fields, type enum values)
3. Confidence threshold check (see §7.5)
4. Deduplication check against existing task titles
5. Goal reference validation (goalCriterionIndex in bounds)

Failed validation → user shown error with raw AI output for manual recovery.

### 11.4 Streaming

For `Plan Task`, AI response is streamed. Tasks are shown in the Debate Panel as they arrive. No task is committed to the plan file until the full response is validated and the user approves.

### 11.5 Consent Model (Unchanged from v1)

- Per-request consent: `Send to AI` button
- Session-wide consent: `Allow All` for the session
- Prompt masking: redacts common secret patterns before send
- Sensitive file confirmation: `.env*`, lockfiles, etc.

---

## 12. Partial Codebase Awareness

This section specifies how the extension behaves when the user opens a workspace that already has code present.

### 12.1 Detection

On first `Open Plan` or `Plan Task` with no existing plan file but with existing code:

```
PlanMyProject detected code in this workspace:
- src/ (TypeScript, ~24 files)
- tests/ (Jest, ~8 files)

Would you like to:
[A] Scan existing code and generate a plan around what's missing
[B] Start a fresh plan (ignores existing code)
[C] Import an existing plan file
```

### 12.2 Gap-Filling Task Generation

When a partial codebase is detected, the `TaskGenerator` operates in **gap-fill mode**:

- **Skip** generation of tasks for modules marked `estimatedCompletion: 'complete'` in `WorkspaceScan`
- **Generate** tasks for modules marked `partial` — focused on what's missing
- **Generate** test tasks for modules with no test counterparts
- **Flag** code-inferred tasks with `origin: 'code-inferred'`
- **Prepend** a note to task rationale: `"Inferred from workspace: src/auth/ exists but refresh logic is absent."`

### 12.3 Existing Code Summary

Shown in the Goal Setup Panel and Debate Panel, a concise summary of what the scanner believes already exists:

```
Workspace Summary (as of 2026-03-18)
─────────────────────────────────────
✓ Authentication (login, JWT generation) — src/auth/
⚠ Invoice PDF generation — missing
⚠ Email sending — missing
✓ Database models (Prisma) — prisma/schema.prisma
✗ Tests for auth module — no test files found
```

### 12.4 Re-scan on Implement

After every successful `Implement Task`, the scanner runs automatically. If the scan reveals that a task's linked files now exist and appear complete, the task is auto-proposed for `[x]` status with a user confirmation prompt.

---

## 13. Task Debate & Refinement Loop

The debate loop is the core interaction model for planning deep tasks with clarity.

### 13.1 Initiating a Debate

A debate can be started:
- From the tree view context menu: `Debate Task`
- From CodeLens: `Debate`
- Automatically when a low-confidence task (< 0.5) is generated

### 13.2 Debate Session Flow

```
1. Debate Panel opens with task context + workspace context
2. AI generates an opening analysis:
   "This task involves X. Key open questions are: (1)..., (2)..."
3. User responds (free text)
4. AI responds with: analysis, suggested actions (split / rewrite / accept)
5. Repeat until user selects a terminal action
6. Debate log stored in task's `debateLog[]`
```

### 13.3 Split Action

When user selects `Split` during a debate:

1. AI proposes 2–4 replacement tasks (as typed `TaskNode` drafts)
2. User sees each proposed task with rationale and confidence
3. User can accept all, reject all, or selectively accept
4. Accepted tasks replace the original in the plan tree

### 13.4 Rewrite Action

1. Debate Panel enters inline edit mode for task title
2. User edits title
3. AI regenerates rationale for the new title
4. User confirms → plan updated

### 13.5 Debate Log Persistence & Git-Based Collaboration

There is no hosted backend service. All debate state is stored in the plan file itself and synced through git, making it naturally available to all developers who have the repository.

**Storage format** — debate entries are written as a comment block directly below the task in `planmyproject.md`:

```markdown
  <!-- pmp:debate:T0003
  [2026-03-18T10:05:00Z][alice][user] Is this really necessary before implementation?
  [2026-03-18T10:05:03Z][ai] Yes — library choice affects bundle size and font support...
  [2026-03-18T10:06:00Z][alice][user] OK, accept
  [2026-03-18T10:06:01Z][system] action=accept
  -->
```

**Author attribution**: Each user-role entry includes the git user name from `git config user.name` (falls back to OS username). AI entries have no author prefix. This allows reviewers to see who said what across a shared plan.

**Cross-developer flow**:
1. Developer A debates a task, accepts a split → entries written to plan file
2. Developer A commits and pushes `planmyproject.md`
3. Developer B pulls → extension detects updated debate log on next `Open Plan` or `Refresh Tree`
4. Developer B sees debate history in the Debate Panel for that task
5. Developer B can continue the debate; new entries are appended

**Session behavior across restarts**: The Debate Panel re-hydrates from the debate log in the plan file on open. There is no ephemeral in-memory state that needs persistence — the plan file is the session.

**Conflict resolution**: If two developers append debate entries concurrently and a git merge conflict occurs within the `<!-- pmp:debate:... -->` block, the extension detects the conflict markers on next parse and shows a warning: "Debate log conflict detected on T0003. Please resolve in the plan file." It does not attempt auto-merge of debate content.

**Debate log size management**: Entries older than 90 days (configurable via `debate.archiveAfterDays`) are moved to a collapsible `<!-- pmp:debate-archive:T0003 ... -->` block to keep the active block small. Archived entries are read-only in the panel.

---

## 14. Execution & Implementation

### 14.1 Execution Queue Ordering (v2)

The queue is rebuilt with the following priority:

1. Research tasks with no blocking dependencies
2. Decision tasks with no blocking dependencies
3. Implementation tasks whose research/decision dependencies are `done`
4. Blocked implementation tasks (shown separately, not numbered)

### 14.2 Research Task Completion & Indexing

Research and Decision tasks do not generate code. When a user marks one `[x]`:

1. A prompt appears: `Record your finding/decision:`
2. User enters the conclusion (e.g., "Decided: use pdfkit, v4.0.2")
3. Conclusion is stored in the task's `notes` field and written to the plan file
4. The conclusion is **automatically indexed** into `.pmp/research-index.json`:
   - Tags are auto-extracted from the conclusion text and task title using keyword extraction
   - The entry is assigned a `usedInPrompts` counter starting at 0
5. Dependent implementation tasks are unblocked and move to the execution queue
6. Status bar briefly shows: `✓ Research indexed: T0003`

**Index maintenance**: The research index is a flat JSON file committed alongside the plan file. It is append-only — entries are never deleted when tasks are removed (historical decisions remain available to the AI). A `PlanMyProject: View Research Index` command opens the index in a read-only editor tab.

### 14.3 Implement Task (Updated Prompt)

For `implementation` type tasks, the AI prompt is extended with:

- The conclusions from all resolved research/decision parents
- The linked files from workspace scan
- The current content of those linked files (if within size limit)

Response format is identical to v1 (`summary`, `taskCompleted`, `changes`, `tests`, `risks`) but adds:

```json
{
  "summary": "...",
  "taskCompleted": true,
  "changes": [...],
  "tests": [...],
  "risks": [...],
  "researchUsed": ["T0003: pdfkit v4.0.2", "T0004: httpOnly cookie storage"]
}
```

### 14.4 Safe Writes (Unchanged from v1)

- Workspace-relative paths only
- No absolute paths; no `..` traversal
- No file deletions or renames
- Blocks sensitive targets (`.env*`, `.git/*`, lockfiles)
- Extra confirmation for write targets outside `src/`

---

## 15. Storage & Persistence

### 15.1 Plan File

- Location: `{workspaceRoot}/planmyproject.md`
- Written on every task mutation
- Human-editable; parser is tolerant of minor formatting changes
- **Should be committed to git** — it is the single source of truth for plan, debate history, and research notes

### 15.2 Research Index

- Location: `{workspaceRoot}/.pmp/research-index.json`
- Written on every research/decision task completion
- Append-only; entries are never deleted
- **Should be committed to git** — makes accumulated decisions available to all collaborators and to AI prompts on any developer's machine
- On first clone/pull of a repo with an existing index, extension loads it automatically on `Open Plan`

### 15.3 Scan Cache

- Location: `{workspaceRoot}/.pmp/scan-cache.json`
- Written after every scan
- Invalidated on: file create/delete events in workspace
- **Should NOT be committed to git** — machine-specific and regenerated quickly
- Extension suggests adding `.pmp/scan-cache.json` to `.gitignore` on first scan (separate from research-index)

### 15.4 Debate Archive

- Location: `{workspaceRoot}/.pmp/debate-archive/T0003.md` (one file per task)
- Written when debate entries are archived (older than `debate.archiveAfterDays`, default 90)
- **Should be committed to git** — preserves full decision history
- Archive files are read-only from the extension; accessible via `PlanMyProject: View Debate Archive`

### 15.5 Extension State

- VS Code `workspaceState` used for:
  - Current active debate session (pending unsent user input only)
  - Per-session AI consent flag
  - Last scan timestamp

### 15.6 Recommended .gitignore additions

On first scan, the extension offers to append:

```gitignore
# PlanMyProject — regenerated locally
.pmp/scan-cache.json
```

And ensures the following are **not** ignored:

```
planmyproject.md
.pmp/research-index.json
.pmp/debate-archive/
```

### 15.7 .pmpignore

Optional file at workspace root. Same format as `.gitignore`. Controls which files/directories the workspace scanner skips.

---

## 16. Security & Safety

### 16.1 AI Data Sent

Only the following is sent to AI providers:

- Project goal statement (user-provided)
- Task titles and types (from plan file)
- Workspace scan summary (signatures included when `scanner.extractSignatures` is enabled)
- Research index entries (top-N relevant conclusions; no raw file content)
- File contents — governed by a two-level policy:
  1. **Global setting**: `planmyproject.sendFileContentsToAI` (default `false`)
  2. **Per-task override**: `fileSendPolicy` on each `TaskNode` — `'global'` | `'always'` | `'never'` | `'ask'`

**Effective policy resolution per AI call:**

| Task `fileSendPolicy` | Global setting | File contents sent? |
|-----------------------|---------------|---------------------|
| `global` | `false` | No |
| `global` | `true` | Yes (with per-request consent) |
| `always` | any | Yes (with per-request consent) |
| `never` | any | No |
| `ask` | any | Prompt shown each time |

Per-task policy is set via `PlanMyProject: Set Task File Send Policy` or from the Debate Panel task actions. It is stored in the task's `pmp:id` comment metadata and committed with the plan file.

### 16.2 Prompt Masking

Before any AI call, the prompt is scanned for and replaces:
- Common token patterns: `Bearer ...`, `sk-...`, `ghp_...`
- Email addresses (optional, off by default)
- IP addresses (optional, off by default)

### 16.3 Workspace Write Safety

Identical to v1 plus:
- After scan, writes to files inferred as `complete` by scanner require extra confirmation
- "This file appears complete. Overwriting may break existing functionality. Proceed?"

---

## 17. Extension Configuration

All settings under `planmyproject.*`:

**AI Provider**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `aiProvider` | enum | `copilot` | `copilot` \| `claude` \| `openai` |
| `claudeApiKey` | string | `""` | API key for Anthropic Claude (stored in VS Code Secret Storage) |
| `openaiApiKey` | string | `""` | API key for OpenAI (stored in VS Code Secret Storage) |

**File Content Sending**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sendFileContentsToAI` | boolean | `false` | Global default — include linked file contents in AI prompts |
| `defaultTaskFileSendPolicy` | enum | `global` | Default `fileSendPolicy` applied to newly created tasks: `global` \| `always` \| `never` \| `ask` |

**Workspace Scanner**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `scanner.extractSignatures` | boolean | `true` | Parse and summarize function/class signatures during scan (disable for large repos or performance-sensitive environments) |
| `scanner.maxFilesScanned` | number | `500` | Maximum files included in a workspace scan |
| `scanner.maxFileSizeKb` | number | `50` | Maximum file size (KB) for signature extraction; larger files get file-level analysis only |
| `autoRescanOnImplement` | boolean | `true` | Re-scan after each successful Implement Task |

**Task Generation**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `confidenceThreshold` | number | `0.5` | Minimum confidence score for auto-accepting AI-generated tasks without review prompt |
| `researchGate` | boolean | `true` | Block implementation tasks in execution queue until their research/decision dependencies are `done` |

**Debate**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `debate.archiveAfterDays` | number | `90` | Debate entries older than this are moved to the archive block |

**Plan File**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `planFileName` | string | `planmyproject.md` | Plan file name in workspace root |
| `showRationaleInline` | boolean | `true` | Write AI-generated `> Rationale:` block below each task line |
| `gitignorePmpDir` | boolean | `true` | Suggest adding `.pmp/scan-cache.json` to `.gitignore` on first scan |

---

## 18. File Structure

```
planmyproject-v2/
├── src/
│   ├── extension.ts                     # activation, command registration
│   ├── controller/
│   │   └── PlanController.ts            # orchestrator
│   ├── model/
│   │   ├── TaskNode.ts                  # includes fileSendPolicy field
│   │   ├── ProjectGoal.ts
│   │   ├── PlanModel.ts
│   │   ├── WorkspaceScan.ts
│   │   └── ResearchIndexEntry.ts        # ← new
│   ├── parser/
│   │   ├── PlanParser.ts                # parse/serialize planmyproject.md (v2 schema)
│   │   └── SchemaUpgrader.ts            # v1 → v2 migration
│   ├── scanner/
│   │   ├── WorkspaceScanner.ts          # main orchestrator
│   │   ├── LanguageDetector.ts
│   │   ├── ModuleGrouper.ts
│   │   ├── DependencyExtractor.ts
│   │   ├── FeatureInferrer.ts
│   │   └── SignatureExtractor.ts        # ← new; per-language signature parsing
│   ├── ai/
│   │   ├── AIService.ts                 # provider abstraction
│   │   ├── CopilotProvider.ts
│   │   ├── ClaudeProvider.ts
│   │   ├── OpenAIProvider.ts
│   │   ├── PromptBuilder.ts             # layered prompt: SYSTEM/GOAL/WORKSPACE/KNOWLEDGE/TASK/INSTRUCTION
│   │   └── ResponseParser.ts
│   ├── generation/
│   │   └── TaskGenerator.ts             # scan + goal + index → typed task drafts
│   ├── research/
│   │   ├── ResearchIndex.ts             # ← new; read/write .pmp/research-index.json
│   │   └── TagExtractor.ts             # ← new; keyword extraction for index tagging
│   ├── debate/
│   │   ├── DebateService.ts
│   │   ├── DebatePanel.ts               # WebView
│   │   └── DebateArchiver.ts            # ← new; moves old entries to archive files
│   ├── ui/
│   │   ├── TreeProvider.ts              # includes empty-state rendering
│   │   ├── CodeLensProvider.ts
│   │   ├── GoalSetupPanel.ts
│   │   └── StatusBarItem.ts             # scan status + no-goal warning
│   ├── queue/
│   │   └── QueueBuilder.ts              # research-gate aware ordering
│   └── util/
│       ├── PromptMasker.ts
│       ├── PathSafetyChecker.ts
│       ├── IdGenerator.ts
│       └── FileSendPolicyResolver.ts    # ← new; resolves effective policy from task + global
├── webviews/
│   ├── debate/
│   │   ├── index.html
│   │   └── debate.js
│   ├── goal-setup/
│   │   ├── index.html
│   │   └── goalSetup.js
│   └── research-index/
│       ├── index.html                   # ← new; read-only index viewer
│       └── researchIndex.js
├── test/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
└── README.md
```

---

## 19. Testing Requirements

### 19.1 Unit Tests (required)

| Module | Coverage Target |
|--------|----------------|
| `PlanParser` | 95% — all schema v1 and v2 round-trips, including `fileSendPolicy` and `debateLog` fields |
| `PlanModel` | 90% — all invariants, status propagation |
| `QueueBuilder` | 90% — ordering, research-gate blocking logic |
| `PromptBuilder` | 85% — all layer combinations including KNOWLEDGE LAYER injection |
| `ResponseParser` | 95% — valid JSON, schema errors, partial responses |
| `PathSafetyChecker` | 100% — traversal and absolute path rejections |
| `PromptMasker` | 95% — token/secret pattern coverage |
| `WorkspaceScanner` | 80% — with mocked file system |
| `SignatureExtractor` | 85% — TypeScript, Python, Go; large-file skip; fallback behavior |
| `ResearchIndex` | 90% — read, write, append, tag extraction, top-N retrieval |
| `FileSendPolicyResolver` | 100% — all 8 combinations of task policy × global setting |
| `DebateArchiver` | 85% — age threshold, archive write, conflict marker detection |
| `TagExtractor` | 80% — keyword extraction accuracy on sample conclusions |

### 19.2 Integration Tests (required)

- Full plan file round-trip: create → plan → implement → rebuild queue
- v1 plan file migration: parse v1 schema → upgrade → write v2 schema
- Workspace scan → signature extraction → gap-fill mode → task generation (mocked AI)
- Research task completion → index write → subsequent AI prompt contains indexed entry
- Debate session: open → AI exchange → split → accept → entries written to plan file
- Debate persistence: write entries → simulate VS Code restart → rehydrate from plan file
- Multi-author debate: simulate two authors appending entries → merged plan file → both visible in panel
- Per-task file send policy: `never` overrides global `true`; `always` overrides global `false`; `ask` shows prompt regardless
- Empty state: no root tasks → tree shows links → clicking "Add root task" creates task

### 19.3 Feature Coverage Target

95%+ of spec features covered by at least one test.

---

## 20. Migration from v1

### 20.1 Auto-Detection

On `Open Plan`, if plan file has `<!-- pmp:schema=v1 -->`:

1. Show notification: "PlanMyProject v2 detected a v1 plan file. Migrate now?"
2. On confirm: `SchemaUpgrader` runs in-place migration
3. Backup written to `.pmp/planmyproject.v1.backup.md`

### 20.2 Migration Rules

| v1 Element | v2 Migration |
|-----------|-------------|
| All tasks | `type` set to `implementation` |
| All tasks | `origin` set to `manual` |
| All tasks | `confidence` set to `null` |
| All tasks | `dependsOn` set to `[]` |
| `pmp:schema=v1` | Updated to `pmp:schema=v2` |
| No goal block | User prompted to run `Set Project Goal` after migration |

### 20.3 Backward Compatibility

v2 can open v1 plan files in read-only mode (without migration). All commands that require v2 schema will prompt for migration before proceeding.

---

## Appendix A — Non-Goals

The following are explicitly out of scope for v2:

- File deletion via `Implement Task`
- File rename/move via `Implement Task`
- Real-time collaboration between developers
- Cloud sync of plan files
- Integration with external issue trackers (Jira, GitHub Issues) — future roadmap
- Support for untrusted workspaces

## Appendix B — Resolved Design Decisions

All open questions from the draft spec have been resolved. This appendix records each decision for traceability.

| # | Question | Decision | Implications |
|---|----------|----------|-------------|
| 1 | Should `WorkspaceScanner` extract function signatures or stick to file-level? | **Signature extraction on by default**, toggled via `scanner.extractSignatures`. | Added `SignatureExtractor` module; per-language parsing strategy; performance note in §6.3; signature data included in WORKSPACE LAYER of AI prompt. |
| 2 | Should Debate Panel persist across restarts? | **No hosted service.** Debate entries are stored in the plan file and synced via git. Panel rehydrates from file on open. | Added author attribution to debate entries; conflict detection on merge conflicts; archive mechanism for old entries; `.pmp/debate-archive/` committed to git. |
| 3 | Should research completion notes be indexed for future AI prompts? | **Yes.** Conclusions are auto-indexed with keyword tags into `.pmp/research-index.json`. | Added `ResearchIndexEntry` model, `ResearchIndex` module, `TagExtractor`, `KNOWLEDGE LAYER` in prompt, `View Research Index` command. Index is committed to git. |
| 4 | UX for no project goal / no root tasks? | **Warn-only, not blocked.** Tree shows empty-state with clickable "Add root task" and "Set project goal" links. Status bar shows `⚠ No project goal set`. | Added empty-state rendering in `TreeProvider`; warn-not-block behavior on planning commands; status bar indicator. |
| 5 | Should `sendFileContentsToAI` support per-task override? | **Yes.** Each task has a `fileSendPolicy` field (`global` / `always` / `never` / `ask`). Global setting is the fallback. | Added `FileSendPolicy` type to `TaskNode`; `FileSendPolicyResolver` util; `Set Task File Send Policy` command; policy table in §16.1; `defaultTaskFileSendPolicy` setting. |

---

*End of Specification — PlanMyProject v2.0.0-rc1*
