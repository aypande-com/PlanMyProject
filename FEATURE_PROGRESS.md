# PlanMyProject v2 — Feature Progress Report

**As of April 5, 2026**  
**Validated against:** current code in `src/` + `npm run compile` + `npm test` + static code analysis

---

## Executive Summary

| Metric | Status |
|---|---|
| Build/Test Health | ✅ `compile` clean; 58 tests across 11 suites — all passing |
| Delivery Model | ✅ Big-bang rewrite branch structure present |
| Overall Spec Alignment | 🟡 ~85% implemented / wired |
| Architecture Health | ✅ Major P3 refactor complete — PlanController decomposed into services |

---

## Implemented Since Last Report (March 19 → April 5, 2026)

### P3 Architecture Refactor
1. `ScanService` extracted from `PlanController` — scan orchestration isolated (P3-C1)
2. `ConsentService` extracted from `PlanController` — AI consent logic isolated (P3-C2)
3. `TaskCommandService` extracted from `PlanController` — task command handlers isolated (P3-C3)
4. `GoalCommandService` extracted from `PlanController` — goal command handlers isolated (P3-C4)
5. Lightweight undo stack added to `PlanController` — reversible plan mutations (P3-C5)

### New Test Coverage
6. `undo-stack.test.ts` — pushUndoEntry cap/order/reference behavior (5 tests)
7. `task-command.test.ts` — TaskCommandService unit tests
8. `goal-command.test.ts` — GoalCommandService unit tests
9. Test count: **6 suites / ~30 tests → 11 suites / 58 tests**

---

## Current Status by Area

### 1) Core Architecture & Data Model

| Area | Status | Notes |
|---|---|---|
| Modular rewrite layout (`controller/parser/model/scanner/ai/...`) | ✅ Complete | All v2 modules active |
| v2 task/goal/scan/research models | ✅ Complete | Core fields implemented |
| Queue builder with dependency/research blocking | ✅ Complete | Implemented and unit tested |
| Safe-write/path checks + prompt masking baseline | ✅ Complete | Implemented and unit tested |
| PlanController service decomposition | ✅ Complete | ScanService, ConsentService, GoalCommandService, TaskCommandService extracted |
| Undo stack for plan mutations | ✅ Complete | `pushUndoEntry`, `undoLastChange` implemented and tested (P3-C5) |

### 2) Parser, Schema, Migration

| Area | Status | Notes |
|---|---|---|
| v2 parser/serializer round-trip | ✅ Complete | Covered by `parser.test.ts` |
| v1 detection + migration prompt + backup file | ✅ Complete | Implemented in controller/repository/upgrader |
| v1 compatibility path | 🟡 Partial | "Keep v1 (read-only)" prompt option exists; but no visual read-only mode indicator in tree/CodeLens |
| Debate archive comment block in `planmyproject.md` | ❌ Missing | Archive file exists under `.pmp/debate-archive/`, but no `pmp:debate-archive` block serialization/parsing |

### 3) Workspace Analysis / `.pmp` Persistence

| Area | Status | Notes |
|---|---|---|
| Scanner pipeline (discover/lang/deps/modules/signatures/features/tests) | ✅ Complete | Implemented |
| Scan limits/settings (`maxFiles`, `maxFileSize`, `extractSignatures`) | ✅ Complete | Implemented via config |
| `.pmpignore` support | ✅ Complete | Implemented |
| `.gitignore` support in scanner | ✅ Complete | Implemented |
| Persisted scan cache/research index/debate archive files | ✅ Complete | Implemented |
| `.gitignore` suggestion flow for scan cache | ✅ Complete | Implemented |
| Rich classification (source/test/config/asset/generated buckets) | 🟡 Partial | Source, test, and generated-path exclusion exist; config/asset buckets not implemented |

### 4) AI Platform / Generation Pipeline

| Area | Status | Notes |
|---|---|---|
| Multi-provider service (Copilot/Claude/OpenAI) | ✅ Complete | Implemented via `AIService` abstraction |
| API key storage in Secret Storage | ✅ Complete | Implemented with migration from legacy settings |
| Layered prompt builder | ✅ Complete | Implemented |
| Response parsing + validation + dedupe | 🟡 Partial | Validation exists; strict schema checks lighter than spec |
| Confidence threshold gating | ✅ Complete | Implemented |
| Goal criterion index validation | 🟡 Partial | PromptBuilder instructs AI to reference goal criteria; no programmatic enforcement against criteria bounds |
| Streaming UX | 🟡 Partial | `onChunk` used in plan/implement streams via `TaskCommandService`; Debate panel has no streaming — full response only |

### 5) UI / Commands

| Area | Status | Notes |
|---|---|---|
| Command surface (retained + v2 additions) | ✅ Complete | Commands registered in `package.json` + controller |
| Tree provider with task types + blocked/origin/confidence hints | ✅ Complete | Implemented |
| CodeLens (`Plan | Debate | Implement | Scan`) | ✅ Complete | Implemented |
| Debate panel actions (accept/rewrite/split/dismiss/defer) | ✅ Complete | Implemented |
| Debate persistence across restart | ✅ Complete | Rehydration implemented |
| Goal setup flow | ✅ Complete | Input-driven flow implemented |
| Status bar warning + scan states | ✅ Complete | Implemented |

### 6) Execution / Research / Implementation

| Area | Status | Notes |
|---|---|---|
| Research completion + indexing + queue unblocking | ✅ Complete | Implemented |
| Implement prompt includes research conclusions and linked files by policy | ✅ Complete | Implemented |
| Research/decision tasks blocked from Implement flow | ✅ Complete | Implemented |
| Extra confirm for writes into scan-complete files | ✅ Complete | Implemented |
| Auto-rescan after implement | ✅ Complete | Implemented |
| Auto-mark task complete based on scan deltas | ❌ Missing | Not implemented |

### 7) Security / Policy / Consent

| Area | Status | Notes |
|---|---|---|
| Global + per-task file-send policy resolution | ✅ Complete | Implemented and tested |
| Prompt masking (tokens/secrets) | ✅ Complete | Implemented |
| Session consent persistence | ✅ Complete | Implemented via `workspaceState` |
| Extension state for active debate draft input | ❌ Missing | Not persisted — draft lost on panel close |
| API key VCS exposure warning | ❌ Missing | Keys found in `settings.json` are silently migrated to secrets with no user warning — risk of git commit exposure (S1) |
| API error response sanitization | ❌ Missing | Raw API error bodies (up to 400 chars) shown in error toasts — could echo key fragments via proxy errors (S2) |

### 8) Partial Codebase Awareness

| Area | Status | Notes |
|---|---|---|
| Gap-aware generation based on scan completeness | 🟡 Partial | Existing complete-module context included in prompt; exclusion heuristics limited |
| Initial detection UX with options A/B/C (scan around gaps / fresh plan / import) | ❌ Missing | `importGoalStatement` command exists but no structured first-run wizard |
| Code-inferred task generation path | 🟡 Partial | `origin: "code-inferred"` in data model; no active generation pipeline produces it |

### 9) Testing / Acceptance Gates

| Area | Status | Notes |
|---|---|---|
| Unit tests for parser/path/policy/queue/response/migration/goals/tasks/undo | ✅ Complete | 11 suites, 58 tests — all passing |
| Integration workflows from spec | ❌ Missing | Spec-listed scenarios (scan→generate→queue, research→index→prompt, debate lifecycle) not automated |
| Feature coverage >=95% gate | ❌ Missing | Not measured/reported; no merge gate enforcing it |

### 10) Code Quality

| Area | Status | Notes |
|---|---|---|
| Async error handling in file watcher callbacks | ❌ Missing | `onDidCreate/Change/Delete` and `onDidSaveTextDocument` callbacks propagate rejections silently (C3) |
| Dependency cycle detection feedback | 🟡 Partial | Cycle is detected and handled; user receives no warning (C4) |
| `max_tokens` constant in `ClaudeProvider` | ❌ Missing | Hardcoded magic number `1800` inline; no named constant (C1) |
| `any` return type on `selectCopilotModel` | ❌ Missing | Untyped return propagates into call sites, removing IDE safety (C2) |
| Archive failure logging | ❌ Missing | `maybeArchiveDebateEntries` swallows errors silently; output channel not notified (A2) |
| `queue.sort()` inside dependency-walk loop | ❌ Missing | Re-sorts full queue on every insertion — O(n³) in the worst case for large plans (C5) |

---

## Updated Bottom Line

- Architecture is now significantly cleaner: four services extracted from `PlanController` (ScanService, ConsentService, GoalCommandService, TaskCommandService), each independently testable.
- Undo stack provides reversibility for plan mutations, closing a §8 autonomy constraint from the constitution.
- Test coverage expanded from ~30 tests to 58 across 11 suites; all passing.
- Static code analysis (April 5) surfaced 2 security issues (S1 high, S2 low) and 6 code-quality issues (C1–C5, A2) — no critical blockers; all captured as P4-H tasks.
- Remaining work concentrated in:
  1. Partial-codebase onboarding wizard (A/B/C UX)
  2. `pmp:debate-archive` block serialization in plan file
  3. Debate draft input persistence across panel close
  4. Debate panel streaming
  5. Integration test harness + acceptance gating
  6. API key VCS exposure warning + error response sanitization (security)

---

## Remaining Work — Task List

Tasks are grouped by area and ordered by priority within each group. Each task includes exact file pointers.

---

### P4-A — Parser & Schema

**P4-A1 — Add `pmp:debate-archive` block to plan serialization**  
`DebateArchiver` writes `.pmp/debate-archive/<taskId>.md` but `archivedDebatePath` on `TaskNode` is never serialized into or parsed from `planmyproject.md`. When the plan is reloaded, the link between the task and its archive file is lost.  
- Add `archivedDebatePath` to the metadata comment written by `serializePlanMarkdown` in [src/parser/PlanParser.ts](src/parser/PlanParser.ts)
- Parse `archivedDebatePath` back in `parsePlanMarkdown` alongside the existing `pmp:id=...` comment fields
- In `DebatePanel`, mark archived entries read-only when `task.archivedDebatePath` is set

**P4-A2 — Add visual read-only mode for v1 plans**  
When the user selects "Keep v1 (read-only)" ([src/controller/PlanController.ts:239](src/controller/PlanController.ts#L239)), commands that call `requireV2Plan` throw a plain error. There is no tree-level or CodeLens-level indication that the plan is read-only.  
- Set a VS Code context key `planmyproject.schemaV1` when `plan.schemaVersion === "v1"` after load
- In [src/ui/TreeProvider.ts](src/ui/TreeProvider.ts), show a "(read-only — v1)" label on the root tree item
- In [src/ui/CodeLensProvider.ts](src/ui/CodeLensProvider.ts), suppress or grey out Plan/Implement/Debate lenses when the context key is set

---

### P4-B — Execution & Scan

**P4-B1 — Auto-mark task complete based on scan deltas**  
After `autoRescanOnImplement` triggers ([src/controller/TaskCommandService.ts:295](src/controller/TaskCommandService.ts#L295)), the new scan result is not compared to the pre-implement snapshot, so implemented tasks are never auto-completed.  
- In `TaskCommandService.implementTask`, snapshot `existingFeatures` and `modules` before the AI call
- After the post-implement rescan, diff the two scans for new/modified files that match `task.linkedFiles`
- If linked files are now present in scan signatures, prompt: "Scan detected changes to linked files — mark [T000X] complete?"
- Auto-mark if the user confirms; otherwise leave status unchanged

**P4-B2 — Produce `code-inferred` tasks from `scanTask`**  
`TaskNode.origin` supports `"code-inferred"` but `scanTask` ([src/controller/PlanController.ts:315](src/controller/PlanController.ts#L315)) only triggers a signature refresh — it never generates tasks. `TaskGenerator` always sets `origin: "ai-generated"` ([src/generation/TaskGenerator.ts:84](src/generation/TaskGenerator.ts#L84)).  
- Add a `scanAndInfer` path in `TaskCommandService` (or a new `ScanInferService`) that, after a targeted scan, sends the fresh signatures to `TaskGenerator` with a flag indicating the source
- Set `origin: "code-inferred"` on tasks produced by this path
- Register a new command `planmyproject.inferTasksFromScan` and wire it to the CodeLens "Scan" action as a secondary option

---

### P4-C — Debate Panel

**P4-C1 — Persist active debate draft input across panel close**  
The debate panel input box is a WebView `<textarea>`. Its contents are lost when the panel is disposed. There is no persistence path in [src/debate/DebatePanel.ts](src/debate/DebatePanel.ts).  
- On every `userMessage` WebView → extension message, also send a `draftUpdate` message with the current text
- In `DebatePanel`, save the draft string to `context.workspaceState` under key `pmp.debateDraft.<taskId>`
- On panel creation, pass the saved draft back via `postMessage({ type: 'restoreDraft', text })` after the WebView loads
- Clear the stored draft when the user submits or closes the debate with a resolution action

**P4-C2 — Add streaming to `DebateService` / `DebatePanel`**  
`DebateService.generateOpening` and `continueDebate` call `AIService.generateText` without an `onChunk` callback, so the panel shows nothing until the full response arrives. `TaskCommandService` already uses `onChunk` ([src/controller/TaskCommandService.ts:151](src/controller/TaskCommandService.ts#L151)) as a pattern to follow.  
- Add `onChunk` callback to `DebateService.generateOpening` and `continueDebate` in [src/debate/DebateService.ts](src/debate/DebateService.ts)
- In `DebatePanel`, handle a new `assistantChunk` WebView message type that appends text to the in-progress bubble
- Show a typing indicator in the panel while the stream is open; remove it on `assistantMessage` (final)

---

### P4-D — AI Generation

**P4-D1 — Enforce goal criterion reference in `ResponseParser`**  
`PromptBuilder` instructs the AI to reference a goal criterion per task ([src/ai/PromptBuilder.ts:73](src/ai/PromptBuilder.ts#L73)) but `ResponseParser` does not validate that the returned `goalRef` matches a real `ProjectGoal.id` or that any criterion is cited.  
- In [src/ai/ResponseParser.ts](src/ai/ResponseParser.ts), after parsing the draft array, accept an optional `goalIds: string[]` parameter
- If provided, reject any draft whose `goalRef` is non-null and not in `goalIds`, or downgrade its confidence by 0.2
- Pass `plan.goals.map(g => g.id)` from `TaskGenerator` when calling the parser

**P4-D2 — Tighten response schema validation**  
`ResponseParser` accepts tasks with missing or extra fields more leniently than the spec requires. Edge cases (empty `title`, `confidence` outside 0–1, unknown `type`) pass through.  
- In [src/ai/ResponseParser.ts](src/ai/ResponseParser.ts), add explicit guards: reject drafts with blank `title`; clamp `confidence` to `[0, 1]`; reject unknown `type` values instead of defaulting
- Add test cases covering each guard in `test/response-parser.test.ts`

---

### P4-E — Workspace Scanner

**P4-E1 — Add config/asset file classification buckets**  
`WorkspaceScanner` classifies files as source, test, or generated-path. Config files (`.json`, `.yaml`, `.toml`, `.env.example`) and asset files (`.svg`, `.png`, `.css`) are either lumped into source or silently dropped — they never appear in the scan summary or prompt context.  
- In [src/scanner/WorkspaceScanner.ts](src/scanner/WorkspaceScanner.ts), add `isConfigFile` and `isAssetFile` classifier functions alongside `isSourceFile` and `isTestFile`
- Add `configFiles: string[]` and `assetFiles: string[]` fields to `WorkspaceScan` in [src/model/WorkspaceScan.ts](src/model/WorkspaceScan.ts)
- Populate them during scan; include a short summary line in the `PromptBuilder` workspace layer when either list is non-empty

---

### P4-F — Partial Codebase Onboarding

**P4-F1 — Implement first-run detection wizard (A/B/C options)**  
When `openPlan` runs on a workspace with code but no `planmyproject.md`, there is no structured onboarding. The user lands directly in an empty tree. The spec calls for three options: (A) scan and generate a plan around existing gaps, (B) start a fresh blank plan, (C) import an existing goal markdown.  
- In `PlanController.openPlan` ([src/controller/PlanController.ts:207](src/controller/PlanController.ts#L207)), detect: workspace has source files but no plan file
- Show a `vscode.window.showQuickPick` with options A / B / C
- Option A: run `scanService.refresh()` then pass scan result to `TaskGenerator` to seed root tasks with `origin: "code-inferred"`
- Option B: call `goalCommandService.setProjectGoal()` as today
- Option C: call `goalCommandService.importGoalStatement()` as today
- Add a "Don't show again" option that sets a `workspaceState` flag to skip the wizard

---

### P4-G — Testing & Acceptance

**P4-G1 — Integration test harness**  
No end-to-end test covers the critical paths that the spec lists as acceptance criteria. Unit tests mock at the service boundary, so cross-module regressions (e.g., parser → queue → tree, research → index → prompt injection) are not caught.  
- Add `test/integration/` directory with a minimal VS Code extension test host (or a node-only harness that exercises real file I/O)
- Cover at minimum: (1) v1 → v2 migration round-trip, (2) scan → generate → queue derivation, (3) research complete → index entry → prompt inclusion, (4) debate open → rewrite → accept → plan serialization
- Wire into `npm run test:integration` script in `package.json`

**P4-G2 — Feature coverage checklist and merge gate**  
There is no automated check that new code maintains spec alignment. The `>=95%` coverage target is aspirational but unmeasured.  
- Create `scripts/check-feature-coverage.js` that reads a `FEATURE_CHECKLIST.json` mapping spec sections to test file + test name
- Exit non-zero if any listed test is missing or failing
- Add `npm run check:coverage` to the CI pipeline in `.github/workflows/` (or equivalent)
- Seed `FEATURE_CHECKLIST.json` from the ✅ items in this document's "Current Status" tables

---

### P4-H — Code Quality & Security

*Findings from static code analysis performed April 5, 2026.*

**P4-H1 — Warn when API key found in `settings.json` (S1 · High)**  
`AIService.getApiKey()` ([src/ai/AIService.ts:49](src/ai/AIService.ts#L49)) silently reads from workspace configuration and migrates the value into `context.secrets` with no user-visible warning. A key committed to `settings.json` is already in VCS before this code runs.  
- In `getApiKey()`, after detecting `normalizedSetting`, call `vscode.window.showWarningMessage()` explaining that the key was found in `settings.json` and may be at risk of VCS exposure
- Suggest the user remove the key from settings and re-enter it via the "Set API Key" command
- Add a "Don't warn again" option stored in `context.globalState` to suppress repeat alerts

**P4-H2 — Sanitize API error response bodies before surfacing (S2 · Low)**  
`safeText()` in [src/ai/ClaudeProvider.ts:61](src/ai/ClaudeProvider.ts#L61) and [src/ai/OpenAIProvider.ts:113](src/ai/OpenAIProvider.ts#L113) returns up to 400 chars of raw response text in thrown errors. Proxy or gateway errors can echo authorization headers or key fragments.  
- Strip bearer token and x-api-key patterns from the extracted text before including in the error message:
  ```typescript
  return (await response.text()).slice(0, 400)
    .replace(/\b(sk-[A-Za-z0-9\-_]{10,}|ant[\w\-]{10,}|Bearer\s+\S+)\b/gi, "[REDACTED]");
  ```

**P4-H3 — Handle async rejections in file watcher callbacks (C3 · Medium)**  
`watcher.onDidCreate/Change/Delete` and `onDidSaveTextDocument` in [src/controller/PlanController.ts:179](src/controller/PlanController.ts#L179) are async callbacks. Unhandled rejections from `refreshPlanState()` are silently swallowed — the watcher stops responding with no user feedback.  
- Wrap each async callback body in `try/catch`
- On catch, append the error to the extension output channel and optionally show a status bar warning

**P4-H4 — Surface dependency cycle detection to the user (C4 · Medium)**  
`sortLeavesByDependencies` in [src/queue/QueueBuilder.ts:114](src/queue/QueueBuilder.ts#L114) detects cycles (when `output.length !== leaves.length`) but silently appends the affected tasks to the queue with no notification.  
- After the topological sort, if `output.length !== leaves.length`, collect the remaining task IDs
- Return the cycle list alongside `QueueSections` (add optional `detectedCycles?: string[]` field) or log a warning via the output channel
- In `PlanController`, surface this as a one-time informational notification per session

**P4-H5 — Extract `max_tokens` as a named constant in `ClaudeProvider` (C1 · Low)**  
`max_tokens: 1800` is an inline magic number in [src/ai/ClaudeProvider.ts:25](src/ai/ClaudeProvider.ts#L25). If output is being truncated by the provider, there is no obvious place to adjust it.  
- Define `const MAX_RESPONSE_TOKENS = 1800;` at the top of `ClaudeProvider.ts`
- Replace the inline literal with the constant

**P4-H6 — Narrow `any` return type on `selectCopilotModel` (C2 · Low)**  
`selectCopilotModel()` in [src/ai/CopilotProvider.ts:32](src/ai/CopilotProvider.ts#L32) returns `Promise<any>`, propagating `any` into `model.id` and `model.sendRequest` call sites.  
- Define an inline interface `CopilotModel` with the minimal surface used (`id?: string`, `sendRequest(...)`)
- Change the return type to `Promise<CopilotModel>`

**P4-H7 — Log archive failures to output channel (A2 · Low)**  
The empty `catch` in `maybeArchiveDebateEntries` ([src/controller/PlanController.ts:551](src/controller/PlanController.ts#L551)) is intentional ("best-effort") but gives no visibility when archiving silently fails.  
- Inside the catch block, append a line to the extension output channel:
  ```typescript
  } catch (err) {
    this.outputChannel.appendLine(`[PlanController] Debate archive failed for ${task.id}: ${err}`);
  }
  ```
