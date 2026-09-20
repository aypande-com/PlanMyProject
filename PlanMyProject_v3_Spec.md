# PlanMyProject v3 — Spec-Driven Development Framework

**Analysis of v2 and exhaustive plan for the next version**

Version: 3.0.0-draft3 | Date: 2026-09-21 | Baseline: branch `pmp-v2-rewrite` @ `7266bca` (72 tests, 11 suites, all passing)

**Amended against two companion analyses.** `PlanMyProject_v3_Performance.md` produced draft 2: a mandatory **P0 correctness-and-performance phase**, a headless-core boundary, the drift engine off the extension host, and an MCP server in place of VS Code Language Model Tools (§0.1). `PlanMyProject_v3_Security.md` produced draft 3: a **threat model**, **settings-scope hardening**, and **provenance recording for AI-generated code** (§0.2). Changes are marked **[draft2]** or **[draft3]** where they alter earlier text.

---

## Table of Contents

0. [How to Read This Document](#0-how-to-read-this-document)
1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis (v2)](#2-current-state-analysis-v2)
3. [Vision and Principles for v3](#3-vision-and-principles-for-v3)
4. [Target Architecture](#4-target-architecture)
5. [Workstream A — Spec Layer](#5-workstream-a--spec-layer-goal-2)
6. [Workstream B — Traceability and Drift](#6-workstream-b--traceability-and-drift-goal-4)
7. [Workstream C — Native-First VS Code Surfaces](#7-workstream-c--native-first-vs-code-surfaces-goal-1)
8. [Workstream D — Token Usage and Cost Monitoring](#8-workstream-d--token-usage-and-cost-monitoring-goal-5)
9. [Workstream E — SDLC and Tool Compatibility](#9-workstream-e--sdlc-and-tool-compatibility-goal-3)
10. [Workstream F — Platform Hardening and Release](#10-workstream-f--platform-hardening-and-release-goal-6)
11. [Consolidated Schema v3](#11-consolidated-schema-v3)
12. [Commands, Settings, Context Keys](#12-commands-settings-context-keys)
13. [Roadmap and Sequencing](#13-roadmap-and-sequencing)
14. [Testing and Acceptance Gates](#14-testing-and-acceptance-gates)
15. [Risks and Open Decisions](#15-risks-and-open-decisions)
16. [Appendix](#16-appendix)

---

## 0. How to Read This Document

This document does three jobs:

1. **Analyzes** the current v2 codebase (what exists, what is strong, what is missing relative to the six v3 goals).
2. **Specifies** the v3 framework: data models, file formats, commands, settings, prompts, UI, and integrations.
3. **Plans** the work as numbered tasks (`P5-S1`, `P6-T3`, ...) continuing the `P1`–`P4` numbering already used in `Improvements.md` and `FEATURE_PROGRESS.md`. Each task names files, approach, acceptance criteria, size, and dependencies.

The six goals from the brief are referenced throughout as **G1–G6**:

| Goal | Statement |
|---|---|
| **G1** | Native first, using the VS Code plugin |
| **G2** | Focus on spec definition and planning |
| **G3** | Compatibility with existing SDLC frameworks and tools such as Jira |
| **G4** | Low drift between spec document and actual implementation |
| **G5** | Monitorable in terms of token usage and cost estimation |
| **G6** | Must follow the operational structure the current plugin supports |

Sizes: **S** = under a day, **M** = 1–3 days, **L** = 3–6 days, **XL** = more than a week. Sizes assume one developer familiar with the codebase.

### 0.1 What Changed in Draft 2

Draft 1 was written from a reading of the code. The companion performance analysis measured it, and the measurements changed four things.

| # | Change | Where | Why |
|---|---|---|---|
| 1 | **New P0 phase before P5**, containing a parser data-loss fix and the queue rewrite, shipped in one commit | §2.6, §13.1 | Task metadata is destroyed on every save today; the queue is 99% of serialize time. The two defects mask each other, so neither ships alone |
| 2 | **Headless core extracted, drift engine moved to a language server** | §4.4 | 28 of 59 modules are already `vscode`-free; a continuously-running analysis engine does not belong on the shared extension host |
| 3 | **MCP server replaces Language Model Tools**, with a thin VS Code shim over the same handlers | §7.2 | Same effort, works in every MCP-capable agent, and removes the dependency on unstable agent-mode APIs (R3) |
| 4 | **Performance budgets are CI gates**, not aspirations | §4.5, §14.4 | Both P0 defects survived a full refactor and 72 passing tests because nothing measured them |

Smaller amendments, each marked **[draft2]** in place: incremental drift from day one (§6.4); no bulk `executeDocumentSymbolProvider` (§6.4); a file-existence cache replacing per-run `stat` storms (§6.4); `sync.onPersist` removed (§9.1, §12.2); non-blocking pre-flight estimation (§8.4); ledger rotation (§8.2); esbuild bundling and lazy service construction (§10.4); invariant I6 relaxed and I10–I11 added (§3.3); decisions D-10 to D-12 (§15.2).

Draft 1 text that the measurements did **not** disturb is unchanged: the spec model, the drift taxonomy, the cost model, and the sync adapter design all stand as written.

### 0.2 What Changed in Draft 3

Draft 2 was reviewed for security and legal exposure. The review found the specification had **no threat model** — searching draft 2 returned 0 hits for `indemn`, `telemetr`, `GDPR`, `SSRF` and `redact`, 2 for `trust`, and 1 for `injection` (about prompt *size*, not attacks). Four changes follow.

| # | Change | Where | Why |
|---|---|---|---|
| 1 | **Threat model and trust boundaries**, with three enforcement rules | §3.5, I12–I15 | v2's controls assume the workspace is trusted and the AI is the risk. v3 ingests repo- and tracker-authored text into prompts and gives models tools that act. The untrusted input now comes from the workspace, and the controls do not face that direction |
| 2 | **Settings-scope hardening**, moved into P0 | §12.4, P0-D1 | All 17 v2 settings are workspace-overridable, so a cloned repository can set `requireAiConsent: "never"` and `sendFileContentsToAI: true`. v3 would extend that to `tools.autoConfirm` and `verify.runTests` |
| 3 | **Sensitivity checks applied to egress**, not only to writes | P0-D2, P6-T19 | `isSensitiveWorkspacePath` has one caller, on the write path; linked-file contents are read into prompts with no sensitivity check at all |
| 4 | **File-level provenance for AI-generated code** | §8.2, P8-C11 | `origin: "ai-generated"` is the only provenance marker and the P0 parser defect destroys it on every save. v3 already has both halves — ledger model/timestamp and trace task→file — so joining them is cheap |

Smaller amendments, each marked **[draft3]** in place: constitution validator enforcing I9 (§5.4); untrusted prompt layers delimited (§5.5); `verify.runTests: "always"` removed (§6.5); MCP hardening (§7.2); hand-off mode documented as outside path-safety enforcement (§7.3); masking downstream of the budgeter with an expanded pattern set (§8.5); tracker credentials bound to their issuing host (§9.2); GitHub `repo` scope documented (§9.3); `SECURITY.md`, `PRIVACY.md`, `NOTICE`, indemnity section and SBOM (§10.5); risks R13–R16 and decisions D-13–D-15 (§15).

One change is **recorded here but deliberately not made**: `constitution.md` §11 names "HIPAA/SOC2 contexts" and promises an append-only audit log that nothing writes. Both claims should go. `constitution.md` §10 requires a human-authored commit with rationale for any constitutional change, so P10-H3 carries it rather than this document making it.

---

## 1. Executive Summary

PlanMyProject v2 is a research-first, goal-anchored planning extension with a solid operational core: a single markdown plan file with round-trip parsing, typed tasks with dependency and research gates, a workspace scanner, a research index, a debate loop, multi-provider AI with consent and masking, and a decomposed controller with 72 unit and integration tests. It is roughly 85% of its own v2 spec and unreleased (Marketplace is still at 1.0.2).

v2 is **not yet a spec-driven development framework**. It plans tasks against a one-sentence goal, has no requirements or acceptance criteria to trace against, cannot detect drift between plan and code, records nothing about token usage or cost, and has no bridge to Jira or similar tools.

v3 elevates the extension into a complete SDD framework by adding six additive layers on top of the existing operational structure, without replacing it:

| Layer | Goal | One-line description |
|---|---|---|
| **Spec layer** | G2 | Constitution + per-feature spec documents with requirements, acceptance criteria, and clarification markers; the plan tree hangs off requirements instead of a bare goal. |
| **Traceability and drift** | G4 | Requirement → task → file/symbol → test links with fingerprints; a drift engine that reports stale specs, missing code, unplanned changes, and status mismatches into the Problems panel. |
| **Native surfaces** | G1 | A `@pmp` chat participant, an MCP server (with a VS Code Language Model Tool shim) that lets any agent operate the plan under the same gates, diagnostics, spec CodeLens, Git integration, and a walkthrough. |
| **Cost monitoring** | G5 | Usage capture from every provider, a local ledger, a pricing table, pre-flight estimates in the consent dialog, budgets, and a Usage view. |
| **SDLC compatibility** | G3 | A sync adapter architecture with Jira Cloud and GitHub Issues adapters, plus Spec Kit import/export, ADR export, and CSV export. |
| **Hardening** | G6 | Schema v3 migration with backup, provider modernization (streaming, current models), audit log, docs, and a 3.0.0 release. |

The recommended sequence is a short **P0 defect phase** followed by six phases (P5–P10) over roughly 15–20 developer-weeks, with cost monitoring (P8) runnable in parallel with drift (P6) because they touch disjoint modules. Section 13 has the dependency graph.

**[draft2]** Measurement changed the starting point. Before any v3 work begins, two defects in code v3 builds directly on must be fixed together: the plan parser **discards six task metadata fields on every save** — including `dependsOn` and `fileSendPolicy`, so dependency gates and per-task privacy settings do not survive a write — and the execution queue builder is super-linear, taking 1.66 s at 500 tasks and 117 s at 2,000. The two mask each other, because the parser destroys exactly the dependency edges that trigger the queue's pathological path; fixing the parser alone would make the write path 40× slower overnight. §2.6 has the measurements and the fix sequence.

Three architectural decisions follow from the same analysis: **extract a headless `@planmyproject/core`** (28 of 59 modules already qualify), **run the drift engine in a language server** rather than on the shared extension host, and **build the agent tools as an MCP server** with a thin VS Code shim instead of VS Code-only Language Model Tools. §4.4 has the reasoning.

**[draft3]** A security review of draft 2 added a third correctness prerequisite to the same P0 phase. Every one of v2's 17 settings is workspace-overridable, so a repository's `.vscode/settings.json` can set `requireAiConsent: "never"` and `sendFileContentsToAI: true` and ship a developer's source to a provider with no prompt; and the sensitive-file check that is supposed to protect `.env` guards AI *writes* while linked-file contents are read into prompts unchecked. Neither is a v3 defect — both are live in v2 today. §3.5 has the threat model the specification previously lacked.

Two decisions are recommended up front and are unchanged: **ship v2 as 2.0.0 first** (finishing the four P4 items v3 depends on, after P0), and **keep the plan file as the single index** while moving spec content into `specs/` so that the markdown-first, git-synced model survives the growth in content.

---

## 2. Current State Analysis (v2)

### 2.1 Inventory

Source: 6,345 lines of TypeScript across 63 files; no runtime dependencies; Node built-in test runner with a `vscode` shim; feature checklist gate (`npm run check:coverage`).

| Subsystem | Files | Lines | Status |
|---|---|---|---|
| Controller | `PlanController.ts`, `TaskCommandService.ts`, `GoalCommandService.ts` | ~1,680 | Decomposed (P3), undo stack, consent, watchers |
| Model | `TaskNode.ts`, `PlanModel.ts`, `ProjectGoal.ts`, `WorkspaceScan.ts`, `ResearchIndexEntry.ts` | ~500 | Typed tasks, block reasons, derived status |
| Parser | `PlanParser.ts`, `SchemaUpgrader.ts` | ~600 | v2 round-trip, v1 migration, debate blocks, conflict detection |
| Scanner | 8 files | ~900 | Discovery, ignore rules, deps, signatures, modules, features, coverage hints, cache with TTL |
| AI | `AIService.ts`, 3 providers, `PromptBuilder.ts`, `ResponseParser.ts`, `ConsentService.ts` | ~1,000 | Provider abstraction, secrets, masking, layered prompts, JSON validation |
| Generation | `TaskGenerator.ts` | 126 | Drafts, threshold split, materialization with dependency resolution |
| Debate | `DebateService.ts`, `DebatePanel.ts`, `DebateArchiver.ts` | ~490 | Opening/continue/split/rewrite, WebView, archive |
| Research | `ResearchIndex.ts`, `TagExtractor.ts` | ~130 | Append-only index, tag-overlap ranking |
| Queue | `QueueBuilder.ts` | 159 | Topological ordering, blocked/research/decision/ready/milestone sections |
| UI | `TreeProvider.ts`, `CodeLensProvider.ts`, `StatusBarItem.ts`, `GoalSetupPanel.ts` | ~500 | Tree with snapshot node, CodeLens on plan file, status bar |
| Storage | `PlanRepository.ts`, `WorkspaceFiles.ts`, `ScanCacheStore.ts` | ~300 | Plan I/O, `.pmp/` paths |
| Util | Path safety, masking, policy resolver, ID generator, goal parser | ~400 | Tested |

Governance artifacts: `constitution.md` (AI behavior rules, version 1.0), `FEATURE_CHECKLIST.json` (16 entries), `FEATURE_PROGRESS.md` (P4 backlog), `planmyproject.template.md`.

### 2.2 Strengths to Preserve

These are the operational structure that G6 requires v3 to keep. They are listed as invariants in §3.3.

- **Markdown-first single source of truth.** `planmyproject.md` is human-editable, git-synced, and round-trips through `parsePlanMarkdown` / `serializePlanMarkdown` with inline `<!-- pmp:... -->` metadata.
- **Typed tasks with gates.** `research` / `decision` / `implementation` / `milestone`; research gate, dependency gate, debate gate all feed one `getTaskBlockReason` function and one queue builder.
- **One-level planning.** The AI expands one level at a time; the user controls depth. Confidence threshold routes low-confidence drafts to review.
- **Knowledge capture.** Research conclusions are indexed and injected into later prompts (KNOWLEDGE LAYER).
- **Debate loop.** Critical, action-bearing conversation per task with structured resolution markers.
- **Safety and consent.** Prompt masking, path safety with symlink checks, sensitive-file confirmation, per-task file-send policy, session consent modes, secrets storage.
- **Service decomposition.** `PlanController` delegates to `ScanService`, `ConsentService`, `TaskCommandService`, `GoalCommandService`. New capabilities can follow the same pattern.
- **Test harness and gate.** Node test runner, `vscode` shim, integration scenarios, feature checklist that fails CI when a listed test is missing.
- **Constitution.** A written AI governance document with red lines and change log.

### 2.3 Gap Analysis Against the Six Goals

| Goal | What v2 has | What is missing | Severity |
|---|---|---|---|
| **G1 Native first** | Tree view, CodeLens on plan file, WebView panels, status bar, `vscode.lm` for Copilot, secrets, workspace trust | No Chat Participant; no Language Model Tools (Copilot agent mode cannot see or update the plan); no Diagnostics; no Git API use; no CodeLens on specs or source; no walkthrough; Copilot provider takes the first model with no selection; `getGitUserName` calls a non-existent VS Code command and always falls back to the OS user | High |
| **G2 Spec definition** | `ProjectGoal` with statement, criteria, constraints, out-of-scope; goal import from markdown; starter root tasks | No requirements, user stories, or acceptance criteria as first-class entities; no clarification markers; no spec lifecycle (draft/approved); no per-feature spec files; constitution is a repo doc, never injected into prompts; `goalCriterionIndex` in AI output is parsed but never validated or stored | High |
| **G3 SDLC compatibility** | Plan summary export (markdown) | No issue tracker sync; no external IDs on tasks; no estimates or labels; no Spec Kit interop; no ADR export; v2 spec Appendix A explicitly deferred this | High |
| **G4 Low drift** | `linkedFiles`, post-implement rescan, "overwrite complete file" confirmation, research index | `linkedFiles` never validated to exist; no fingerprints of spec or code at plan/complete time; no diff of pre/post scans (P4-B1 missing); no detection of code changes after a task is done; no detection of unplanned changes; no coverage check (requirement without task, task without requirement); no Problems-panel surfacing | High |
| **G5 Cost monitoring** | Nothing | `AITextResponse` has no usage field; providers discard usage; Claude provider has hardcoded `max_tokens: 1800` and model `claude-3-7-sonnet-latest`; no ledger, no pricing, no pre-flight estimate, no budget, no prompt size budgeting | High |
| **G6 Operational structure** | Everything in §2.2 | Nothing missing; v3 must remain additive | — |

### 2.4 Unfinished v2 Items That v3 Depends On

From `FEATURE_PROGRESS.md`, these P4 items are prerequisites rather than nice-to-haves:

| P4 item | Why v3 needs it |
|---|---|
| **P4-B1** Auto-mark from scan deltas | Becomes the first drift detector (status drift). v3 generalizes it. |
| **P4-B2** `code-inferred` tasks from scan | Needed for "unplanned change" drift and the onboarding wizard. |
| **P4-D1** Enforce goal criterion reference | v3 replaces `goalCriterionIndex` with `reqRefs`; the validation hook is the same place. |
| **P4-D2** Tighter response schema validation | Spec generation adds new schemas; the parser needs strict guards first. |
| **P4-C2** Debate streaming | The chat participant streams; the debate panel should not lag behind. |
| **P4-H3/H4** Watcher error handling, cycle surfacing | Drift diagnostics reuse the same surfacing path. |

Recommendation: close P4-B1, B2, D1, D2, H3, H4 and release **2.0.0** before starting P5. Estimated 1–2 weeks.

**[draft2]** The P0 items in §2.6 are a harder prerequisite than these. They are correctness defects in code v3 builds directly on, and they ship before the 2.0.0 release, not after it — releasing 2.0.0 with a parser that discards dependency edges and per-task privacy settings would ship the bug to the Marketplace.

### 2.5 Additional Findings From This Analysis

Issues not in the existing backlog, discovered while reading the code:

| # | Finding | Location | v3 handling |
|---|---|---|---|
| F1 | `getGitUserName` runs `vscode.commands.executeCommand("git config user.name")`, which is not a command; it always throws and falls back to `os.userInfo().username`. Debate attribution therefore never uses the git identity. | `src/storage/WorkspaceFiles.ts:116` | P7-N6 replaces with the Git extension API. |
| F2 | `ClaudeProvider` is non-streaming, uses a dated model ID, and caps output at 1,800 tokens; long task lists are truncated silently. | `src/ai/ClaudeProvider.ts` | P8-C1 and P10-H2. |
| F3 | `OpenAIProvider` is non-streaming and swallows the Responses API error body before falling back to Chat Completions. | `src/ai/OpenAIProvider.ts:51` | P8-C1. |
| F4 | `PlanCodeLensProvider` re-parses the entire document on every `provideCodeLenses` call instead of reusing the controller's parsed plan. | `src/ui/CodeLensProvider.ts:6` | P7-N4 shares the parsed document via a document-version cache. |
| F5 | `getTaskTraversalRank` walks the whole tree per comparison and the ready queue is re-sorted on every insertion; the build is O(n³ log n) in the worst case. **Measured: 21 ms at 100 tasks, 1.66 s at 500, 18.8 s at 1,000, 117 s at 2,000** — 99.1% of serialize time, on every mutation. | `src/queue/QueueBuilder.ts:69,134` | **[draft2]** Escalated from P10-H4 to **P0-B1** (§2.6). |
| F6 | `PromptBuilder` has no size budget; workspace layer is trimmed by fixed slices (12 modules, 15 deps) regardless of model context. | `src/ai/PromptBuilder.ts:146` | P8-C5 adds a token budgeter. |
| F7 | `TaskGenerator.materializeDrafts` copies `draft.linkedFiles` without checking existence; AI-hallucinated paths become permanent metadata. | `src/generation/TaskGenerator.ts:90` | P6-T2 validates and tags links. |
| F8 | `ResearchIndex.queryRelevant` rewrites the index file on every query to bump `usedInPrompts`, producing git noise on a committed file. | `src/research/ResearchIndex.ts:74` | P10-H5 moves usage counts to `.pmp/` local state. |
| F9 | `constitution.md` lists an audit log (`.pmp/ai-audit.jsonl`) as planned; nothing writes it. | `constitution.md §11` | P8-C3 implements the ledger, which doubles as the audit log. |
| F10 | `.vscodeignore` excludes the docs correctly, but `USER_GUIDE.md` and `USER_GUIDE_UPDATED.md` coexist with overlapping content. | repo root | P10-H7 consolidates docs. |
| **F11** | **`parseInlineMetadata` truncates its input at the first colon, discarding every task metadata field serialized before `createdAt`.** Reproduced on `7266bca`: `goalRef`, `confidence`, `origin`, `dependsOn`, `linkedFiles`, and `fileSendPolicy` are lost on every save. | `src/parser/PlanParser.ts:359` | **[draft2]** **P0-A3** (§2.6). Live data-loss and privacy bug. |
| **F12** | 21 `vscode.workspace.fs` call sites, ~550–600 RPC round trips per scan, while `PathSafetyChecker` already uses `node:fs` directly — the codebase uses both paths inconsistently. | `src/scanner/`, `src/storage/` | **[draft2]** P10-H10. |
| **F13** | `DebatePanel` sets `retainContextWhenHidden: true`; v3 would add two more retained webviews. | `src/debate/DebatePanel.ts` | **[draft2]** P10-H11: serialize and restore panel state instead. |
| **F14** | `persistAndRefresh` re-reads the plan file from disk for the undo snapshot although the previous serialized string was in memory a tick earlier, and `maybeArchiveDebateEntries` iterates every task on every persist. | `src/controller/PlanController.ts` | **[draft2]** P10-H12. |

### 2.6 Blocking Defects (P0) — From the Performance Analysis [draft2]

The companion analysis measured the compiled v2 build and found two defects that must be fixed before P5 begins. Both are reproduced against `7266bca`. The first is a live data-loss bug, not a performance concern.

#### P0-A — Task metadata is destroyed on every save

`parseInlineMetadata` ([src/parser/PlanParser.ts:359](src/parser/PlanParser.ts#L359)) opens by stripping everything before the first `:` in its input, intending to drop a leading `pmp:` prefix. But the task-metadata caller ([line 296](src/parser/PlanParser.ts#L296)) has **already removed that prefix**, so the first colon found is the one inside the `createdAt` ISO timestamp — and every field serialized before it is discarded.

The serializer writes fields in this order:

```
id · parent · type · origin · goalRef · confidence · dependsOn · linkedFiles · fileSendPolicy · createdAt · completedAt · notes · archivedDebatePath
```

Measured on one serialize → parse round trip of a task carrying every field:

| Field | Before | After one save | |
|---|---|---|---|
| `goalRef` | `"G0001"` | `null` | **lost** |
| `confidence` | `0.88` | `null` | **lost** |
| `origin` | `"ai-generated"` | `"manual"` | **lost** |
| `dependsOn` | `["T0001"]` | `[]` | **lost** |
| `linkedFiles` | `["src/pdf/render.ts"]` | `[]` | **lost** |
| `fileSendPolicy` | `"always"` | `"global"` | **lost** |
| `notes`, `completedAt`, `archivedDebatePath` | — | unchanged | survive — they follow `createdAt` |

Because `persistAndRefresh()` re-parses its own serialized output and assigns the result back to `this.plan`, the corruption enters memory immediately and is written to disk on the next mutation. The plan file degrades progressively toward a structure-only document. Two consequences outrank the rest:

- **A task blocked by an unresolved dependency is presented as ready to implement.** Measured on a two-task plan: `blocked: [T0002] → []`, `ready: [] → [T0001, T0002]`. This is the exact failure the research and dependency gates exist to prevent.
- **A per-task `fileSendPolicy: "never"` silently reverts to the global default.** That is a privacy regression against I5.

**Why 72 tests miss it.** Task identity, title, status, parent/child nesting, and `type` all come from the task *line* rather than the metadata comment — IDs and titles from the line regex, status from the checkbox, nesting from indentation, `type` from the leading icon via `inferTaskType`. A round-trip test comparing tree shape and titles passes cleanly while every metadata-only field is dropped.

The goal-metadata caller ([line 222](src/parser/PlanParser.ts#L222)) does **not** pre-strip, so it consumes `pmp:` as intended and is unaffected.

**Fix:** delete the prefix-stripping line from `parseInlineMetadata` and have each caller pass only the payload. The task caller already does; the goal caller adds `.replace(/^pmp:goal-meta:/, "")`.

#### P0-B — Execution queue build is super-linear

`sortLeavesByDependencies` ([src/queue/QueueBuilder.ts:69](src/queue/QueueBuilder.ts#L69)) stacks three compounding costs: the ready queue is re-sorted on every insertion, each comparison calls `getTaskTraversalRank` twice, and each rank lookup walks the entire task tree from all roots. That is O(n³ log n) in the worst case.

| Tasks | Current | Precomputed ranks + binary insertion | Speedup |
|---:|---:|---:|---:|
| 100 | 21.3 ms | 0.54 ms | 39× |
| 250 | 323.6 ms | 1.20 ms | 270× |
| 500 | 1,656.7 ms | 2.58 ms | 641× |
| 1,000 | 18,773.7 ms | 1.91 ms | ~9,800× |
| 2,000 | >110,000 ms | ~4 ms | >25,000× |

Same output ordering, same semantics; the change is confined to one function plus a rank map threaded through `compareTaskOrder`.

This matters more than the raw numbers suggest. `serializePlanMarkdown` accounts for 99.1% of its time in the queue at 500 tasks, and it runs from `persistAndRefresh()` after add, delete, plan, implement, **every debate message**, mark-research-complete, set-file-send-policy, rebuild-queue, set-goal, import-goal, and undo. On a 500-task plan, typing a debate message costs a 1.6-second extension-host stall; at 1,000 tasks, 19 seconds. Users read that as a hang.

`FEATURE_PROGRESS.md` records this as **C5**, classified as a code-quality issue. It is not. It is the dominant cost of the extension's most frequent write operation.

#### The two defects mask each other — ship the fixes together

The queue's pathological path is reached only when a leaf task's `dependsOn` entries resolve to **other leaf tasks**. P0-A destroys exactly those edges on the first save:

| Tasks | Dependency edges | Resolving to a leaf | Queue build |
|---:|---:|---:|---:|
| 250, as authored | 139 | 139 | 508.7 ms |
| 250, after one save | 0 | 0 | 14.5 ms |
| 500, as authored | 278 | 278 | 2,602.1 ms |
| 500, after one save | 0 | 0 | 66.0 ms |

Users are largely spared the performance cliff today *because* their dependency data is being thrown away before it can be walked.

> **Fixing the parser without fixing the queue would make the write path roughly 40× slower overnight**, and would read to users as a regression caused by the metadata fix. P0-A3 and P0-B1 land in the same commit, guarded by one benchmark.

#### Fix sequence

Order matters: steps 1 and 2 prove both defects exist before either is touched, and prove the interaction rather than asserting it.

1. Round-trip **fidelity test** over all thirteen metadata fields — fails on current code.
2. Queue **benchmark** at 2,000 tasks with dependencies intact — fails on current code.
3. Fix `parseInlineMetadata` — fidelity test passes, benchmark gets dramatically worse.
4. Fix `sortLeavesByDependencies` — benchmark passes.
5. **Regression test**: a task with an unresolved dependency stays blocked across a round trip.

#### P0 tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P0-A1** | Field-level round-trip fidelity test: all thirteen task metadata fields survive serialize → parse. Must fail on `7266bca`. | `test/parser-fidelity.test.ts` | S | — |
| **P0-A2** | Queue benchmark: build under 10 ms at 2,000 tasks with dependency edges intact. Must fail on `7266bca`. | `test/bench/queue.bench.ts` | S | — |
| **P0-A3** | Fix `parseInlineMetadata` prefix handling; audit every caller | `src/parser/PlanParser.ts` | S | A1 |
| **P0-B1** | Rewrite `sortLeavesByDependencies`: one O(n) rank pre-pass, binary insertion, rank map threaded through `compareTaskOrder`; assert identical ordering | `src/queue/QueueBuilder.ts` | S | A2 |
| **P0-B2** | Regression test: unresolved dependency keeps a task in the blocked queue section across a round trip | `test/queue.test.ts` | S | A3, B1 |
| **P0-B3** | **Re-validate every v2 feature that reads task metadata** — research gate, dependency gate, queue blocking, implement context, file-send policy, linked files, confidence routing | tests across suites | M | A3 |
| **P0-C1** | `test/bench/` harness, `npm run bench`, CI budget gate (§14.4) | `test/bench/`, `package.json`, `.github/workflows/ci.yml` | M | A2 |
| **P0-C2** | esbuild bundling to a single `out/extension.js` | `esbuild.js`, `package.json`, `.vscodeignore` | S | — |
| **P0-D1** | **[draft3]** Settings-scope hardening: classify all 17 settings (§12.4); machine-scope secrets, consent and egress; enforce the stricter-only workspace rule; deprecate the plaintext API-key settings and clear them after migrating to secrets | `package.json`, `src/ai/AIService.ts` | S | — |
| **P0-D2** | **[draft3]** Apply `isSensitiveWorkspacePath` to **egress** in `collectLinkedFileSnapshots`; split the list into `BUILD_METADATA` (warn on write) and `SECRET_BEARING` (refuse on egress); name the files in the send prompt | `PathSafetyChecker.ts`, `TaskCommandService.ts` | S | — |
| **P0-D3** | **[draft3]** Expand masking patterns (AWS, GCP, Slack, JWT, connection strings, `github_pat_`, `glpat-`); wire `maskEmails` / `maskIpAddresses` to settings or delete them; one test per pattern class | `PromptMasker.ts`, `AIService.ts`, `test/masking.test.ts` | S | — |
| **P0-D4** | **[draft3]** Security regression tests: a workspace setting cannot weaken a control; `.env` in `linkedFiles` is refused on egress; symlink escape blocked at every write site | `test/security.test.ts` | M | D1, D2 |

P0-B3 is not optional. `dependsOn`, `linkedFiles`, `goalRef`, `confidence`, `origin`, and `fileSendPolicy` have not round-tripped since the v2 parser was written, so **no feature reading them has ever been exercised end to end**. Expect to find second-order bugs that the data loss was hiding.

**[draft3]** The P0-D items come from `PlanMyProject_v3_Security.md` and are live v2 defects, not v3 design issues. They ship with P0 for the same reason the parser fix does: publishing an extension whose safety controls a cloned repository can switch off is worse than a short delay. Two of them compound with P0-A — a per-task `fileSendPolicy: "never"` is the control a user would set to prevent exactly the egress in P0-D2, and it does not currently survive a save.

---

## 3. Vision and Principles for v3

### 3.1 What "Spec-Driven Development" Means in PlanMyProject

> A spec is the contract. The plan tree is how the contract is delivered. The code is evidence that the contract was met. PlanMyProject v3 keeps all three visibly linked inside VS Code and tells you the moment they disagree.

The v3 lifecycle:

```
Idea ──► Constitution ──► Specify ──► Clarify ──► Approve
                                                    │
        ┌───────────────────────────────────────────┘
        ▼
      Plan (tasks anchored to requirements) ──► Debate / Research ──► Analyze
        │                                                                │
        ▼                                                                ▼
      Implement (classic JSON or agent hand-off) ──► Verify ──► Sync (Jira, GitHub)
        ▲                                             │
        └───────────── Drift engine (continuous) ◄────┘
```

Every arrow is a command a user can run from the tree, CodeLens, command palette, or `@pmp` chat. Every stage writes markdown into the repository. Nothing requires a hosted service.

### 3.2 Comparison With Spec Kit and Superpowers

| Aspect | GitHub Spec Kit | Superpowers (Claude Code skills) | PlanMyProject v3 |
|---|---|---|---|
| Host | CLI + agent slash commands (Copilot, Claude Code, Cursor, ...) | Claude Code skills | VS Code extension; works with Copilot, Claude, OpenAI |
| Constitution | `memory/constitution.md`, loaded by every command | Implicit in skills | `.pmp/constitution.md` + built-in AI constitution, injected into every prompt (§5.5) |
| Spec artifacts | `specs/NNN-feature/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md` | `docs/plans/*.md` with bite-sized tasks | `specs/SNNNN-slug/spec.md` (+ optional `plan.md`, `contracts/`); tasks live in the plan tree, exported to `tasks.md` on demand |
| Clarification | `[NEEDS CLARIFICATION]` markers, `/clarify` | Brainstorming skill asks questions | Same marker syntax, parsed into `clarifications[]`, blocks approval; resolved through the Debate infrastructure or `@pmp /clarify` |
| Consistency check | `/analyze` across spec, plan, tasks | Verification-before-completion skill | `Analyze` command + continuous drift engine + Problems panel |
| Execution | `/implement` drives the agent | Executing-plans skill, subagents, TDD | Classic JSON implement, or hand-off to an agent using PMP's tools over MCP (Copilot agent mode via the LM shim) |
| Traceability to code | None built in | None built in | Requirement → task → file/symbol → test links with fingerprints (§6) |
| Cost visibility | None | None | Ledger, pricing, pre-flight estimate, budgets (§8) |
| Tracker integration | None | None | Jira, GitHub Issues adapters (§9) |
| Gates | Checklists | Skill instructions | Research gate, debate gate, spec gate, drift gate, budget gate; all in `getTaskBlockReason` |

What v3 **adopts**: constitution as a runtime artifact, per-feature spec directories, clarification markers, an analyze step, and Superpowers' "verify before you claim completion" rule as a first-class `Verify` command.

What v3 **deliberately does differently**: it stays inside VS Code (no CLI dependency), keeps the single plan file as the index for the tree and queue, keeps markdown as the storage format for everything committed, and makes gating enforceable in the extension rather than advisory in a prompt.

### 3.3 Invariants (G6)

v3 must not break any of the following. Each has a test in the feature checklist.

| # | Invariant |
|---|---|
| I1 | `planmyproject.md` remains the plan tree and execution queue index; a v2 plan opens in v3 and migrates with a backup, exactly like v1 → v2. |
| I2 | Task IDs (`T0001`) and goal IDs (`G0001`) keep their format and remain globally unique; new ID families (`S`, `R`, `AC`) follow the same generator pattern. |
| I3 | All existing commands keep their IDs and behavior; new behavior is additive or opt-in by setting. |
| I4 | Research gate, dependency gate, and debate gate keep their semantics; new gates (spec, drift, budget) are added to `getTaskBlockReason` and default to warn-only where noted. |
| I5 | Consent, masking, path safety, sensitive-file confirmation, and file-send policy apply to every new AI call, including chat and tool invocations. |
| I6 | **[draft2, relaxed]** Runtime npm dependencies require an explicit decision (§15). `vscode-languageclient` / `vscode-languageserver` are approved by **D-10** (§4.4). The invariant is a means — small VSIX, no supply-chain surface — not an end, and it does not justify hand-rolling a protocol that already exists. |
| I7 | Every new service is a class injected through `PlanController`, unit-testable with the `vscode` shim. |
| I8 | Every new feature has an entry in `FEATURE_CHECKLIST.json` before it is marked complete. |
| I9 | The AI constitution remains authoritative; new prompts cite it; any relaxation requires a constitution change-log entry. |
| **I10** | **[draft2]** Every task and spec metadata field serialized into markdown round-trips unchanged through serialize → parse. Enforced field-by-field (P0-A1); no field is added to a model without an accompanying fidelity assertion. |
| **I11** | **[draft2]** No user-initiated action blocks the extension host for more than 100 ms. Anything heavier runs off-host or in the background. Enforced by the budgets in §4.5 and the CI gate in §14.4. |
| **I12** | **[draft3]** No workspace-supplied setting may weaken a safety control. A workspace may make a gate **stricter**; only user or machine scope may make one weaker (§12.4). |
| **I13** | **[draft3]** Untrusted text — workspace files, tracker content, model output — is data, never instruction. It may not alter gate state, consent state, or confirmation behaviour (§3.5). |
| **I14** | **[draft3]** Every safety control is enforced at the lowest shared layer, so the extension, LSP server, MCP server, and CLI cannot diverge. |
| **I15** | **[draft3]** No file is transmitted to a provider without passing the sensitivity check, regardless of how it entered `linkedFiles`. |

### 3.4 Non-Goals for v3

- Hosted backend, accounts, or cloud sync.
- Real-time multi-user editing of the plan.
- Replacing Jira or GitHub as the team's system of record; PMP syncs, it does not own workflow.
- Full static analysis or AST-accurate symbol resolution; symbol links use the existing regex signature extractor plus VS Code's document symbol provider where available.
- Executing arbitrary shell commands on the user's behalf; `Verify` may run the configured test task through the VS Code Task API only with confirmation. **[draft3]** There is no `"always"` mode; see §6.5.
- Support for untrusted workspaces. **[draft3]** Workspace Trust gates activation, but it is not a substitute for scoping: see §3.5 and §12.4.

### 3.5 Threat Model and Trust Boundaries [draft3]

Draft 1 and draft 2 had no threat model. v2's controls — consent, masking, path safety, file-send policy — were designed on the assumption that **the workspace is trusted and the AI is the risk**. v3 inverts that: it ingests repository-authored and tracker-authored text into prompts (§5.5), and hands models tools that mutate state and write files (§7.2, §7.3). Untrusted input now arrives from the workspace, and the existing controls do not face that direction.

#### Principals

| Principal | Trusted? | Why |
|---|---|---|
| The user at the keyboard | **Yes** | Their intent is the system's purpose |
| The local machine and VS Code | **Yes** | Compromise here is out of scope |
| **Workspace file contents** | **No** | Arrives by clone, by PR, by a colleague's commit |
| — `specs/**/spec.md` | **No** | Fed into the SPEC prompt layer (§5.5) |
| — `.pmp/constitution.md` | **No** | Rendered into the CONSTITUTION layer of every prompt (§5.5) |
| — `.vscode/settings.json` | **No** | Overrides every extension setting unless scoped (§12.4) |
| — `.vscode/tasks.json` | **No** | Executed by `Verify Task` (§6.5) |
| **Tracker content** (Jira, GitHub issue bodies) | **No** | Remote, authored by anyone with access (§9.1, §9.4) |
| **Model output** | **No** | May be injected, hallucinated, or simply wrong |
| Third-party AI providers | **Semi** | Contractually bound, but data sent cannot be recalled |

#### Three enforcement rules

1. **Untrusted text is data, never instruction** (I13). Anything sourced from the workspace or a tracker enters a prompt delimited and labelled as untrusted content. Gates are evaluated in code from parsed state — never from model output. No tool response may cause a gate to be re-evaluated as passed.
2. **Untrusted settings may not configure safety** (I12). A workspace can express preferences and may make a gate stricter; it may never switch a control off. §12.4 is the scope table that enforces this.
3. **Every control is enforced at the lowest shared layer** (I14). v3 grows from one caller to four — extension, LSP server, MCP server, CLI. A check implemented in the VS Code layer is absent from the other three, so path safety, masking, and consent belong in the shared handlers, not in the editor adapter.

#### Why the constitution is not a control

`constitution.md` §3 lists red lines ("No sensitive file access", "No persona escape", "No self-delegation") and §8 adds "The AI must not bypass or suppress consent prompts." These are **prompt text asking a model to behave**. They constrain a cooperative model and do nothing against injected instructions or a confused one. Invariant I9 — a project constitution may only add rules, never remove built-in red lines — is enforced by the validator in P5-S17, not by the prose.

Every red line that matters is therefore paired with a code-level control:

| Constitution red line | Enforcing control |
|---|---|
| No codebase writes without task scope | `PathSafetyChecker.resolveSafeTargetPath`, at every write site (I14). **Not enforceable in hand-off mode** — §7.3 |
| No path traversal | `normalizeWorkspaceRelativePath` + `realpath` containment |
| No sensitive file access | `isSensitiveWorkspacePath` on **egress** as well as writes (P0-D2, I15) |
| Consent required | Consent settings are machine-scoped (§12.4, I12) |
| No self-delegation | Tool confirmations show resolved effects; mutating tools cannot chain unattended |

---

## 4. Target Architecture

### 4.1 Layer Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ VS Code surfaces (G1)                                                         │
│  Tree views: Implementation Tree · Specs · Drift · Usage                      │
│  CodeLens: plan file · spec files · source files (trace lenses)               │
│  Chat participant @pmp · MCP server (+ LM tool shim) · Diagnostics · Status  │
│  WebViews: Debate · Goal Setup · Spec Review · Usage Dashboard · Walkthrough  │
└──────────────┬────────────────────────────────────────────────────────────────┘
               ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PlanController (orchestrator, unchanged role)                                 │
│  TaskCommandService · GoalCommandService · SpecCommandService (new)           │
│  SyncCommandService (new) · ChatParticipantService (new) · LmToolService (new)│
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
       ▼          ▼          ▼          ▼          ▼          ▼
  SpecService  TraceService DriftEngine CostService SyncService ConstitutionService
   (new)        (new)        (new)       (new)      (new)        (new)
       │          │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Existing core: PlanParser · PlanModel · QueueBuilder · WorkspaceScanner       │
│ ScanService · AIService (+usage) · PromptBuilder (+budget) · ResponseParser    │
│ TaskGenerator · DebateService · ResearchIndex · ConsentService · PathSafety    │
└──────────────────────────────┬────────────────────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Storage (git-synced unless noted)                                             │
│  planmyproject.md · specs/SNNNN-slug/spec.md · .pmp/constitution.md           │
│  .pmp/research-index.json · .pmp/debate-archive/ · .pmp/sync/*.json           │
│  local only: .pmp/scan-cache.json · .pmp/usage.jsonl · .pmp/trace-cache.json  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 New Modules

**[draft2]** The tree below is the extension-side layout. Per §4.4, the pure modules among these — `SpecParser`, the drift detectors, `PromptBudgeter`, `PricingTable` — live in `@planmyproject/core`, and `server/` (LSP, from P6), `mcp/` (agent tools, from P7), and `cli/` (from P9) are siblings of `src/` that consume it:

```
core/                            # @planmyproject/core — no vscode, no I/O (P5-S0)
server/                          # LSP server: parse, trace, drift, language features (P6-T17)
mcp/                             # MCP server over the shared tool handlers (P7-N3)
cli/                             # pmp CLI (P9-X10)
src/                             # VS Code extension (thin): UI, consent, secrets, AI calls
```

```
src/
├── spec/
│   ├── SpecParser.ts            # specs/*/spec.md ↔ SpecDocument (round-trip, same comment style as PlanParser)
│   ├── SpecService.ts           # discover, load, save, lifecycle transitions, hashing
│   ├── SpecGenerator.ts         # AI: idea → spec draft; clarification resolution; requirement → tasks
│   ├── SpecReviewPanel.ts       # WebView: clarifications, approval, requirement coverage
│   └── index.ts
├── constitution/
│   ├── ConstitutionService.ts   # loads .pmp/constitution.md + built-in rules; renders prompt layer
│   └── index.ts
├── trace/
│   ├── TraceModel.ts            # TraceLink, Fingerprint types
│   ├── TraceService.ts          # record/validate links; symbol lookup via scanner + DocumentSymbolProvider
│   ├── DriftEngine.ts           # detectors, scoring, report
│   ├── DriftDiagnostics.ts      # DiagnosticCollection publisher
│   ├── GitFacade.ts             # thin wrapper over vscode.git API (HEAD, diff, log, user)
│   └── index.ts
├── native/
│   ├── ChatParticipant.ts       # @pmp with slash commands
│   ├── ToolHandlers.ts          # the nine agent tool handlers, transport-agnostic (§7.2)
│   ├── LmTools.ts               # thin vscode.lm.registerTool shim over ToolHandlers
│   ├── DocumentCache.ts         # one parsed-document cache keyed by document.version (F4)
│   ├── SourceCodeLensProvider.ts# trace lenses on source files (opt-in)
│   ├── SpecCodeLensProvider.ts  # lenses on spec files
│   └── index.ts
├── cost/
│   ├── UsageLedger.ts           # .pmp/usage.jsonl append + rollups
│   ├── PricingTable.ts          # defaults + setting overrides
│   ├── TokenEstimator.ts        # countTokens (Copilot), count_tokens (Claude), heuristic fallback
│   ├── PromptBudgeter.ts        # trims prompt layers to a token budget, records truncations
│   ├── BudgetGuard.ts           # session/task budgets, warn/block
│   └── index.ts
├── sync/
│   ├── SyncAdapter.ts           # interface + mapping types
│   ├── JiraAdapter.ts
│   ├── GitHubIssuesAdapter.ts
│   ├── SpecKitBridge.ts         # import/export Spec Kit layout
│   ├── AdrExporter.ts           # decisions → docs/adr (MADR)
│   ├── CsvExporter.ts           # Jira-importable CSV
│   ├── SyncService.ts           # orchestration, conflict policy, state files
│   └── index.ts
└── ui/
    ├── SpecTreeProvider.ts
    ├── DriftTreeProvider.ts
    ├── UsageTreeProvider.ts
    └── UsageDashboardPanel.ts
```

### 4.3 Mapping the SDD Lifecycle Onto Existing Commands

| Stage | v3 command | Built on |
|---|---|---|
| Constitution | `PlanMyProject: Edit Constitution` | New; file open + validation |
| Specify | `PlanMyProject: Specify Feature` | `GoalCommandService` pattern + `TaskGenerator`-style generation |
| Clarify | `PlanMyProject: Clarify Spec` | `DebateService` prompt style, `DebatePanel` or `@pmp` |
| Approve | `PlanMyProject: Approve Spec` | Lifecycle transition in `SpecService` |
| Plan | `Plan Task` (existing) + `Plan From Spec` (new) | `TaskGenerator` with requirement anchoring |
| Debate / Research | existing `Debate Task`, `Mark Research Complete` | Unchanged |
| Analyze | `PlanMyProject: Analyze Spec` | `DriftEngine` coverage detectors |
| Implement | `Implement Task` (existing) + `Implement With Agent` (new) | Classic path unchanged; new path uses chat + the agent tool handlers (§7.2) |
| Verify | `PlanMyProject: Verify Task` / `Verify Spec` | `DriftEngine` + `GitFacade` |
| Sync | `PlanMyProject: Sync With Tracker` | `SyncService` |

### 4.4 Execution Model: Headless Core and Process Boundary [draft2]

§4.1 describes *what* the modules are. This section fixes *where they run*, which draft 1 left implicit — and implicitly put everything on the extension host.

**The problem.** Every extension in a window shares one extension host process. A synchronous 1.6 s serialize does not freeze the renderer, but it does block every other extension's event handlers for that duration — GitLens decorations, ESLint fixes, everything. v3 then adds a drift engine that runs **without the user asking**, on spec save, plan save, and git state change. That is precisely the workload language servers exist to isolate.

**The enabler already exists.** A static import-graph walk over `src/` shows **28 of 59 modules are free of any `vscode` import across their full transitive closure** — the entire model, parser, queue, prompt builder, response parser, and signature extractor. The boundary v3 needs is already there; it has simply never been drawn.

#### `@planmyproject/core`

A pure-TypeScript package: no `vscode`, no I/O, functions and types only.

```
@planmyproject/core
  model/      TaskNode, PlanModel, ProjectGoal, WorkspaceScan, SpecDocument, TraceLink
  parser/     PlanParser, SpecParser, SchemaUpgrader
  queue/      QueueBuilder
  drift/      detectors — pure (input: DriftInput) => DriftFinding[]
  ai/         PromptBuilder, ResponseParser, PromptBudgeter, PricingTable
  scanner/    SignatureExtractor, ModuleGrouper, FeatureInferrer, LanguageDetector
  util/       IdGenerator, PromptMasker, path normalization
```

§6.4 already specifies drift detectors as pure `(DriftInput) => DriftFinding[]` functions "for testability", so the design was heading for this boundary already. Formalizing it costs little. Everything that needs a host — file access, secrets, UI, consent — stays in a thin adapter per surface.

Extraction is mostly moving files, and it is cheapest **now**, before roughly 50 new modules are written against the current structure. It becomes **P5-S0**, a prerequisite for the rest of P5.

#### What runs where

| v3 component | Surface | Rationale |
|---|---|---|
| Plan and spec parsing, queue building | Core, hosted in the LSP server | Pure; needed by every surface |
| Trace graph | LSP server | Continuous, incremental, memory-resident |
| Drift detectors | Core (pure), driven by the LSP server | Off the extension host |
| Diagnostics, hover, definition, document links, CodeLens | LSP server | Native protocol capabilities |
| Workspace scanner | LSP server | Heavy file I/O; can use `node:fs` directly |
| AI calls, consent, masking | Extension | Needs secrets and UI |
| Cost ledger and budgets | Core math, extension I/O | Ledger writes need workspace access |
| Tree views, webviews, walkthrough, chat participant | Extension | UI and VS Code API |
| Agent tools | MCP server; VS Code LM tools are a shim over the same handlers (§7.2) | One implementation, two transports |
| Tracker sync | Manual trigger in the extension; bulk work in CLI/CI (§9.1) | Network latency must not touch the editor |

#### Sequencing

The LSP server is stood up in **P6**, when the drift engine arrives and justifies the process. Until then the core is simply a package boundary the extension imports directly, so **P5 pays no process cost** and the boundary is validated by use before anything depends on it across a wire.

Cost: roughly **+2 weeks** for extraction and LSP scaffolding, substantially offset by the MCP server replacing rather than supplementing LM Tools (§7.2) and by a CLI making P9 sync testable without a live Jira instance. Net **+1 to +2 weeks** on the 14–18 week estimate.

#### Filesystem access

All 21 `vscode.workspace.fs` call sites are RPC round trips to the main process file service; a full 500-file scan issues 550–600 of them. `PathSafetyChecker` already imports `node:fs` directly, so the codebase uses both access paths inconsistently and the faster one is the exception. New code on the `file:` scheme uses `node:fs`, falling back to `workspace.fs` for virtual schemes (**P10-H10**). This also keeps `PathSafetyChecker` splittable into a pure normalizer plus a host-specific symlink check, which is what a future web build would need.

#### Surfaces the core unlocks

Not committed for 3.0, but the reason the boundary is worth drawing now:

| Surface | Value | Phase |
|---|---|---|
| **MCP server** | Nine agent tools usable from Claude Code, Cursor, Windsurf, JetBrains, and VS Code rather than Copilot agent mode alone | P7 (replaces LM Tools — §7.2) |
| **CLI (`pmp`)** | `pmp drift --format sarif` as a required PR check makes G4 enforceable rather than advisory; SARIF renders inline in GitHub review | P9 |
| **CI Action** | Tracker sync and drift reporting as jobs, off the editor entirely; addresses R2 and R6 | P9 |
| **Web extension** | Explicitly **not recommended for 3.0** — `node:fs`, `Buffer`, and `node:path` usage make parity a meaningful project for uncertain benefit | — |

### 4.5 Performance Budgets [draft2]

Design constraints, not aspirations. §14.4 makes them CI gates.

| Path | Budget |
|---|---|
| Activation, cold | **< 150 ms** |
| Activation, warm | **< 80 ms** |
| Plan mutation → file written | **< 50 ms @ 1,000 tasks** |
| Parse plan file | **< 30 ms @ 1,000 tasks** (met today: 23.5 ms) |
| Build execution queue | **< 10 ms @ 2,000 tasks** |
| Incremental drift, one spec changed | **< 100 ms** |
| Full drift sweep | **< 2 s, off the extension host** |
| CodeLens provide | **< 20 ms @ 1,000 tasks** |
| **Any single extension-host block** | **< 100 ms** — the hard rule (I11); anything longer moves off-host |
| Tracker sync | **No budget — background only**; must never block a user action |

Two correctness gates belong in the same suite:

| Invariant | Enforcement |
|---|---|
| Every task metadata field survives serialize → parse (I10) | Field-by-field assertion (P0-A1) |
| A blocked task stays blocked across a round trip | Queue-section assertion (P0-B2) |

Measured v2 baseline, for reference: activation ~100–140 ms (projected from 36.5 ms to `require` 26 of 59 unbundled modules), parse 23.5 ms @ 1,000 tasks, serialize 12,988 ms @ 1,000 tasks (99% queue), scan cache `JSON.parse` 4.9 ms on the activation path.

The gate matters more than the specific numbers. A benchmark suite failing the build on a mutation-path regression would have caught P0-B the day it was written, and the fidelity test would have caught P0-A, which 72 passing tests did not.

---

## 5. Workstream A — Spec Layer (Goal 2)

### 5.1 Artifacts and File Layout

```
<workspace>/
├── planmyproject.md                  # index: goals, plan tree, queue (schema v3)
├── specs/                            # configurable: planmyproject.specsDir
│   ├── S0001-invoice-pdf/
│   │   ├── spec.md                   # requirements, ACs, NFRs, clarifications, scope
│   │   ├── plan.md                   # optional technical plan (architecture, data model, contracts)
│   │   └── contracts/                # optional: openapi.yaml, schema.json, ...
│   └── S0002-email-delivery/
│       └── spec.md
└── .pmp/
    ├── constitution.md               # project constitution (human-edited, git-synced)
    ├── research-index.json           # unchanged
    ├── debate-archive/               # unchanged
    ├── sync/                         # adapter state (git-synced, small)
    ├── scan-cache.json               # local
    ├── usage.jsonl                   # local by default
    └── trace-cache.json              # local, derived
```

Specs live in a visible directory because they are human-authored deliverables reviewed in pull requests. `.pmp/` stays reserved for machine state and the constitution.

### 5.2 Data Model

```typescript
export type SpecStatus = "draft" | "clarifying" | "approved" | "implementing" | "verified" | "superseded";
export type RequirementPriority = "must" | "should" | "could" | "wont";
export type RequirementKind = "functional" | "non-functional" | "constraint" | "interface";

export interface SpecDocument {
  id: string;                      // S0001
  slug: string;                    // invoice-pdf
  title: string;
  status: SpecStatus;
  goalRef: string | null;          // G0001
  summary: string;                 // one paragraph
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  clarifications: Clarification[];
  outOfScope: string[];
  assumptions: string[];
  externalRefs: ExternalRef[];     // Jira epic, GitHub milestone, ...
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  contentHash: string;             // sha256 of normalized requirement + AC text, 12 hex chars
  filePath: string;                // workspace-relative
}

export interface Requirement {
  id: string;                      // R0001 (global, not per-spec)
  specId: string;
  text: string;                    // "The system shall ..."
  kind: RequirementKind;
  priority: RequirementPriority;
  rationale: string | null;
  acRefs: string[];                // AC0001, ...
  dependsOn: string[];             // other requirement IDs
  hash: string;                    // sha256(normalized text), 12 hex chars
  line?: number;
}

export interface AcceptanceCriterion {
  id: string;                      // AC0001
  specId: string;
  reqRef: string;                  // R0001
  given: string;
  when: string;
  then: string;
  verification: "test" | "manual" | "review" | "metric";
  linkedTests: string[];           // test file paths or "file#testName"
  hash: string;
  line?: number;
}

export interface Clarification {
  id: string;                      // C0001
  specId: string;
  question: string;
  context: string;                 // requirement/AC id or "spec"
  status: "open" | "resolved";
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface ExternalRef {
  system: "jira" | "github" | "azure-devops" | "linear" | "other";
  key: string;                     // PROJ-123, owner/repo#45
  url: string | null;
  lastSyncedAt: string | null;
  remoteHash: string | null;       // hash of remote fields at last sync
}
```

`TaskNode` gains (see §11.1 for serialization):

```typescript
specRef: string | null;            // S0001
reqRefs: string[];                 // ["R0001", "R0003"]
acRefs: string[];                  // ["AC0002"]
reqHashes: Record<string, string>; // requirement hash at planning time, for spec drift
linkedSymbols: string[];           // "src/pdf/render.ts#renderInvoice"
linkedTests: string[];             // "test/pdf.test.ts#renders invoice"
externalRefs: ExternalRef[];
estimate: string | null;           // "3", "M", "5h" — free-form, mapped by adapters
labels: string[];
completedRev: string | null;       // git short SHA at completion
verification: TaskVerification;    // see §6.5
```

### 5.3 Spec Markdown Format

Same conventions as the plan file: headings, bullet lines with bracketed IDs, and `<!-- pmp:... -->` metadata comments immediately below.

```markdown
# S0001 — Invoice PDF Generation

<!-- pmp:spec:id=S0001;slug=invoice-pdf;status=draft;goalRef=G0001;createdAt=2026-09-17T09:00:00Z;approvedAt=null;approvedBy=null;jira=PROJ-41 -->

## Summary

Users can download any invoice as a PDF that matches the on-screen layout and includes tax breakdown.

## Requirements

- [R0001] The system shall render an invoice to PDF on demand from the invoice detail page.
  <!-- pmp:req:id=R0001;kind=functional;priority=must;acRefs=["AC0001","AC0002"];dependsOn=[] -->
  > Rationale: Core deliverable of G0001 success criterion 1.

- [R0002] PDF rendering shall complete within 2 seconds for invoices up to 200 line items.
  <!-- pmp:req:id=R0002;kind=non-functional;priority=should;acRefs=["AC0003"];dependsOn=["R0001"] -->

- [R0003] The PDF shall embed fonts so that output is identical across viewers. [NEEDS CLARIFICATION: which font family is licensed for embedding?]
  <!-- pmp:req:id=R0003;kind=constraint;priority=must;acRefs=[];dependsOn=["R0001"] -->

## Acceptance Criteria

- [AC0001] Given an invoice with 3 line items, when the user clicks "Download PDF", then a PDF is produced whose totals equal the on-screen totals.
  <!-- pmp:ac:id=AC0001;reqRef=R0001;verification=test;linkedTests=["test/pdf.test.ts#totals match"] -->

- [AC0002] Given an invoice in a non-USD currency, when rendered, then currency symbols and thousands separators follow the tenant locale.
  <!-- pmp:ac:id=AC0002;reqRef=R0001;verification=test;linkedTests=[] -->

- [AC0003] Given a 200-line invoice, when rendered on the reference machine, then p95 render time is under 2000 ms.
  <!-- pmp:ac:id=AC0003;reqRef=R0002;verification=metric;linkedTests=[] -->

## Clarifications

- [C0001] (R0003) Which font family is licensed for embedding?
  <!-- pmp:clarify:id=C0001;status=open;resolution=null;resolvedBy=null;resolvedAt=null -->

## Out of Scope

- Emailing the PDF (see S0002).

## Assumptions

- Tenants have at most one locale.
```

Parsing rules:

- `[NEEDS CLARIFICATION: ...]` inline in any requirement or AC creates or updates a `Clarification` bound to that ID. Resolving the clarification removes the marker and appends the resolution to the requirement's rationale.
- Requirement and AC hashes are computed over the normalized text (whitespace collapsed, marker removed, lowercase). The spec `contentHash` is the hash of the sorted requirement and AC hashes.
- Missing metadata comments are tolerated on read (IDs are assigned on next save), matching the plan parser's tolerance.
- The `Execution Queue`-style derived sections are not written into spec files; coverage is reported by Analyze, not serialized.

### 5.4 Commands

| Command | Behavior |
|---|---|
| `Specify Feature` | Prompts for a title and free-text idea (or uses the current goal). Sends CONSTITUTION + GOAL + WORKSPACE + KNOWLEDGE layers and asks for a spec draft in JSON (`SpecDraft` schema). Writes `specs/SNNNN-slug/spec.md` with status `draft`. Opens it. Low-confidence requirements get `[NEEDS CLARIFICATION]` markers instead of being silently accepted. |
| `Clarify Spec` | Lists open clarifications in a QuickPick (or all at once in the Spec Review panel). For each, the user can answer directly or ask PlanBot for options (one AI call, reusing `DebateService` prompt style). Resolution is written back; status moves `draft → clarifying → draft` until zero open items. |
| `Approve Spec` | Blocked while any clarification is open or any `must` requirement has no AC (configurable `spec.requireAcForMust`). Records `approvedAt`/`approvedBy` (git identity via `GitFacade`), sets status `approved`, freezes `contentHash`. |
| `Plan From Spec` | Creates one root task per `must`/`should` requirement group (AI proposes grouping; user confirms in a multi-select, same as starter root tasks today), each with `specRef`, `reqRefs`, and `reqHashes`. Then the existing `Plan Task` expands children. |
| `Analyze Spec` | Runs coverage detectors (§6.2) for one spec and writes diagnostics plus a markdown report to the output channel. |
| `Edit Constitution` | Opens `.pmp/constitution.md`, creating it from a template on first use. |
| `Open Spec` | QuickPick over specs; opens the file. |
| `Supersede Spec` | Marks a spec `superseded` and points to its replacement; tasks referencing it are flagged by the drift engine. |

`Plan Task` (existing) changes:

- The prompt gains a `[SPEC LAYER]` containing the requirement texts and ACs referenced by the task or its ancestors.
- The response schema replaces `goalCriterionIndex` with `reqRefs: string[]`; `ResponseParser` rejects unknown requirement IDs (completing P4-D1 in its v3 form).
- Materialized tasks inherit `specRef` from the parent and store `reqHashes` for every referenced requirement.

### 5.5 Prompt Architecture Changes

The layered prompt in `PromptBuilder.ts` gains two layers and one budget:

```
[CONSTITUTION LAYER]     ← new: rendered by ConstitutionService (built-in rules + .pmp/constitution.md)
[GOAL LAYER]             ← unchanged
[SPEC LAYER]             ← new: requirements + ACs in scope, with IDs and priorities
[WORKSPACE LAYER]        ← unchanged content, now trimmed by PromptBudgeter
[KNOWLEDGE LAYER]        ← unchanged
[TASK CONTEXT LAYER]     ← unchanged
[INSTRUCTION LAYER]      ← schema updated (reqRefs)
```

`ConstitutionService` renders the constitution as a compact rule list (not the full prose), with a hard cap (default 1,200 tokens) so it cannot crowd out task context. The project constitution can only **add** rules; it cannot remove built-in red lines (I9).

**[draft3] I9 is enforced, not asserted.** `.pmp/constitution.md` is workspace content and therefore untrusted (§3.5). `ConstitutionService` runs a **validator** that rejects a project constitution attempting to countermand a built-in red line, and reports the rejection to the user rather than failing silently (P5-S17).

**[draft3] Untrusted layers are delimited and labelled.** The SPEC layer carries requirement text authored by anyone with commit or PR access; the CONSTITUTION layer carries a workspace file; requirements imported from a tracker (§9.4) carry remote text. Each is wrapped in an explicit untrusted-content delimiter and labelled as data to be *described*, never instructions to follow. Per I13, no content in these layers may alter gate state, consent state, or tool-confirmation behaviour — gates are evaluated in code from parsed state, never from model output.

**[draft3] Masking stays downstream of trimming.** `maskPromptText` runs in `AIService.generateText`, after prompt assembly, so every provider inherits it. When `PromptBudgeter` (§8.5) begins trimming layers it must run **before** masking, or a trim can reintroduce unmasked content into the final string.

### 5.6 Lifecycle and Gates

```
draft ──clarify──► clarifying ──all resolved──► draft ──approve──► approved
approved ──first task in-progress──► implementing ──all ACs verified──► verified
any ──supersede──► superseded
```

New block reason `spec-gate` in `getTaskBlockReason`: an implementation task whose `specRef` is a spec in `draft`/`clarifying` status is blocked when `planmyproject.spec.gate` is `"block"` (default `"warn"`, which only decorates the tree and queue). Tasks without `specRef` are never spec-gated, so existing v2 plans keep working (I3, I4).

### 5.7 UI

- **Specs view** (new tree in the PlanMyProject container): spec → requirements → ACs; badges for status, open clarifications, coverage percentage; context menu with Clarify, Approve, Plan From Spec, Analyze, Sync.
- **Spec CodeLens** on `specs/**/spec.md`: on the title line `Clarify | Approve | Plan | Analyze`; on each requirement line `Plan (n tasks) | Trace | Debate`; on each AC line `Link test | Verify`.
- **Spec Review panel** (WebView, reusing the debate panel's styling): clarification list with inline answers, coverage table, approve button.
- **Tree decorations**: task description gains the spec ref (`T0012 • implementation • AI • S0001/R0003`).
- **Diagnostics**: unresolved clarification markers and `must` requirements without ACs appear in the Problems panel with the spec file as source.

### 5.8 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P5-S0** | **[draft2]** Extract `@planmyproject/core` (§4.4): move the 28 `vscode`-free modules behind a package boundary, add a lint rule failing any `vscode` import inside it, keep the extension importing it directly for now | `core/`, `src/`, `tsconfig.json`, `.eslintrc` | M | P0 |
| **P5-S1** | Define spec model types and ID generators (`S`, `R`, `AC`, `C`) | `src/model/SpecModel.ts`, `src/util/IdGenerator.ts` | S | S0 |
| **P5-S2** | `SpecParser` round-trip (parse/serialize spec.md, markers, hashes) with tests mirroring `parser.test.ts` | `src/spec/SpecParser.ts`, `test/spec-parser.test.ts` | L | S1 |
| **P5-S3** | `SpecService`: discover `specs/**/spec.md`, load/save, lifecycle transitions, file watcher | `src/spec/SpecService.ts`, `src/storage/WorkspaceFiles.ts` | M | S2 |
| **P5-S4** | `ConstitutionService`: template, load, render prompt layer with cap, validation that built-in red lines are intact | `src/constitution/`, `src/ai/PromptBuilder.ts` | M | — |
| **P5-S5** | `SpecGenerator` + `SpecDraft` schema in `ResponseParser`; `Specify Feature` command | `src/spec/SpecGenerator.ts`, `src/ai/ResponseParser.ts`, `src/controller/SpecCommandService.ts` | L | S3, S4 |
| **P5-S6** | `Clarify Spec` command (QuickPick path) and marker resolution | `SpecCommandService.ts`, `DebateService.ts` | M | S5 |
| **P5-S7** | `Approve Spec`, `Supersede Spec`, `spec-gate` block reason, setting `spec.gate` | `PlanModel.ts`, `QueueBuilder.ts`, `TaskCommandService.ts` | M | S3 |
| **P5-S8** | Task model extensions (`specRef`, `reqRefs`, `acRefs`, `reqHashes`, ...) + plan parser serialization + v2→v3 upgrader | `TaskNode.ts`, `PlanParser.ts`, `SchemaUpgrader.ts`, tests | L | S1 |
| **P5-S9** | `Plan From Spec`; `Plan Task` prompt SPEC LAYER; `reqRefs` validation replacing `goalCriterionIndex` | `TaskGenerator.ts`, `PromptBuilder.ts`, `ResponseParser.ts` | M | S8 |
| **P5-S10** | Specs tree view + context menus + tree decorations | `src/ui/SpecTreeProvider.ts`, `package.json` | M | S3 |
| **P5-S11** | Spec CodeLens provider | `src/native/SpecCodeLensProvider.ts` | S | S3 |
| **P5-S12** | Spec Review WebView (clarifications, coverage, approve) | `src/spec/SpecReviewPanel.ts`, `webviews/spec-review/` | M | S6, S7 |
| **P5-S13** | Spec diagnostics (open markers, must-without-AC) | `src/trace/DriftDiagnostics.ts` (shared with P6) | S | S3 |
| **P5-S14** | Onboarding wizard finish (P4-F1) extended with option D "Start from a spec" | `PlanController.ts` | S | S5 |
| **P5-S15** | Feature checklist entries + integration test: specify → clarify → approve → plan-from-spec → serialize → reparse | `test/integration/spec-flow.test.ts`, `FEATURE_CHECKLIST.json` | M | S9 |
| **P5-S16** | **[draft2]** Spec round-trip fidelity test covering every `SpecDocument`, `Requirement`, `AcceptanceCriterion`, and `Clarification` field (I10), plus the new `TaskNode` fields from S8 | `test/spec-fidelity.test.ts` | S | S2, S8 |
| **P5-S17** | **[draft3]** Constitution validator enforcing I9 (reject a project constitution countermanding a built-in red line, report it to the user); untrusted-layer delimiting and labelling in `PromptBuilder` for the SPEC, CONSTITUTION, and imported-requirements layers (I13) | `ConstitutionService.ts`, `PromptBuilder.ts`, `test/constitution.test.ts` | M | S4 |

---

## 6. Workstream B — Traceability and Drift (Goal 4)

### 6.1 Trace Model

```typescript
export type TraceLinkKind =
  | "req→task" | "ac→task" | "task→file" | "task→symbol" | "task→test" | "ac→test" | "task→external";

export interface TraceLink {
  kind: TraceLinkKind;
  from: string;                 // R0001, AC0002, T0012
  to: string;                   // T0012, src/pdf/render.ts, src/pdf/render.ts#renderInvoice, PROJ-123
  origin: "manual" | "ai-generated" | "inferred" | "sync";
  confidence: number | null;    // for inferred links
  recordedAt: string;
  recordedRev: string | null;   // git short SHA
}
```

Links are **not** stored in a separate graph file. They are derived from task metadata (`reqRefs`, `acRefs`, `linkedFiles`, `linkedSymbols`, `linkedTests`, `externalRefs`) and spec metadata (`acRefs`, `linkedTests`) so that the markdown files remain the source of truth and git history shows link changes. `TraceService` builds the graph in memory and caches it in `.pmp/trace-cache.json` keyed by plan and spec content hashes.

### 6.2 Drift Taxonomy

| Code | Name | Detection | Severity | Suggested remedy |
|---|---|---|---|---|
| **D1** | Stale spec | `task.reqHashes[R] !== requirement.hash` | Warning (Error if task done) | Re-plan task, or accept new text (`Refresh Spec Links`) |
| **D2** | Missing link target | `linkedFiles` path absent; `linkedSymbols` symbol not found by scanner or DocumentSymbolProvider; `linkedTests` file/test absent | Warning | Relink, or remove link |
| **D3** | Code changed after done | `git diff --name-only completedRev..HEAD -- linkedFiles` non-empty (fallback: file hash recorded in trace cache differs) | Information (Warning if spec is `verified`) | Re-verify task |
| **D4** | Requirement uncovered | `must`/`should` requirement in approved spec has no task via `reqRefs` | Error for `must`, Warning for `should` | Plan From Spec |
| **D5** | AC unverified | AC with `verification=test` has no `linkedTests`, or linked test missing | Warning | Link test / add test task |
| **D6** | Orphan task | Implementation task with `specRef` but empty `reqRefs`, or `reqRefs` pointing to a superseded spec | Warning | Assign requirement |
| **D7** | Unplanned change | Files changed in `git diff <base>..HEAD` (base = merge-base with default branch, or last verify) that are not linked from any in-progress/done task and are not ignored by `.pmpignore` | Information | Create `code-inferred` task (P4-B2) or mark as chore |
| **D8** | Status mismatch | Task `done` but D2 on all links; task `todo` but all linked symbols now exist and files changed since creation (generalized P4-B1) | Warning | Propose status change |
| **D9** | Constitution conflict | Dependency added that appears in goal/spec `constraints`/`outOfScope` deny-list; file writes outside spec-declared areas | Warning | Review |
| **D10** | External status mismatch | `externalRefs` remote status maps to a different local status | Information | Sync |
| **D11** | Blocked-but-implemented | Task blocked by research/debate/spec gate yet has D3-style changes in linked files | Warning | Resolve gate |

Each detector is a pure function `(input: DriftInput) => DriftFinding[]` for testability. `DriftInput` bundles plan, specs, scan, git facts, and the trace cache.

### 6.3 Fingerprints and Git Integration

- **Requirement hash**: 12-hex sha256 of normalized text, stored on the requirement and copied into `task.reqHashes` at planning time.
- **Spec content hash**: combined hash, frozen at approval; a change to an approved spec re-opens it to `draft` unless the user chooses "Amend" (records an amendment note and keeps status, but all D1 findings are raised).
- **Completion revision**: `task.completedRev` = short HEAD SHA recorded by `markTaskStatus` when the Git extension is available; `null` otherwise.
- **File hashes**: recorded in `.pmp/trace-cache.json` (local) for `linkedFiles` at completion time as the no-git fallback for D3.
- **`GitFacade`** wraps `vscode.extensions.getExtension("vscode.git")?.exports.getAPI(1)`: `head()`, `userName()`, `changedFilesSince(rev, paths)`, `mergeBaseWithDefault()`, `onDidChangeState` (throttled). Every method degrades to `undefined` when the Git extension is absent so the extension still works in non-git folders.

### 6.4 Drift Engine

The drift engine is the feature most likely to make v3 feel slow, because unlike planning and implementation it runs **without the user asking**. Draft 1 specified a full recompute per trigger and deferred incremental mode to P10. **[draft2]** That is inverted below: incremental is the initial design, and the engine runs off the extension host.

**Triggers** (each debounced 750 ms, coalesced):

1. Spec file saved (D1, D4, D5, D6) — affected spec's subgraph only.
2. Plan file saved or persisted (all) — changed tasks' subgraph only.
3. Git state change: HEAD moved, index changed (D3, D8, D11) — throttled to at most once per 10 s.
4. Manual `Verify Task` / `Verify Spec` / `Analyze Spec` — the only full sweep, plus D7.
5. Before `Implement Task` (D1 and D6 for that task; a D1 finding blocks when `drift.gate = "block"`).

**[draft2]** VS Code's Git extension refreshes repository state on file saves, branch operations, and its own polling. A 10-second throttle therefore means **up to six runs per minute**, none user-initiated. A full sweep costs a projected 0.5–3 s. Trigger 3 must never run a full sweep.

**Algorithm — incremental by default:**

1. Maintain a **dirty set** of spec IDs, task IDs, and changed file paths, accumulated from watcher and git events.
2. Resolve the affected subgraph through `TraceService` (a requirement's tasks, a task's requirements, files' owning tasks).
3. Run only the detectors whose inputs intersect the dirty set, over only that subgraph.
4. Merge new findings with retained findings for untouched nodes; recompute scores from the merged set.
5. Publish **only changed URIs** into the `DiagnosticCollection`; fire **scoped** tree elements, not `undefined`.
6. Persist the report to `.pmp/trace-cache.json`.

A full sweep runs on explicit `Run Drift Check`, on `Analyze Spec`, and once after trace-cache invalidation. Budget: incremental < 100 ms, full sweep < 2 s off the extension host (§4.5).

#### Projected cost per detector [draft2]

For a 500-task plan, 20 specs, 2 linked files per task, on a full sweep:

| Detector | Work per run | Projected | Risk |
|---|---|---:|---|
| D1 stale spec | Hash compare over `reqHashes` | 2–10 ms | Low |
| **D2 missing link target** | **`stat` per linked file — ~1,000 RPC round trips** | **200 ms–1 s** | **High** |
| D3 code changed after done | Git diff or file-hash compare per done task | 50–500 ms | High |
| D4 requirement uncovered | Graph traversal | 5–20 ms | Low |
| D5 AC unverified | Test file existence — more `stat` calls | 50–200 ms | Medium |
| D6 orphan task | In-memory check | 2 ms | Low |
| **D7 unplanned change** | **Merge-base + diff against default branch — git process spawns** | **50–800 ms** | **High** |
| D8 status mismatch | Reuses D2/D3 results | — | Medium |
| D9 constitution conflict | String matching over constraints | 5–20 ms | Low |
| D10 external status | Cached sync state only, no network | 2 ms | Low |
| D11 blocked but implemented | Reuses D3 | — | Low |
| **Full sweep** | | **0.5–3 s** | |

#### Three hard constraints [draft2]

**Never bulk-invoke the document symbol provider.** §6.2 defines D2 as including "symbol not found by scanner or document symbols". Resolving symbols via `vscode.executeDocumentSymbolProvider` activates the language server per file — 100 ms to 2 s on a cold TypeScript file. Across a few hundred linked symbols that is minutes of stalling plus language-server thrash. **Symbol checks resolve from the scanner's already-cached signatures.** The document symbol provider is used only on demand, for one task, when the user explicitly asks.

**No per-run `stat` storms.** D2 and D5 together issue on the order of 1,500 `stat` calls per full sweep through `vscode.workspace.fs`, each an RPC round trip on a channel shared with every other extension. These are answered from a **file-existence cache invalidated by the file watcher**, turning per-run O(links) RPC into O(changed files) watcher events (**P6-T15**).

**D7 is manual-only by default.** On a real branch, most of the diff is unplanned by this definition. Problems-panel entries compete with compiler errors — the panel users rely on to find real defects. D7 runs on explicit Verify/Analyze, and surfaces in the Drift view rather than Problems. This supersedes R4's milder mitigation.

#### Write-origin guards [draft2]

v2 suppresses its own file-watcher feedback with a single `isSelfWriting` boolean. v3 adds a second loop: plan write → git status refresh → drift trigger → findings → diagnostics → possible auto-fix → plan write. A single boolean will not compose across three subsystems that write files. Thread an explicit **write-origin token** through persist, drift, and sync paths, and have each watcher ignore events carrying its own token (**P6-T16**).

**Scoring**: `driftScore = Σ weight(severity) × count` normalized to 0–100 per spec; weights Error 10, Warning 3, Information 1. Shown as a badge on the Specs view and the status bar. Setting `drift.warnThreshold` (default 30) turns the status bar item warning-colored.

**Outputs**:

- `DiagnosticCollection("planmyproject")`: one diagnostic per finding, anchored to the task line in `planmyproject.md`, the requirement line in the spec file, or the first line of a source file for D7. Diagnostic `code` is the drift code; `relatedInformation` links the other end of the trace.
- Quick fixes (`CodeActionProvider` on plan and spec files): "Refresh spec links", "Remove missing link", "Propose status: done", "Create task for unplanned change", "Open in tracker".
- Markdown report (`Analyze`): coverage matrix (requirement × tasks × tests) written to the output channel and optionally to `specs/SNNNN/analysis.md`.

### 6.5 Verify Command and Status Proposals

```typescript
export interface TaskVerification {
  state: "unverified" | "verified" | "failed" | "stale";
  verifiedAt: string | null;
  verifiedRev: string | null;
  evidence: VerificationEvidence[];
}

export interface VerificationEvidence {
  kind: "links-present" | "tests-present" | "tests-passed" | "manual" | "metric";
  detail: string;
  at: string;
}
```

`Verify Task` runs D1/D2/D3/D5 for the task, then (with confirmation, setting `verify.runTests`) executes the workspace test task through `vscode.tasks.executeTask` if a task named by `verify.testTaskName` exists, records evidence, and sets `verification.state`.

> **[draft3] This is command execution from repository content, and it is constrained accordingly.** `tasks.json` is workspace content and can run any command. Draft 2 offered a `"always"` mode that skipped confirmation, while §3.4 simultaneously promised the task would run "only with confirmation" — the specification contradicted itself. Resolution:
>
> - `verify.runTests` is **`"never" | "ask"`**, default `"ask"`. The `"always"` value is removed.
> - The confirmation displays the **resolved command line**, not the task label. "Run task `test`?" tells the user nothing; `Run: curl https://… | sh` tells them everything.
> - `verify.runTests` and `verify.testTaskName` are machine-scoped (§12.4), so a repository cannot configure its own command to run.
> - Approval is keyed to a hash of the task definition and re-requested when it changes, so a repository cannot get approval for a benign command and later swap it. `Verify Spec` runs it for all tasks of the spec and moves the spec to `verified` when every `must` AC has passing evidence. This is the "verification before completion" rule made concrete: marking a task done from the UI offers "Mark done and verify" as the default action.

Status proposals (D8) never change status silently; they show a notification with "Apply" and are batched per run (same pattern as P2-B7).

### 6.6 UI

- **Drift view** (tree): grouped by spec, then by drift code; each finding opens its anchor; toolbar: Run Drift Check, Clear, Export Report.
- **Problems panel**: via diagnostics (above).
- **Status bar**: `⚠ Drift 42` next to the existing scan status; click opens the Drift view.
- **Tree badges**: `TreeView.badge` on the Implementation Tree shows the count of Error findings.
- **Source CodeLens** (opt-in `trace.sourceCodeLens`): above symbols linked from tasks, `PMP: T0012 (R0001) — verified 3 days ago`; click opens the task.

### 6.7 Settings

| Setting | Default | Description |
|---|---|---|
| `planmyproject.drift.autoCheck` | `true` | Run detectors on spec/plan save and git changes |
| `planmyproject.drift.gate` | `"warn"` | `"off"` / `"warn"` / `"block"`: effect of D1 on Implement |
| `planmyproject.drift.warnThreshold` | `30` | Score above which the status bar warns |
| `planmyproject.drift.unplannedChangeIgnore` | `["docs/**","*.md"]` | Globs excluded from D7 |
| `planmyproject.drift.unplannedChangeMode` | `"manual"` | **[draft2]** `"manual"` / `"auto"`: whether D7 runs on automatic triggers or only on Verify/Analyze |
| `planmyproject.drift.incremental` | `true` | **[draft2]** Dirty-set subgraph analysis; `false` forces full sweeps (diagnostic use only) |
| `planmyproject.trace.sourceCodeLens` | `false` | Show trace lenses in source files |
| `planmyproject.verify.runTests` | `"ask"` | `"never"` / `"ask"` / `"always"` |
| `planmyproject.verify.testTaskName` | `"test"` | Name of the VS Code task to run |

### 6.8 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P6-T1** | Trace types, `TraceService` graph build from plan + specs, trace cache, **dirty-set subgraph resolution** | `src/trace/TraceModel.ts`, `TraceService.ts` | M | P5-S8 |
| **P6-T2** | Link validation at materialization (F7): drop or tag nonexistent `linkedFiles`, resolve symbols via scanner signatures. **[draft3]** Validation covers **sensitivity as well as existence** — an AI-proposed link to a secret-bearing path is refused, not merely tagged (I15) | `TaskGenerator.ts`, `TraceService.ts` | S | T1 |
| **P6-T3** | `GitFacade` with graceful degradation; record `completedRev` in `markTaskStatus` | `src/trace/GitFacade.ts`, `PlanModel.ts` | M | — |
| **P6-T4** | Detectors D1, D2, D4, D5, D6 (spec/plan only, no git) with unit tests per detector | `src/trace/DriftEngine.ts`, `test/drift.test.ts` | L | T1 |
| **P6-T5** | Detectors D3, D7, D8, D11 (git-aware) + file-hash fallback | `DriftEngine.ts`, `GitFacade.ts` | L | T3, T4 |
| **P6-T6** | Detector D9 (constitution/constraints) | `DriftEngine.ts`, `ConstitutionService.ts` | S | P5-S4 |
| **P6-T7** | `DriftDiagnostics` publisher + `CodeActionProvider` quick fixes | `src/trace/DriftDiagnostics.ts`, `src/native/DriftCodeActions.ts` | M | T4 |
| **P6-T8** | Triggers, debouncing, **incremental dirty-set scheduling**, scoring, status bar, tree badge | `DriftEngine.ts`, `PlanController.ts`, `StatusBarItem.ts` | M | T5, T7 |
| **P6-T9** | Drift tree view + Export Report | `src/ui/DriftTreeProvider.ts` | M | T8 |
| **P6-T10** | `Verify Task` / `Verify Spec`, `TaskVerification` model + serialization, optional test-task execution, "Mark done and verify" | `TaskCommandService.ts`, `TaskNode.ts`, `PlanParser.ts` | L | T5 |
| **P6-T11** | `Analyze Spec` report (coverage matrix) | `SpecCommandService.ts` | S | T4 |
| **P6-T12** | Pre-implement drift gate (`drift.gate`) in `getTaskBlockReason` | `PlanModel.ts`, `QueueBuilder.ts` | S | T4 |
| **P6-T13** | Source CodeLens (opt-in) | `src/native/SourceCodeLensProvider.ts` | M | T1 |
| **P6-T14** | Integration tests: spec edit → D1; file delete → D2; done task + git change → D3; plan-from-spec → D4 clears | `test/integration/drift-flow.test.ts` | M | T10 |
| **P6-T15** | **[draft2]** File-existence cache invalidated by the file watcher, replacing per-run `stat` calls in D2/D5; scanner-signature symbol resolution with no bulk `executeDocumentSymbolProvider` | `TraceService.ts`, `DriftEngine.ts`, `ScanService.ts` | M | T1 |
| **P6-T16** | **[draft2]** Write-origin tokens replacing `isSelfWriting`, covering persist, drift auto-fix, and sync writes | `PlanController.ts`, `SpecService.ts`, `SyncService.ts` | S | T8 |
| **P6-T17** | **[draft2]** Stand up the LSP server (§4.4): `vscode-languageclient` / `vscode-languageserver`, move parse, trace graph, detectors, diagnostics, hover, definition, links, and CodeLens into it; incremental document sync, cancellation, progress | `server/`, `src/native/`, `package.json` | L | T1, T4, P5-S0 |
| **P6-T18** | **[draft2]** Drift benchmarks against the §4.5 budgets: incremental < 100 ms, full sweep < 2 s, no extension-host block > 100 ms | `test/bench/drift.bench.ts` | S | T17 |
| **P6-T19** | **[draft3]** Sensitivity enforcement across the trace path: refuse secret-bearing links at materialization and before egress, in the shared handlers so every caller inherits it (I14, I15) | `TaskGenerator.ts`, `TraceService.ts`, `ToolHandlers.ts` | S | T2 |
| **P6-T20** | **[draft3]** `verify.runTests` hardening: remove `"always"`, resolved-command confirmation, re-confirm on task-definition change, machine-scoped settings | `TaskCommandService.ts`, `package.json` | S | T10 |

---

## 7. Workstream C — Native-First VS Code Surfaces (Goal 1)

### 7.1 Chat Participant `@pmp`

Registered through `contributes.chatParticipants` and `vscode.chat.createChatParticipant("planmyproject.pmp", handler)`.

| Slash command | Maps to | Streams |
|---|---|---|
| `/specify <idea>` | Specify Feature | Spec draft as markdown, then "Save as S000N?" button |
| `/clarify [S0001]` | Clarify Spec | One clarification at a time; user answers in chat |
| `/plan [T0005 or R0002]` | Plan Task / Plan From Spec | Draft tasks with confidence; "Commit" button |
| `/tasks [S0001]` | Read-only | Ready / blocked / research lists (the execution queue) |
| `/analyze [S0001]` | Analyze Spec | Coverage matrix |
| `/implement T0012` | Implement With Agent (§7.3) | Streams the agent's progress |
| `/verify T0012` | Verify Task | Findings and evidence |
| `/status` | Read-only | Plan summary, drift score, session cost |
| `/cost [today\|session\|S0001]` | Usage rollup | Table |
| `/debate T0012` | Debate Task | Opens the debate panel and mirrors the opening in chat |

Rules:

- The handler routes through the **same services** as the commands (I7), so consent, masking, gates, and ledger apply. When the selected provider is Copilot, the chat request's own model (`request.model`) is used for that turn; otherwise `AIService` is used and the result is streamed into the chat response.
- Every response ends with follow-up suggestions (`ChatFollowupProvider`) that point at the next lifecycle stage.
- Chat references (`#file`, `#selection`) are accepted and treated as linked files under the task's file-send policy.
- Chat history is not persisted by PMP; durable state stays in markdown.

### 7.2 Agent Tools — MCP Server With a VS Code Shim [draft2]

Draft 1 specified nine Language Model Tools registered through `vscode.lm.registerTool`. Those are VS Code-specific and reachable only from Copilot agent mode. **The same nine handlers exposed as an MCP server work in Claude Code, Claude Desktop, Cursor, Windsurf, JetBrains, and VS Code**, which supports MCP directly — the implementation is substantially the same code over a different transport.

**Decision: build the MCP server first over `@planmyproject/core` (§4.4), and make the VS Code Language Model Tools a thin shim over the same handlers.** Strictly more reach for comparable effort, and it removes the dependency on the agent-mode APIs that risk **R3** already flags as unstable. This replaces `P7-N3`/`P7-N4` rather than adding to them.

It also reframes G1. "Native first" currently means native to VS Code. Native to the *agent* may serve users better, since the agent is increasingly where implementation happens.

One handler set, three call paths — all routed through the same services, so consent, masking, gates, and the ledger apply identically (I5, I7):

```
handlers (core + host adapter)
  ├─ MCP server      → any MCP-capable agent
  ├─ vscode.lm.registerTool shim → Copilot agent mode
  └─ CLI (§4.4)      → scripting and CI
```

| Tool name | Input | Output | Side effects / gates |
|---|---|---|---|
| `pmp_getSpec` | `{ specId }` | Spec markdown + requirement list | None |
| `pmp_getTask` | `{ taskId }` | Task, ancestors, requirements, ACs, research conclusions, linked files | None |
| `pmp_listReadyTasks` | `{ specId? }` | Execution queue sections | None |
| `pmp_recordTrace` | `{ taskId, files[], symbols[], tests[] }` | Updated links | Validates paths (PathSafety); persists plan |
| `pmp_setTaskStatus` | `{ taskId, status, evidence? }` | Result | Refuses `done` when gates block; runs D1/D2 first; persists |
| `pmp_recordDecision` | `{ taskId, conclusion }` | Index entry | Same as Mark Research Complete |
| `pmp_addTask` | `{ parentId, title, type, reqRefs }` | New task | Same validation as Add Task |
| `pmp_getDrift` | `{ specId?, taskId? }` | Findings | None |
| `pmp_getConstitution` | `{}` | Rendered rules | None |

Every mutating tool requires confirmation — `prepareInvocation` in the VS Code shim, an equivalent confirmation prompt over MCP — unless `planmyproject.tools.autoConfirm` is `true`; every invocation is written to the ledger with `operation: "tool:<name>"` regardless of transport.

#### [draft3] MCP hardening

The MCP server widens the trust boundary, and this is the cost of the D-11 decision. VS Code Language Model Tools are reachable only from Copilot agent mode, inside the editor, under VS Code's confirmation UX. **An MCP server is reachable by any MCP client on the machine**, including agents the user never intended to grant plan and workspace access to. Four constraints follow:

- **Stdio transport only.** No network listener and no port in 3.0. A socket transport would need its own decision record and an authentication model.
- **Enforcement lives in the shared handlers** (I14). `PathSafetyChecker`, sensitivity refusal (I15), masking, and consent are applied in `ToolHandlers`, not in the VS Code adapter — otherwise the MCP and CLI paths bypass every one of them. The core may normalise paths but holds no write capability at all (§4.4).
- **Confirmation a workspace cannot defeat.** `tools.autoConfirm` is machine-scoped (§12.4, I12). Mutating tools invoked over MCP confirm through the editor when it is running.
- **The ledger records transport and calling client**, so the trail distinguishes "Copilot agent mode did this" from "another MCP client did this" (§8.2).

### 7.3 Implement With Agent (Hand-off Mode)

The classic implement path (single JSON response with full-file writes) stays as `Implement Task`. The new `Implement With Agent` command:

1. Runs gates (research, debate, spec, drift, budget).
2. Builds a hand-off prompt: constitution summary, task, requirements and ACs, research conclusions, linked files, and the instruction to use `pmp_recordTrace` and `pmp_setTaskStatus` when done.
3. Opens Copilot Chat in agent mode with the prompt pre-filled (`workbench.action.chat.open` with `query` and mode arguments) and the PMP tools referenced.
4. Marks the task `in-progress` and starts a file watcher on the workspace; changed files not yet linked are proposed as links when the task is set done through the tool (closing the trace loop even if the agent forgets to call `pmp_recordTrace`).

When the provider is Claude or OpenAI (no VS Code agent mode), the command falls back to the classic path and says so.

> **[draft3] Hand-off mode writes outside PMP's path-safety enforcement.** In step 3 the agent — not PMP — writes the files. `PathSafetyChecker`, the sensitive-file refusal (I15), and the "overwrite complete file" confirmation do not apply, because PMP is not the writer. The constitution's "No codebase writes without task scope" red line is therefore **structurally unenforceable** in this mode, and the spec says so rather than implying the gate still holds.
>
> What PMP can still do, and does: run every gate before hand-off (step 1), scope the prompt to the task's linked files, watch the workspace and surface files the agent touched outside the expected set (step 4), and record provenance for whatever was written (§8.2, P8-C11). Users choosing hand-off mode accept the host agent's safety model in place of PMP's; the command's first-run notice states this plainly.

### 7.4 Editor Integration

- **CodeLens** on plan file (existing), spec files (§5.7), and source files (§6.6). **[draft2]** `provideCodeLenses` currently re-parses the entire document on every call (F4), and v3 adds hover, definition, and document-link providers over the same files — hovers fire on mouse movement. **All four providers share one parsed-document cache keyed by `document.version`** (P7-N4). At 4 lenses per line and 1,000 tasks the provider returns 4,000 objects, so lens construction stays allocation-cheap; budget < 20 ms (§4.5).
- **Document links**: `[T0012]`, `[R0001]`, `[S0001]`, `[AC0002]`, and `PROJ-123` in plan and spec files become clickable (`DocumentLinkProvider`).
- **Hovers**: hovering an ID shows title, status, spec, drift state (`HoverProvider`).
- **Go to definition** for IDs across plan and spec files (`DefinitionProvider`).
- **Diagnostics** and **quick fixes** (§6.4).
- **Snippets**: `pmp-req`, `pmp-ac`, `pmp-task` for hand-authoring.

### 7.5 Views and Walkthrough

- Views in the existing container: `Implementation Tree` (existing), `Specs`, `Drift`, `Usage`.
- `contributes.walkthroughs`: "Spec-driven development with PlanMyProject" — steps: set constitution, specify, clarify, approve, plan, implement with agent, verify, sync. Each step runs the real command.
- `viewsWelcome` updated: empty Specs view offers "Specify a feature".

### 7.6 Git Integration

- `GitFacade` (§6.3) also replaces `getGitUserName` (F1).
- Source Control: no custom SCM provider. PMP contributes a `scm/title` menu item "Verify tasks touched by this change" that runs D7/D8 against the working tree.
- Branch awareness: `planmyproject.git.branchTaskPrefix` (default `""`); when set, a task's `in-progress` transition offers "Create branch `feat/T0012-slug`".

### 7.7 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P7-N1** | `ChatParticipant` skeleton, `/status`, `/tasks`, `/cost`, follow-ups; `package.json` contribution | `src/native/ChatParticipant.ts`, `package.json` | M | P8-C3 (for /cost) |
| **P7-N2** | `/specify`, `/clarify`, `/plan`, `/analyze`, `/verify`, `/debate` routed through services with streaming | `ChatParticipant.ts` | L | P5-S6, P6-T10 |
| **P7-N3** | **[draft2, replaces LM-tools-first]** MCP server over `@planmyproject/core`: the nine handlers, schemas, stdio transport, read-only tools first | `mcp/`, `src/native/ToolHandlers.ts` | M | P6-T1, P5-S0 |
| **P7-N4** | **[draft2]** Mutating handlers with confirmation and ledger; `vscode.lm.registerTool` shim over the same handlers; shared parsed-document cache keyed by `document.version` for CodeLens, hover, definition, and links (F4) | `ToolHandlers.ts`, `src/native/LmTools.ts`, `CodeLensProvider.ts` | M | N3 |
| **P7-N5** | `Implement With Agent` hand-off + watcher-based link proposal | `TaskCommandService.ts` | L | N4 |
| **P7-N6** | `GitFacade` user name (fix F1) and branch offer | `GitFacade.ts`, `WorkspaceFiles.ts` | S | P6-T3 |
| **P7-N7** | Document links, hovers, definitions for IDs | `src/native/IdLanguageFeatures.ts` | M | P5-S3 |
| **P7-N8** | Walkthrough + updated welcome views + snippets | `package.json`, `media/walkthrough/` | S | N2 |
| **P7-N9** | Tests: chat handler unit tests with a fake `ChatResponseStream`; tool input validation tests | `test/chat-participant.test.ts`, `test/lm-tools.test.ts`, `test/shims/vscode.js` | M | N2, N4 |
| **P7-N10** | **[draft3]** MCP hardening: stdio-only transport, enforcement in shared handlers (I14), confirmation a workspace cannot defeat, transport and client recorded in the ledger. One security test suite run against **both** transports | `mcp/`, `ToolHandlers.ts`, `test/security.test.ts` | M | N3 |

---

## 8. Workstream D — Token Usage and Cost Monitoring (Goal 5)

### 8.1 Usage Capture Per Provider

`AITextResponse` gains:

```typescript
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  estimated: boolean;            // true when counted client-side rather than reported by the API
  requests: number;              // 1 normally; >1 when a repair round-trip occurred
}
export interface AITextResponse {
  text: string;
  provider: string;
  model?: string;
  usage?: AIUsage;
  latencyMs?: number;
}
```

| Provider | Input tokens | Output tokens | Notes |
|---|---|---|---|
| Copilot (`vscode.lm`) | `model.countTokens(prompt)` before send | `model.countTokens(text)` after stream | `estimated: true`. The LM API does not expose billing; cost is shown as "included in subscription", request count is tracked because some Copilot plans meter premium requests. Model ID from `model.id`. |
| Claude | `usage.input_tokens` (+ cache fields) from `message_start` when streaming, or from the response body | `usage.output_tokens` from `message_delta` | Provider switches to SSE streaming (P8-C1). `POST /v1/messages/count_tokens` is used for pre-flight when `cost.preflightMode = "exact"`. |
| OpenAI | `usage.input_tokens` (Responses API) / `usage.prompt_tokens` (Chat Completions) | `usage.output_tokens` / `usage.completion_tokens` | Streaming with `stream_options.include_usage` for the fallback path. |

### 8.2 Ledger

`.pmp/usage.jsonl`, one JSON object per line, append-only, local by default (`cost.ledgerInGit = false` adds it to the `.gitignore` suggestion alongside the scan cache):

```json
{"ts":"2026-09-17T10:22:31Z","op":"planTask","taskId":"T0012","specId":"S0001","provider":"claude","model":"claude-opus-5","in":3814,"out":912,"cacheRead":0,"cacheWrite":0,"estimated":false,"costUsd":0.0419,"ms":8420,"outcome":"success","requests":1,"promptChars":15102,"truncated":["workspace:modules>12"]}
```

`op` values: `planTask`, `implementTask`, `implementAgentHandoff`, `debateOpen`, `debateTurn`, `debateSplit`, `debateRationale`, `specify`, `clarify`, `planFromSpec`, `chat:<slash>`, `tool:<name>`, `preflight`. **[draft3]** Tool entries also record `transport` (`lm` or `mcp`) and the calling client (§7.2).

#### [draft3] It is a usage ledger, not an audit log

Draft 2 stated that this file "is the audit log" (§10.3), and `constitution.md` §11 promises an append-only `.pmp/ai-audit.jsonl`. Neither claim holds: this is a plain JSONL file, user-writable, user-deletable, unsigned, with no sequence numbers and no integrity check. Anyone who can edit the workspace can rewrite it silently.

For 3.0 the honest resolution is to **drop the audit framing** rather than build integrity protection (decision D-14). The file is the *usage ledger*. `View AI Audit Log` becomes `View AI Activity Log` and its output says what the data is and is not. `constitution.md` §11 is corrected in P10-H3.

It also holds **personal data** — per-developer spend, timestamps, and operation patterns. `cost.ledgerInGit = true` would commit employee activity data to a shared repository, which is works-council and GDPR-sensitive in the EU. The local default (D-7) stands, and the setting description says why.

#### [draft3] Provenance of AI-generated code

`origin: "ai-generated"` on a `TaskNode` is currently the **only** record distinguishing AI-produced work from human work, and the P0 parser defect destroys it on every save (§2.6). Nothing records which model wrote which *file*.

That matters for evidencing a provider indemnity claim, answering a customer's AI-disclosure question, meeting an open-source project's disclosure policy, and scoping an incident if a model is later found to have reproduced licensed code. v3 already collects both halves — the ledger has model, provider and timestamp; §6.1 trace links have task → file — so joining them is cheap:

```json
{"ts":"2026-09-21T10:22:31Z","op":"implementTask","taskId":"T0042","specId":"S0001",
 "provider":"claude","model":"claude-opus-5","files":["src/pdf/render.ts","test/pdf.test.ts"],
 "promptHash":"a1b2c3d4e5f6","origin":"ai-generated","accepted":true}
```

A provenance record is written on every accepted `Implement Task` and on hand-off completion (§7.3, where the watcher already identifies changed files). `Export Provenance Report` produces a file-level manifest suitable for attaching to a deliverable or a disclosure (P8-C11). Because provenance depends on `origin` surviving a write, I10 covers it — this is a legal requirement, not a cosmetic field.

Rollups (`UsageLedger.rollup({ by: "session" | "day" | "task" | "spec" | "provider" })`) are computed on read and cached in memory.

**[draft2] Rotation is required, not optional.** At ~300 bytes per entry and 50 calls a day the raw log grows ~15 KB/day: 0.5 MB and ~5 ms to parse after a month, 5.5 MB and ~50 ms after a year, 16 MB and ~150 ms after three. The status bar shows a session cost that needs a rollup, so a rollup recomputed from the whole file on every AI call degrades steadily over a project's life. Therefore:

- Keep running session and day totals **in memory**, updated on append — never recomputed from file for the status bar.
- Persist **daily aggregates** to `.pmp/usage-daily.json` alongside the raw log; rollups by day, provider, and spec read aggregates.
- **Rotate the raw log monthly** to `.pmp/usage/YYYY-MM.jsonl`; only task-level rollups and the audit view read raw files, and only for the months they need.

### 8.3 Pricing

`PricingTable` merges shipped defaults with `planmyproject.cost.pricing` (an object of `model → { inputPerMTok, outputPerMTok, cacheReadPerMTok?, cacheWritePerMTok? }` in USD). Shipped defaults are dated in the source (`PRICING_AS_OF = "2026-06-24"`) and cover the current Claude and OpenAI model families; unknown models produce `costUsd: null` and a one-time "unpriced model" hint pointing at the setting. Copilot models are priced at `0` with a `subscription` flag. Pricing is never fetched over the network.

Model selection becomes configurable and current: `planmyproject.model.claude` (default `claude-opus-5`), `planmyproject.model.openai` (default `gpt-4.1`), `planmyproject.model.copilotFamily` (default `""` = first available; otherwise passed as `family` to `selectChatModels`). The Claude provider sends `thinking: { type: "adaptive" }` and a `max_tokens` derived from the operation (planning 8k, implementation 32k with streaming) instead of a hardcoded 1,800.

### 8.4 Pre-Flight Estimation and Budgets

**[draft2] Pre-flight estimation never blocks the consent dialog.** `cost.preflightMode: "exact"` uses the provider's token-counting endpoint — a 100–400 ms network round trip for Claude, an async RPC for Copilot. The consent dialog is the direct response to clicking "Plan Task"; inserting a network call before the modal appears makes the button feel broken. So:

- The dialog opens **immediately** with the heuristic estimate (`chars / 3.6`).
- If an exact count arrives before the user decides, the figure is **refined in place**.
- `"exact"` is authoritative for the **budget enforcement check**, which runs after consent and before the request — where a few hundred milliseconds is invisible.

`TokenEstimator` computes the input token count and `PricingTable` produces an estimate using the operation's typical output size (learned from the ledger's median for that `op`, seeded with defaults). The consent summary line becomes:

```
Plan task T0012 sends context to claude (claude-opus-5).
- Task: [T0012] Render invoice PDF
- Input ≈ 3.8k tokens · expected output ≈ 0.9k · est. $0.04
- Session so far: $0.61 of $5.00 budget
```

`BudgetGuard`:

| Setting | Default | Effect |
|---|---|---|
| `cost.sessionBudgetUsd` | `0` (off) | Warn at 80%, block at 100% (block is a new `budget` reason shown in the consent dialog, not in `getTaskBlockReason`) |
| `cost.dailyBudgetUsd` | `0` (off) | Same, rolled up from the ledger by day |
| `cost.perOperationMaxInputTokens` | `60000` | Refuse to send and explain what to trim |
| `cost.preflightMode` | `"fast"` | `"fast"` heuristic / `"exact"` provider count (one extra request for Claude) |
| `cost.ledgerInGit` | `false` | Whether to suggest ignoring `.pmp/usage.jsonl` |
| `cost.pricing` | `{}` | Per-model overrides |

Consent mode `never` still records the ledger and still enforces budgets; budgets are the one thing consent cannot skip.

### 8.5 Prompt Budgeting

**[draft3] Ordering constraint:** the budgeter runs on assembled layers, and `maskPromptText` runs after it, in `AIService.generateText`. Trimming after masking could reintroduce unmasked content; the tests assert the order. Masking is defence in depth behind the sensitivity refusal (I15), never the primary control — regex masking of a large source file will always miss something, which is why P0-D2 refuses secret-bearing files rather than relying on redaction.

`PromptBudgeter.fit(layers, maxTokens)` trims in a fixed priority order — WORKSPACE (modules, then signatures, then deps), then KNOWLEDGE (lowest-scored entries first), then linked file snapshots (tail-truncate largest first) — never the CONSTITUTION, GOAL, SPEC, or INSTRUCTION layers. What was trimmed is recorded in the ledger (`truncated[]`) and shown in the request status tooltip so the user can see why the AI lacked context. `maxTokens` comes from `cost.perOperationMaxInputTokens` capped by the model's context window when the provider reports one.

### 8.6 Views and Export

- **Usage view** (tree): Session / Today / This week / All time → per provider, per spec, per task; each row shows tokens in/out and cost; "unpriced" rows are marked.
- **Status bar**: `$0.61 · 38k` for the session; click opens the Usage view; turns warning-colored at 80% of any budget.
- **Usage dashboard** (WebView, optional in P8): cost by day (bar), cost by operation (horizontal bar), top 10 tasks by cost; pure inline SVG, no library.
- **Export Usage** command: CSV or JSON of the ledger with rollups; `Reset Session Counters`.
- **Tree tooltips**: task tooltip gains "AI spend: $0.12 across 4 calls".

### 8.7 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P8-C1** | `AIUsage` type; Claude provider → SSE streaming + usage + adaptive thinking + per-op `max_tokens`; OpenAI streaming + usage; Copilot `countTokens` estimate; sanitize error bodies (P4-H2) | `src/ai/types.ts`, `ClaudeProvider.ts`, `OpenAIProvider.ts`, `CopilotProvider.ts` | L | — |
| **P8-C2** | Model settings (`model.*`), `selectChatModels` by family, remove hardcoded IDs | `AIService.ts`, `package.json` | S | C1 |
| **P8-C3** | `UsageLedger` append + rollups + `.gitignore` suggestion; wire every AI call site to log with `op`, `taskId`, `specId` | `src/cost/UsageLedger.ts`, `AIService.ts`, call sites | M | C1 |
| **P8-C4** | `PricingTable` with dated defaults and overrides; `costUsd` computation | `src/cost/PricingTable.ts` | S | C3 |
| **P8-C5** | `TokenEstimator` + `PromptBudgeter`; integrate into `PromptBuilder` and implementation prompt | `src/cost/TokenEstimator.ts`, `PromptBudgeter.ts`, `PromptBuilder.ts` | M | C1 |
| **P8-C6** | `BudgetGuard` + consent summary lines with estimate and session spend | `src/cost/BudgetGuard.ts`, `ConsentService.ts` | M | C4, C5 |
| **P8-C7** | Usage tree view, status bar item, tree tooltips | `src/ui/UsageTreeProvider.ts`, `StatusBarItem.ts`, `TreeProvider.ts` | M | C3 |
| **P8-C8** | Export Usage (CSV/JSON), Reset Session Counters | `PlanController.ts` | S | C3 |
| **P8-C9** | Usage dashboard WebView (optional; can slip to P10) | `src/ui/UsageDashboardPanel.ts`, `webviews/usage/` | M | C7 |
| **P8-C10** | Tests: ledger rollups, pricing math incl. unpriced, budgeter trimming order, budget guard thresholds, provider usage parsing with recorded fixtures | `test/cost.test.ts`, `test/providers.test.ts` | M | C6 |
| **P8-C11** | **[draft3]** File-level provenance joining ledger and trace links; written on accepted implement and hand-off completion; `Export Provenance Report` command; rename the audit-log view per D-14 | `UsageLedger.ts`, `TraceService.ts`, `PlanController.ts` | M | C3, P6-T1 |

---

## 9. Workstream E — SDLC and Tool Compatibility (Goal 3)

### 9.1 Adapter Architecture

```typescript
export interface SyncAdapter {
  readonly system: ExternalRef["system"];
  configure(): Promise<boolean>;                              // prompts for site/project; stores secrets
  push(items: SyncItem[], options: PushOptions): Promise<SyncResult>;
  pull(refs: ExternalRef[]): Promise<RemoteItem[]>;
  mapStatus(local: TaskStatus, direction: "toRemote" | "toLocal", remote?: string): string;
  linkUrl(ref: ExternalRef): string;
}

export interface SyncItem {
  kind: "spec" | "task";
  id: string;
  title: string;
  body: string;                 // rendered markdown (requirements/ACs for specs; rationale + ACs for tasks)
  type: TaskType | "epic";
  status: TaskStatus | SpecStatus;
  parentRef: ExternalRef | null;
  labels: string[];
  estimate: string | null;
  existingRef: ExternalRef | null;
}
```

Mapping (default, overridable per adapter setting):

| PMP | Jira | GitHub |
|---|---|---|
| Spec | Epic (or Story when `jira.specIssueType` is changed) | Milestone (or Issue with label `pmp:spec`) |
| Root task / milestone task | Story | Issue |
| Leaf implementation task | Sub-task (Jira) | Task-list item in parent issue, or Issue when `github.leafAsIssue` |
| Research / decision task | Task with label `pmp:research` / `pmp:decision` | Issue with same labels |
| `todo` / `in-progress` / `done` | Transition by name: `To Do` / `In Progress` / `Done` (configurable) | open / open + label `in-progress` / closed |
| Requirement IDs, ACs | Rendered into description (ADF for Jira) with `[R0001]` markers so pull can re-associate | Markdown body |

**Sync modes** (`planmyproject.sync.mode`): `"push"` (default, structure and status flow out only), `"pull-status"` (status flows in, structure stays local), `"two-way"` (titles, status, labels both ways with conflict policy). Structure (parent/child, requirement links) is **always** owned by PMP; trackers never restructure the plan.

**Conflict policy** (`planmyproject.sync.conflictPolicy`): `"ask"` (default), `"local-wins"`, `"remote-wins"`. A conflict is a field changed on both sides since `lastSyncedAt` (detected by `remoteHash`).

**State**: `.pmp/sync/<system>.json` records site, project key, field mappings, and per-item `lastSyncedAt`/`remoteHash`; secrets go to `context.secrets`. `externalRefs` on tasks and specs are the durable links and are serialized into the markdown (I1).

**Triggers**: manual `Sync With Tracker`; `sync.pullOnOpen = true` pulls statuses on plan open. Every remote write is a consent-style confirmation listing what will be created/updated (no AI involved, but the same explicit-confirmation ethic).

**[draft2] `sync.onPersist` is removed.** Draft 1 offered it as an optional debounced push after `persistAndRefresh`. A Jira push of 50 tasks — sequential, with the 200 ms inter-request gap required by §9.2 plus 200–800 ms of network latency each — takes **20–50 seconds**. Wiring that to a save path means an editor that periodically spends a minute talking to Jira, and a failure leaves local state inconsistent mid-write.

Sync is a **background job** in all cases: its own queue, `withProgress` reporting, cancellation, and resumable per-item state in `.pmp/sync/<system>.json`. It never runs as a step inside a save, and it never blocks a user action (§4.5). Bulk and scheduled sync belong in the CLI and CI Action (§4.4), where a failed job is a retry rather than a half-written plan.

### 9.2 Jira Cloud Adapter

- **Auth**: site URL, email, API token via `Set Tracker Credentials` (secrets). Basic auth header. Server/Data Center is out of scope for 3.0 (different auth and endpoints); the adapter interface allows a later `JiraServerAdapter`.
- **[draft3] The credential is bound to its issuing host.** `jira.siteUrl` is a setting, and an unscoped setting is workspace-overridable (§12.4) — so a repository could point it at an attacker's host and receive the user's real Jira API token in a basic-auth header on the next sync. Therefore: `jira.siteUrl` and `sync.repoUrl` are machine-scoped; the host is stored **alongside** the secret at `Set Tracker Credentials` time and the credential is never sent anywhere else; HTTPS is required; redirects that change host are rejected; and the sync confirmation names the **target host**, not just the issues being written.
- **Endpoints**: create/update issue, transitions list + transition, issue search by JQL with `labels = pmp` and `pmp-id` custom field or summary marker, remote links (link back to the spec file on the repo host when `sync.repoUrl` is set).
- **Identity**: PMP writes `[PMP:T0012]` into a configurable custom field when available, otherwise into the summary suffix, so re-association survives renames.
- **Description**: requirements and ACs rendered to ADF (paragraphs, bullet lists, code marks). A minimal ADF builder lives in the adapter; no dependency.
- **Rate limits**: sequential requests with a 200 ms gap and exponential backoff on 429.
- **Estimate**: `task.estimate` maps to Story Points when `jira.storyPointsField` is set; otherwise ignored.

### 9.3 GitHub Issues Adapter

- **Auth**: `vscode.authentication.getSession("github", ["repo"], { createIfNone: true })` — native, no token entry. **[draft3]** `repo` grants full read and write to **every** private repository the user can access, to serve issue sync on one. Request `public_repo` when the target repository is public, prefer a fine-grained token path where the platform offers one, and state the grant in the consent flow, the README, and `PRIVACY.md` (§10.5).
- **Repo**: inferred from the `origin` remote via `GitFacade`, overridable with `github.repository`.
- **Endpoints**: issues create/update/close, labels, milestones, and task-list checkbox updates in the parent issue body.
- **Identity**: `<!-- pmp:T0012 -->` HTML comment in the issue body.

### 9.4 Framework Interop

| Feature | Direction | Description |
|---|---|---|
| **Spec Kit import** | in | Reads `specs/NNN-*/spec.md`, `plan.md`, `tasks.md` from a Spec Kit project; maps user stories and requirements to `Requirement`/`AcceptanceCriterion`, `tasks.md` checklist into the plan tree with `reqRefs` guessed by ID mention; keeps a `sourceFormat: "speckit"` note. Verified against the upstream layout at implementation time, since it evolves. |
| **Spec Kit export** | out | Writes `spec.md`, `plan.md`, `tasks.md` in Spec Kit shape so a team using `/speckit.implement` in another agent can consume PMP's plan. |
| **Superpowers-style plan export** | out | `docs/plans/<date>-<slug>.md` with bite-sized tasks and verification steps, matching the writing-plans skill's structure. |
| **ADR export** | out | Every `decision` task with a conclusion becomes `docs/adr/NNNN-slug.md` (MADR format: context, decision, consequences, links to R/T IDs). Regenerated on Mark Research Complete when `adr.autoExport` is on. |
| **Jira CSV export** | out | For teams without API access: a CSV importable by Jira's bulk importer (summary, issue type, parent, description, labels). |
| **Plan summary export** | out | Existing command, extended with requirement coverage and drift score. |
| **Requirements import** | in | Extends `Import Goal Statement`: a markdown or plain-text requirements document becomes a spec draft with AI-assisted structuring and clarification markers. |

### 9.5 Later Adapters

Azure DevOps (PAT auth, work item types), Linear (GraphQL, API key), and GitLab issues follow the same interface. They are listed as `wont` for 3.0 and become candidates for 3.1 based on demand.

### 9.6 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P9-X1** | `SyncAdapter` interface, `SyncItem` rendering (markdown/ADF), `ExternalRef` on tasks/specs with serialization | `src/sync/SyncAdapter.ts`, `PlanParser.ts`, `SpecParser.ts` | M | P5-S8 |
| **P9-X2** | `SyncService`: mode, conflict policy, state files, confirmation summary, triggers | `src/sync/SyncService.ts`, `src/controller/SyncCommandService.ts` | L | X1 |
| **P9-X3** | `JiraAdapter` (auth, create/update, transitions, search, ADF, backoff) | `src/sync/JiraAdapter.ts` | XL | X2 |
| **P9-X4** | `GitHubIssuesAdapter` with native auth | `src/sync/GitHubIssuesAdapter.ts` | L | X2, P6-T3 |
| **P9-X5** | Sync UI: `Sync With Tracker`, `Set Tracker Credentials`, `Open In Tracker`, tree/description badges with external keys, D10 detector | `package.json`, `TreeProvider.ts`, `DriftEngine.ts` | M | X3 |
| **P9-X6** | `SpecKitBridge` import/export | `src/sync/SpecKitBridge.ts` | L | P5-S3 |
| **P9-X7** | `AdrExporter`, Superpowers-style plan export, Jira CSV export | `src/sync/AdrExporter.ts`, `CsvExporter.ts` | M | P5-S8 |
| **P9-X8** | Requirements import into spec draft | `GoalCommandService.ts`, `SpecGenerator.ts` | M | P5-S5 |
| **P9-X9** | Tests: adapter mapping with recorded HTTP fixtures (no network), conflict resolution matrix, Spec Kit round-trip, ADR rendering | `test/sync.test.ts`, `test/fixtures/jira/*.json` | L | X3, X4, X6 |
| **P9-X10** | **[draft2]** `pmp` CLI over `@planmyproject/core` (`specify`, `plan`, `drift --format sarif`, `analyze`, `sync`) + a CI Action running `pmp drift` as a PR status check. **[draft3]** Headless sync removes the human from §9.1's confirmation, so it requires its own explicit opt-in rather than inheriting interactive semantics | `cli/`, `.github/actions/` | M | P6-T17, X2 |
| **P9-X11** | **[draft3]** Tracker credential binding: store the issuing host with the secret, refuse other hosts, require HTTPS, reject cross-host redirects, show the target host in the confirmation | `JiraAdapter.ts`, `SyncService.ts` | S | X2 |

---

## 10. Workstream F — Platform Hardening and Release (Goal 6)

### 10.1 Schema v3 Migration

- Plan file marker becomes `<!-- pmp:schema=v3 -->`. v2 files are detected and migrated with a backup at `.pmp/planmyproject.v2.backup.md` and a confirmation prompt, exactly like v1 → v2.
- v2 → v3 rules: new task fields default to empty/null; `goalRef` is preserved; no spec is created automatically. A "Keep v2 (read-only)" option exists with the same banner treatment as v1.
- v1 files still migrate (v1 → v2 → v3 in one pass).
- `SchemaUpgrader` becomes a chain of upgraders with tests for each hop and for the full chain.

### 10.2 Provider Modernization

Covered by P8-C1/C2 for streaming, usage, and model settings. Additional items:

- Decision task (§15, D-2): adopt `@anthropic-ai/sdk` and `openai` npm packages, or stay dependency-free with raw `fetch`. The raw path is acceptable and already works; the SDKs bring typed errors, retries, and streaming helpers. Default recommendation: **stay dependency-free for 3.0**, revisit if provider surface area grows.
- Retry with backoff on 429/5xx (both providers), honoring `retry-after`.
- Provider health check command: `PlanMyProject: Test AI Connection` (one tiny request, logged to the ledger as `op: "healthcheck"`).

### 10.3 Audit Log

The usage ledger (§8.2) is the audit log. `constitution.md §11` is updated to point at it, and a `View AI Audit Log` command opens a filtered, read-only view of the ledger (operation, task, outcome, model) in the output channel.

### 10.4 Performance [draft2 — rewritten]

The heavy items moved out of P10: the queue rewrite is **P0-B1**, esbuild bundling is **P0-C2**, incremental drift is the P6 design (§6.4), and the shared parsed-document cache is **P7-N4**. P10 holds what remains, plus verification against the §4.5 budgets.

**Activation.** v2 activates in a projected ~100–140 ms; v3 as drafted would reach ~400–700 ms, or over 1.5 s with an activation-time drift run. Three rules keep it under the 150 ms budget:

- **Lazy service construction.** `SpecService`, `TraceService`, `DriftEngine`, `CostService`, and `SyncService` are built on first use, not in `PlanController`'s constructor as every current service is. Chat participant and tools register at activation but resolve services lazily.
- **No I/O on the activation path.** `activate()` registers providers, commands, and watchers, then returns. The scan cache (4.9 ms `JSON.parse` today, ~20 ms at 2,000 files), plan file, specs, and trace cache load in the background; the tree renders progressively.
- **Never run drift at activation.** The first sweep is scheduled after the window settles, or on the first trigger.

**Activation events.** `workspaceContains:planmyproject.md` and `projectplan.md` resolve against the workspace file index and stay. **No glob-shaped activation events** — `workspaceContains:specs/**/spec.md` would force a workspace search at startup in every window. The Specs view supplies `onView:planmyproject.specs` for workspaces with specs but no plan.

**Mutation path.** With P0-B1 landed, a 1,000-task mutation projects to ~69 ms end to end. Two structural costs remain (F14): the undo snapshot re-reads the plan file from disk although the previous serialized string was in memory a tick earlier, and `maybeArchiveDebateEntries` iterates every task and constructs a fresh `DebateArchiver` on every persist. Both are removed in P10-H12.

**The plan file as a diff surface.** A 1,000-task plan is a 446 KB file that every mutation rewrites in full, so a one-word title edit rewrites the derived execution queue section and touches lines throughout the document — constant diff noise, frequent merge conflicts, slow `git blame`. Moving spec content into `specs/` helps. P10-H13 goes further: treat the execution queue as **derived**, regenerated on read, and write it to a gitignored file rather than serializing it into the committed plan. The queue is computed from the tree; storing it is what makes every mutation touch the whole document.

**Memory.** `DebatePanel` uses `retainContextWhenHidden: true` (F13), and v3 adds Spec Review and Usage Dashboard panels — three retained webviews, tens of megabytes held for panels opened once. Panel state is serialized and restored on reveal instead. Prefer virtual documents (`TextDocumentContentProvider` on a `pmp:` scheme) over webviews for drift reports, usage exports, and the audit log: cheaper, and find, copy, diff, and split-view come free.

**Status bar.** v2 has one item. v3 as drafted adds drift score and session cost, making three PMP items in a bar shared with language mode, line/column, git branch, and problem counts. **Consolidate into a single item** whose text summarizes, with detail in the hover and a click that opens the relevant view.

**Scanner.** Add `configFiles`/`assetFiles` buckets (P4-E1) and file content hashes for changed-file detection without git; use `node:fs` on the `file:` scheme (§4.4, P10-H10).

### 10.5 Docs and Release

- `USER_GUIDE.md` rewritten around the SDD lifecycle; `USER_GUIDE_UPDATED.md` removed (F10).
- `README.md`: new positioning, lifecycle diagram, privacy section updated for chat/tools/ledger.
- `CHANGELOG.md`: `3.0.0` entry; `2.0.0` entry for the v2 release.
- `constitution.md` 1.1: chat/tool rules (tools obey the same gates), ledger as audit log, budget rule.
- `planmyproject.template.md` updated for v3 fields; new `specs/S0000-template/spec.md`.
- Marketplace: screenshots of Specs view, Drift view, `@pmp` chat; categories add "AI", "Testing"?—keep "Other" plus "AI".

#### [draft3] Security, privacy, and IP documentation

The repository has no `SECURITY.md`, no `PRIVACY.md`, and no `NOTICE`. All three ship in 3.0 (P10-H14).

**`PRIVACY.md`** — what leaves the machine (prompt contents, per operation, and nothing else); to whom (only the configured provider); named subprocessors with links to their terms; per-provider and per-tier training posture; the controls and **their limits**; local data, retention, and the `cost.ledgerInGit` implication; what tracker sync pushes and where; the GitHub `repo` grant and why it is requested. Two statements matter most:

- **PlanMyProject collects no telemetry.** Nothing is sent anywhere except the provider the user configured, on an action the user took. This is true today and is a genuine differentiator — it belongs in the README, not only in the policy.
- **The DPA route is with the model provider, not with PlanMyProject.** It is the first question an enterprise reviewer asks.

**`SECURITY.md`** — vulnerability reporting contact, expected response, supported versions, and the trust model summary from §3.5.

**An "IP, Indemnity, and Provider Terms" section** in the user guide, stating plainly:

1. PlanMyProject is MIT-licensed and provides **no indemnity and no warranty**.
2. Any indemnity for generated output arises from the user's **own agreement with their AI provider**, not from this extension.
3. Those indemnities are typically **conditional** — on plan tier, on not disabling provider safety features, on usage-policy compliance.
4. PlanMyProject configures model, parameters, and prompts on the user's behalf and **does not verify or preserve those conditions**.
5. The provenance record (§8.2) is what lets a user evidence which provider, model, and parameters produced a given file.

Provider terms change; counsel should review current Anthropic, OpenAI, and GitHub Copilot business terms before this text is published, particularly whether setting model parameters programmatically affects any condition.

**Assurance language.** Gates are described in user-facing docs as **developer workflow aids, not compliance controls**. The §14.4 CI gates are what make the behavioural claims true and are the thing to point at when someone asks how they are assured.

**Supply chain.** Draft 2 relaxed I6 to admit `vscode-languageclient`, `vscode-languageserver`, and an MCP SDK. "No runtime dependencies" was a marketed property, so its removal carries: a license review, pinned versions, `npm audit` in CI, and an SBOM in the release. No third-party template, schema, or prose is vendored without a license check — relevant to the Spec Kit and Superpowers interop in §9.4 — and a `NOTICE` file ships if anything is.

### 10.6 Tasks

| ID | Task | Files | Size | Depends on |
|---|---|---|---|---|
| **P10-H1** | Schema v3 marker, upgrader chain, backups, read-only mode for v2 | `SchemaUpgrader.ts`, `PlanRepository.ts`, `PlanController.ts`, tests | M | P5-S8 |
| **P10-H2** | Retry/backoff, health check command | `ClaudeProvider.ts`, `OpenAIProvider.ts`, `PlanController.ts` | S | P8-C1 |
| **P10-H3** | Activity log view, constitution 1.1. **[draft3]** The constitution changes are corrections, not additions: remove the "HIPAA/SOC2 contexts" line from §11 (a governance document naming regulated frameworks it does not support is a reliance risk — L3); correct the `ai-audit.jsonl` promise to match D-14; and state that red lines are model guidance whose enforcement lives in code (§3.5 table). `constitution.md` §10 requires a human-authored commit with rationale, so this task is done by hand, not generated | `PlanController.ts`, `constitution.md` | S | P8-C3 |
| **P10-H4** | **[draft2]** ~~Queue rank precompute; incremental drift~~ — moved to **P0-B1** and §6.4 respectively. Retained as: verify the §4.5 budgets on the full v3 build and record results in `FEATURE_PROGRESS.md` | `test/bench/` | S | P0-C1, P6-T18 |
| **P10-H5** | Move `usedInPrompts` out of the committed index (F8) | `ResearchIndex.ts` | S | — |
| **P10-H6** | Scanner buckets + content hashes (P4-E1 extended) | `WorkspaceScanner.ts`, `WorkspaceScan.ts` | M | — |
| **P10-H10** | **[draft2]** `node:fs` for `file:` scheme paths with `workspace.fs` fallback for virtual schemes; split `PathSafetyChecker` into a pure normalizer plus a host symlink check | `src/storage/`, `src/scanner/`, `PathSafetyChecker.ts` | M | — |
| **P10-H11** | **[draft2]** Drop `retainContextWhenHidden` (F13); serialize and restore panel state; virtual documents on a `pmp:` scheme for drift, usage, and audit reports; consolidate the status bar to one item | `DebatePanel.ts`, `src/ui/`, `PlanController.ts` | M | — |
| **P10-H12** | **[draft2]** Mutation-path cleanup (F14): reuse the in-memory serialized string for the undo snapshot; make the debate archive sweep threshold-gated instead of per-task-per-persist; lazy service construction and background activation I/O | `PlanController.ts`, `DebateArchiver.ts` | M | — |
| **P10-H13** | **[draft2]** Treat the execution queue as derived: regenerate on read, write to a gitignored file rather than serializing into the committed plan | `PlanParser.ts`, `QueueBuilder.ts`, `PlanRepository.ts` | M | P0-B1 |
| **P10-H14** | **[draft3]** `SECURITY.md`, `PRIVACY.md`, `NOTICE`; IP/indemnity/provider-terms section; assurance-language pass over the docs; SBOM and `npm audit` in CI | docs, `.github/workflows/ci.yml` | M | all |
| **P10-H7** | Docs, README, CHANGELOG, template, constitution, screenshots | docs | M | all |
| **P10-H8** | Feature checklist completion pass; `check:coverage` in CI workflow | `FEATURE_CHECKLIST.json`, `.github/workflows/ci.yml` | S | all |
| **P10-H9** | Release 3.0.0 per `copilot-instructions.md` workflow | `package.json`, `CHANGELOG.md` | S | H7, H8 |

---

## 11. Consolidated Schema v3

### 11.1 Plan File (`planmyproject.md`)

```markdown
# Project Plan

<!-- pmp:schema=v3 -->
<!-- pmp:goal:id=G0001;statement=Build a multi-tenant SaaS invoicing tool;scanned=2026-09-17T09:00:00Z -->

## Goals

- [G0001] Build a multi-tenant SaaS invoicing tool
  <!-- pmp:goal-meta:id=G0001;criteria=["Users can create invoices","Users can download PDFs"];constraints=["React frontend","Node backend"];out-of-scope=["Payments"] -->

## Specs

- [S0001] Invoice PDF Generation — approved — specs/S0001-invoice-pdf/spec.md
  <!-- pmp:spec-ref:id=S0001;status=approved;path=specs/S0001-invoice-pdf/spec.md;contentHash=9f1c2ab4d7e0;jira=PROJ-41 -->

## Plan Tree

- [/] [T0010] ⚙️ Render invoice PDF
  <!-- pmp:id=T0010;parent=ROOT;type=implementation;origin=ai-generated;goalRef=G0001;specRef=S0001;reqRefs=["R0001"];acRefs=["AC0001","AC0002"];reqHashes={"R0001":"3b7d9e1a44c0"};confidence=0.88;dependsOn=[];linkedFiles=["src/pdf/render.ts"];linkedSymbols=["src/pdf/render.ts#renderInvoice"];linkedTests=["test/pdf.test.ts#totals match"];externalRefs=[{"system":"jira","key":"PROJ-52"}];estimate="3";labels=["pdf"];fileSendPolicy=global;createdAt=2026-09-17T09:10:00Z;completedAt=null;completedRev=null;verification={"state":"unverified"};notes=null;archivedDebatePath=null -->
  > Rationale: R0001 is the must-have deliverable; rendering is isolated from delivery (S0002).

## Execution Queue (Auto-Generated, Leaf Tasks Only)

### ⚠️ Blocked (Dependencies, Research, Debate, Spec, Drift)
...
```

The `## Specs` section is an index written by the serializer from `SpecService`; the spec files remain authoritative for their content. The queue gains "Spec" and "Drift" in the blocked heading and new suffixes `— blocked until spec S0001 is approved` and `— blocked by stale spec (R0001 changed)`.

### 11.2 Spec File

See §5.3. Metadata keys: `pmp:spec`, `pmp:req`, `pmp:ac`, `pmp:clarify`.

### 11.3 `.pmp/` Layout

| Path | Git | Owner |
|---|---|---|
| `constitution.md` | committed | user |
| `research-index.json` | committed | `ResearchIndex` (usage counters moved out in P10-H5) |
| `research-usage.json` | local | `ResearchIndex` |
| `debate-archive/*.md` | committed | `DebateArchiver` |
| `sync/<system>.json` | committed | `SyncService` |
| `scan-cache.json` | local | `ScanCacheStore` |
| `trace-cache.json` | local | `TraceService` / `DriftEngine` |
| `usage.jsonl` | local (configurable) | `UsageLedger` |
| `planmyproject.v1.backup.md`, `planmyproject.v2.backup.md` | local | `PlanRepository` |

---

## 12. Commands, Settings, Context Keys

### 12.1 New Commands

| Command ID | Title | Surface |
|---|---|---|
| `planmyproject.specifyFeature` | Specify Feature | Palette, Specs view, `@pmp /specify` |
| `planmyproject.clarifySpec` | Clarify Spec | Specs view, spec CodeLens, `@pmp /clarify` |
| `planmyproject.approveSpec` | Approve Spec | Specs view, spec CodeLens, review panel |
| `planmyproject.supersedeSpec` | Supersede Spec | Specs view |
| `planmyproject.planFromSpec` | Plan From Spec | Specs view, spec CodeLens |
| `planmyproject.analyzeSpec` | Analyze Spec | Specs view, spec CodeLens, `@pmp /analyze` |
| `planmyproject.openSpec` | Open Spec | Palette |
| `planmyproject.editConstitution` | Edit Constitution | Palette, walkthrough |
| `planmyproject.verifyTask` | Verify Task | Task menu, CodeLens, `@pmp /verify` |
| `planmyproject.verifySpec` | Verify Spec | Specs view |
| `planmyproject.runDriftCheck` | Run Drift Check | Drift view toolbar, status bar |
| `planmyproject.exportDriftReport` | Export Drift Report | Drift view toolbar |
| `planmyproject.refreshSpecLinks` | Refresh Spec Links | Quick fix, task menu |
| `planmyproject.implementWithAgent` | Implement With Agent | Task menu, CodeLens, `@pmp /implement` |
| `planmyproject.syncWithTracker` | Sync With Tracker | Palette, Specs view, tree toolbar |
| `planmyproject.setTrackerCredentials` | Set Tracker Credentials | Palette |
| `planmyproject.openInTracker` | Open In Tracker | Task/spec menu |
| `planmyproject.importSpecKit` / `exportSpecKit` | Import/Export Spec Kit | Palette |
| `planmyproject.exportAdrs` | Export Decisions as ADRs | Palette |
| `planmyproject.exportJiraCsv` | Export Jira CSV | Palette |
| `planmyproject.exportUsage` | Export Usage | Usage view toolbar |
| `planmyproject.resetSessionCounters` | Reset Session Counters | Usage view toolbar |
| `planmyproject.viewAuditLog` | View AI Audit Log | Palette |
| `planmyproject.testAiConnection` | Test AI Connection | Palette |

Existing command IDs are unchanged (I3). `Implement Task` keeps its ID and classic behavior.

### 12.2 New Settings (summary; details in each workstream)

| Group | Keys |
|---|---|
| Spec | `specsDir`, `spec.gate`, `spec.requireAcForMust`, `spec.autoOpenAfterSpecify` |
| Drift / trace / verify | `drift.autoCheck`, `drift.gate`, `drift.warnThreshold`, `drift.unplannedChangeIgnore`, `drift.unplannedChangeMode` **[draft2]**, `drift.incremental` **[draft2]**, `trace.sourceCodeLens`, `verify.runTests` (**[draft3]** `"never" \| "ask"` only), `verify.testTaskName` |
| Native | `chat.enabled`, `tools.autoConfirm`, `git.branchTaskPrefix` |
| Cost | `cost.sessionBudgetUsd`, `cost.dailyBudgetUsd`, `cost.perOperationMaxInputTokens`, `cost.preflightMode`, `cost.ledgerInGit`, `cost.ledgerRotateMonthly` **[draft2]**, `cost.pricing`, `model.claude`, `model.openai`, `model.copilotFamily` |
| Sync | `sync.mode`, `sync.conflictPolicy`, `sync.pullOnOpen`, `sync.repoUrl`, `jira.siteUrl`, `jira.projectKey`, `jira.specIssueType`, `jira.statusMap`, `jira.storyPointsField`, `jira.pmpIdField`, `github.repository`, `github.leafAsIssue`, `adr.autoExport`, `adr.dir` — **[draft2]** `sync.onPersist` removed (§9.1) |

### 12.3 Context Keys

`planmyproject.schemaV2ReadOnly`, `planmyproject.hasSpecs`, `planmyproject.driftErrors` (number), `planmyproject.trackerConfigured`, `planmyproject.agentModeAvailable`, `planmyproject.budgetExceeded`. View item context values gain `spec:<status>`, `req:<priority>`, `ac`, `drift:<code>`, `usage:<scope>`.

### 12.4 Settings Scope [draft3]

**Every one of v2's 17 settings declares no `scope`**, which VS Code treats as window scope — settable in `.vscode/settings.json`, a file that is committed and travels with the repository. A cloned repo can therefore ship:

```json
{
  "planmyproject.requireAiConsent": "never",
  "planmyproject.sendFileContentsToAI": true,
  "planmyproject.defaultTaskFileSendPolicy": "always"
}
```

and the first AI action sends workspace source to a provider with no prompt. `researchGate: false` likewise disables the gate the constitution promises to respect. Workspace Trust gates activation, but it is a single modal dialog developers clear reflexively, and it is all-or-nothing: trusting a repository so it can build should not also let it switch off source-code egress controls.

v3 would extend the reachable set to `tools.autoConfirm`, `verify.runTests`, `verify.testTaskName`, `jira.siteUrl`, `sync.repoUrl`, and the `cost.*` budgets.

#### The rule (I12)

> A workspace may make a gate **stricter**. It may never make one **weaker**.

That asymmetry preserves the legitimate case — a team repo setting `drift.gate: "block"` — while removing the attack. Where a setting's values are ordered by strictness, the effective value is the stricter of the workspace value and the user value.

#### Classification

| Class | Scope | Settings |
|---|---|---|
| **Secrets** | `application` | `claudeApiKey`, `openaiApiKey` — and both are deprecated in 3.0; `Set API Key` writing to `context.secrets` is the only supported path |
| **Safety and egress** | `machine` | `requireAiConsent`, `sendFileContentsToAI`, `defaultTaskFileSendPolicy`, `tools.autoConfirm`, `verify.runTests`, `verify.testTaskName`, `jira.siteUrl`, `sync.repoUrl`, `cost.sessionBudgetUsd`, `cost.dailyBudgetUsd`, `cost.perOperationMaxInputTokens`, `cost.ledgerInGit` |
| **Gate strictness** | `window`, stricter-only | `researchGate`, `spec.gate`, `drift.gate`, `drift.unplannedChangeMode`, `confidenceThreshold` |
| **Project preference** | `window` | `planFileName`, `specsDir`, `showRationaleInline`, `scanner.*`, `adr.*`, `github.*` (non-auth), `jira.projectKey`, `jira.statusMap`, `chat.enabled`, `trace.sourceCodeLens`, `drift.warnThreshold`, `drift.unplannedChangeIgnore`, `cost.pricing`, `model.*` |

#### Enforcement

- P0-D1 applies the scopes and one-way-migrates the API-key settings: read once, write to secrets, **clear the setting**, tell the user it moved. Today [AIService.ts](src/ai/AIService.ts) copies the key to secrets, warns with a suppressible dialog, and leaves the plaintext value in place.
- P0-D4 asserts the rule behaviourally: a workspace setting that would weaken a control has no effect.
- CI fails the build when a new setting is added to `package.json` without an explicit `scope` (§14.4).

---

## 13. Roadmap and Sequencing

### 13.1 Phases

| Phase | Name | Workstream | Tasks | Estimate | Exit criteria |
|---|---|---|---|---|---|
| **P0** | **Blocking defects [draft2/3]** | — | P0-A1–A3, B1–B3, C1–C2, **D1–D4** | **1–1.5 wk** | Metadata round-trips field-by-field; queue < 10 ms @ 2,000 tasks with dependencies intact; bench suite gating CI; bundled VSIX; **no setting is unscoped; egress sensitivity enforced; security suite green** |
| **P4 (finish)** | v2 release | — | P4-B1, B2, D1, D2, H3, H4 + docs | 1–2 wk | 2.0.0 published; checklist green |
| **P5** | Spec core | A | S0–S16 | 3–3.5 wk | Core package extracted; specify → clarify → approve → plan-from-spec works end to end; schema v3 parses and migrates |
| **P6** | Traceability and drift | B | T1–T18 | 3.5–4 wk | All 11 detectors with tests; **incremental drift within budget, running in the LSP server**; Problems panel populated; Verify Task records evidence |
| **P8** | Cost monitoring | D | C1–C10 | 2 wk | Every AI call logged with usage and cost; consent shows a non-blocking estimate; budgets enforce; ledger rotates |
| **P7** | Native surfaces | C | N1–N9 | 2.5 wk | `@pmp` handles all slash commands; **MCP server usable from at least two agents**; VS Code shim usable from Copilot agent mode; hand-off implement closes the trace loop |
| **P9** | SDLC compatibility | E | X1–X10 | 3 wk | Jira push and pull-status against a test project; GitHub Issues push; Spec Kit round-trip; ADR export; **`pmp drift` as a CI gate** |
| **P10** | Hardening and release | F | H1–H13 | 1.5–2 wk | 3.0.0 published; all §4.5 budgets met on the full build |

Total: approximately **15–20 developer-weeks** after the v2 release. **[draft2]** That is +1 to +2 weeks on draft 1's 14–18: the core extraction and LSP scaffolding cost roughly two weeks, partly offset by the MCP server replacing rather than supplementing LM Tools and by the CLI making P9 sync testable without a live Jira instance. P0 is additional but small, and it pays for itself in P0-B3 alone — features that read task metadata have never been exercised against data that survived a save.

### 13.2 Dependency Graph

```
P0 Defects ──► P4(finish) ──► P5 Spec core ──┬──► P6 Drift ──┬──► P7 Native ──► P10 Release
   │                            (incl. S0 core)  │   (incl. LSP)  │
   │                                             │               └──► P9 SDLC ──────┘
   │                                             │
   └── bench gate guards every phase below     └──► P8 Cost (parallel with P6)
```

- **[draft2]** P0 blocks everything. It is not negotiable: P5-S8 extends the same task metadata that P0-A3 fixes, so building spec fields onto a parser that drops fields would bury the defect deeper.
- **[draft3]** P0-D1–D4 are live v2 defects and ship in the same phase, before the 2.0.0 release. P0-D2 and P0-A are coupled: a per-task `fileSendPolicy: "never"` is the control a user would set to prevent the egress P0-D2 closes, and it does not currently survive a save.
- **[draft2]** P5-S0 (core extraction) blocks the rest of P5. P6-T17 (LSP) depends on it.
- P8 can start the day P5 starts; it depends on nothing in P5.
- P7-N1 (chat skeleton, `/status`, `/cost`) can start once P8-C3 lands, before P6 finishes.
- P9-X6/X7 (Spec Kit, ADR, CSV) depend only on P5 and can fill gaps while P6 is in progress.
- P9-X3 (Jira) is the largest single task and the most likely to slip; §15 recommends shipping 3.0 with GitHub Issues plus Jira push-only if needed, and completing Jira two-way in 3.1.
- **[draft2]** P9-X10 (CLI + CI drift gate) depends only on the core and the drift detectors, so it can run in parallel with P9-X3 and de-risks it: adapter logic becomes testable headlessly.

### 13.3 Milestone Demos

Each phase ends with a scripted demo recorded as an integration test:

0. **[draft2/3] P0**: "Nothing is lost, nothing leaks" — a workspace `settings.json` attempting to disable consent has no effect, and `.env` reached through `linkedFiles` is refused by name; then:  "Nothing is lost" — a task with dependencies, linked files, and `fileSendPolicy: "never"` survives ten save cycles byte-identical; a 2,000-task plan with intact dependency edges serializes in under 50 ms.
1. **P5**: "From idea to approved spec with tasks" — one spec, one clarification, plan-from-spec produces three root tasks with `reqRefs`.
2. **P6**: "Change the spec, see the drift" — edit R0001, Problems panel shows D1 on T0010, quick fix refreshes links; delete a linked file, D2 appears.
3. **P8**: "Know what it cost" — three operations, Usage view totals match ledger, budget warning at 80%.
4. **P7**: "Never leave the editor" — `@pmp /specify`, `/plan`, `/implement` with Copilot agent mode calling `pmp_recordTrace`; **[draft2]** the same `pmp_recordTrace` called from a second, non-VS Code agent over MCP against the same workspace.
5. **P9**: "Push to Jira, pull the status" — spec becomes an epic, tasks become stories, status change in Jira shows as D10 then syncs.
6. **P10**: fresh install on a v1 plan → migrated to v3 → walkthrough completes.

---

## 14. Testing and Acceptance Gates

### 14.1 Unit Test Targets (additions)

| Module | Target | Notes |
|---|---|---|
| `SpecParser` | 95% | Round-trip, markers, hashes, tolerant read |
| `SpecService` lifecycle | 90% | Every transition and refusal |
| `ConstitutionService` | 90% | Cap, red-line preservation |
| `DriftEngine` detectors | 95% | One test file per detector, table-driven |
| `GitFacade` | 80% | Fake Git API in the shim |
| `TraceService` | 90% | Graph build, cache invalidation |
| `UsageLedger`, `PricingTable`, `BudgetGuard`, `PromptBudgeter` | 95% | Pure functions |
| Providers | 85% | Recorded SSE and JSON fixtures; no network in tests |
| `ChatParticipant`, `ToolHandlers` | 80% | Fake stream and fake tool invocation in the shim; **[draft2]** the same handler suite runs through both the MCP and LM-shim transports (R12) |
| **`@planmyproject/core`** | **95%** | **[draft2]** Pure; no shim needed. A lint rule fails any `vscode` import inside the package |
| **Round-trip fidelity** | **100% of serialized fields** | **[draft2]** I10: every plan and spec metadata field, asserted individually (P0-A1, P5-S16) |
| **Security controls** | **100% of controls** | **[draft3]** One suite per control (I12–I15), run against **every** caller — extension, LSP, MCP, CLI (P0-D4, P7-N10) |
| `SyncService`, adapters | 85% | Recorded HTTP fixtures; conflict matrix |
| `SpecKitBridge`, `AdrExporter`, `CsvExporter` | 90% | Golden files |
| `SchemaUpgrader` chain | 100% | v1→v3, v2→v3 |

The `vscode` shim grows: `languages.createDiagnosticCollection`, `chat`, `lm.registerTool`, `authentication`, `tasks`, `extensions.getExtension("vscode.git")` fakes. All fakes live in `test/shims/vscode.js` (I7).

### 14.2 Integration Scenarios (required)

1. Specify → clarify → approve → plan-from-spec → serialize → reparse (P5-S15).
2. Spec edit → D1; file delete → D2; done + git change → D3; plan-from-spec clears D4 (P6-T14).
3. Three AI operations → ledger → rollups → budget warning (P8-C10).
4. Chat `/plan` → drafts → commit → tree updated; tool `pmp_setTaskStatus` refused by gate (P7-N9).
5. Jira push with fixture server → externalRefs persisted → pull-status → D10 → sync (P9-X9).
6. v1 plan → v3 migration with backup; v2 read-only mode (P10-H1).
7. Existing v2 scenarios (migration, research gate, research → prompt, debate round-trip) continue to pass unchanged (I1–I4).
8. **[draft2]** Round-trip fidelity: a task carrying every metadata field, and a spec carrying every requirement/AC/clarification field, survive ten serialize → parse cycles byte-identical (P0-A1, P5-S16).
9. **[draft2]** Gate survival: a task blocked by an unresolved dependency, by the research gate, and by a `never` file-send policy each retain that state across a save (P0-B2, P0-B3).
10. **[draft3]** Control integrity: a workspace `settings.json` setting `requireAiConsent: "never"` and `sendFileContentsToAI: true` changes nothing; `.env` reached through `linkedFiles` is refused on egress and named in the refusal; a symlink escape is blocked at every write site; the same suite passes through the MCP transport (P0-D4, P7-N10).

### 14.3 Gates

- `npm test`, `npm run check:coverage`, `npm run bench`, and `npm run compile` in CI (`.github/workflows/ci.yml`, new) on every push.
- `FEATURE_CHECKLIST.json` must list every ✅ row from this document's workstream tables before a phase is called done.
- Manual acceptance per milestone demo (§13.3), recorded in `FEATURE_PROGRESS.md`.
- No phase merges with a regression in the 72 existing tests.
- **[draft2]** No phase merges with a regression against the §4.5 budgets or the I10 fidelity assertions.

### 14.4 Performance and Fidelity Gate [draft2]

`test/bench/` with an `npm run bench` script, wired into CI as a build-failing check. Benchmarks are committed to the repository, not kept as throwaway scripts.

| Benchmark | Budget | Introduced |
|---|---|---|
| `queue.bench` — build at 2,000 tasks, dependency edges intact | < 10 ms | P0-A2 |
| `serialize.bench` — full mutation path at 1,000 tasks | < 50 ms | P0-C1 |
| `parse.bench` — plan file at 1,000 tasks | < 30 ms | P0-C1 |
| `activation.bench` — module load + registration, cold | < 150 ms | P0-C1 |
| `drift.bench` — incremental, one spec changed | < 100 ms | P6-T18 |
| `drift.bench` — full sweep | < 2 s | P6-T18 |
| `codelens.bench` — provide at 1,000 tasks | < 20 ms | P7-N4 |
| `fidelity` — every metadata field, ten round trips | exact equality | P0-A1 |
| **[draft3]** `settings-scope` — every `package.json` setting declares a `scope` | no unscoped settings | P0-D1 |
| **[draft3]** `security` — controls I12–I15, per caller | all pass | P0-D4 |

Each benchmark constructs plans of realistic shape (roots → features → leaves, one research task per group, **sibling dependency edges**, two linked files and a rationale per leaf) and reports the median of 3–5 runs after a warm-up. Absolute numbers vary by machine; CI compares against a committed baseline with a tolerance band rather than a hard constant, and fails on regression beyond it.

**Dependency edges in the fixtures are not incidental.** P0-A was found by a benchmark that measured the same operation on a directly constructed plan and on one round-tripped through markdown and got answers 40× apart. A fixture whose edges are silently dropped measures nothing; the benchmark must assert its own edge count as a precondition. Both P0 defects survived a full architecture refactor and 72 passing tests precisely because nothing measured them.

---

## 15. Risks and Open Decisions

### 15.1 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Metadata comments on task lines become very long (externalRefs, reqHashes, verification) and hurt readability of the plan file | High | Medium | Serialize optional fields only when non-empty; keep `verification` compact; consider a second-line `<!-- pmp:trace:... -->` comment for trace fields (decision D-1) |
| R2 | Jira Cloud API surface (ADF, custom fields, transitions per project) makes the adapter brittle | High | High | Push-only first; fixture-driven tests; explicit field mapping UI; ship GitHub Issues as the reference adapter |
| R3 | Copilot agent mode APIs (chat open with prefilled mode, tool confirmation UX) change between VS Code versions | Medium | Medium | Feature-detect; fall back to classic implement; pin `engines.vscode` to the version tested |
| R4 | Drift engine noise (D7 unplanned changes) annoys users | Medium | Medium | Information severity by default, ignore globs, per-spec mute, only run D7 on manual Verify unless `drift.autoCheck` includes it |
| R5 | Token estimation for Copilot is approximate and users misread it as billing | Medium | Low | Label every Copilot row "estimated, included in subscription"; never show a dollar figure for Copilot |
| R6 | Scope creep in P9 delays 3.0 | High | Medium | Define 3.0 = GitHub Issues + Jira push-only; Jira two-way and other adapters in 3.1 |
| R7 | Zero-dependency policy makes SSE parsing and ADF building hand-rolled | Medium | Low | Small, tested utilities; revisit in D-2 |
| R8 | Constitution injection increases prompt size on every call | Low | Low | Hard cap, compact rendering, cached rendering |
| R9 | Multi-root workspaces (v2 uses `workspaceFolders[0]` everywhere) | Medium | Medium | Out of scope for 3.0; document; keep all new path code going through `WorkspaceFiles` so a later fix is localized |
| **R10** | **[draft2]** P0-B3 uncovers second-order bugs that the metadata loss was hiding — features reading `dependsOn`, `linkedFiles`, `confidence`, or `fileSendPolicy` have never run against data that survived a save | **High** | Medium | Budget P0-B3 as M, not S; treat findings as P0 scope rather than deferring them; the fidelity test (I10) prevents recurrence |
| **R11** | **[draft2]** LSP extraction in P6 slips, or the client/server boundary proves awkward for commands that need both plan state and UI | Medium | High | Extract the core in P5 and run it in-process first, so the boundary is validated by use before a wire is introduced; the drift engine is the only P6 consumer, and it is already specified as pure functions |
| **R12** | **[draft2]** MCP server and VS Code LM tool shim drift apart, or MCP transport details change | Low | Medium | One handler set, two thin transports (§7.2); contract tests run the same handler suite through both paths |
| **R13** | **[draft3]** A malicious or careless repository weakens safety controls through workspace settings | Medium | **High** | I12; scope table (§12.4); P0-D1; P0-D4 asserts it behaviourally |
| **R14** | **[draft3]** Prompt injection through spec, constitution, or tracker content drives tool calls or file writes | Medium | **High** | I13; untrusted-layer delimiting (§5.5); gates evaluated in code from parsed state only; confirmations show resolved effects; constitution validator (P5-S17) |
| **R15** | **[draft3]** Control enforcement diverges across the four callers after the core extraction | **High** | Medium | I14; enforcement in shared handlers (§7.2); one security suite run against every caller (P0-D4, P7-N10) |
| **R16** | **[draft3]** Provenance gaps prevent evidencing an indemnity claim or answering an AI-disclosure request | Medium | Medium | §8.2 provenance record; P8-C11; I10 keeps `origin` intact across saves |

### 15.2 Open Decisions (with recommended defaults)

| ID | Question | Options | Recommendation |
|---|---|---|---|
| D-1 | Where do trace fields live in the plan file? | (a) same `pmp:id` comment; (b) second `pmp:trace` comment line; (c) sidecar JSON | **(b)** — keeps the primary line readable and diffs focused; parser already handles multi-comment lookahead |
| D-2 | Adopt provider SDKs as runtime dependencies? | (a) stay raw `fetch`; (b) `@anthropic-ai/sdk` + `openai` | **(a) for 3.0** — unchanged in draft 2; staying dependency-free for providers is still reasonable, and the LSP dependency (D-10) is a separate question decided on its own merits |
| D-3 | Spec directory location | (a) `specs/` visible; (b) `.pmp/specs/` | **(a)**; specs are reviewed artifacts |
| D-4 | Requirement ID scope | (a) global `R0001`; (b) per-spec `S0001-R01` | **(a)**; matches task ID convention and keeps `reqRefs` unambiguous across specs |
| D-5 | Default Claude model | `claude-opus-5` vs `claude-sonnet-5` | **`claude-opus-5`** as the shipped default with `model.claude` documented for cost-sensitive users; the ledger makes the trade-off visible |
| D-6 | Does `drift.gate` default to warn or block? | warn / block | **warn** for 3.0; block is one setting away and the constitution's "respect research gates" precedent suggests users will opt in |
| D-7 | Should the ledger be committed by default? | yes / no | **no** (local), because it contains per-developer spend and churns; teams can flip `cost.ledgerInGit` |
| D-8 | Ship Jira two-way in 3.0? | yes / push-only | **push-only + pull-status**; two-way in 3.1 |
| D-9 | Chat participant name | `@pmp` / `@planmyproject` / `@planbot` | **`@pmp`** with `@planbot` as the display name to match the debate persona |
| **D-10** | **[draft2]** Does the drift engine run in-process or out-of-process? | (a) extension host; (b) LSP server process | **(b)**, from P6. A full sweep is a projected 0.5–3 s of unsolicited analysis, potentially six times a minute, on a process shared with every other extension. This accepts `vscode-languageclient` / `vscode-languageserver` as runtime dependencies and relaxes I6 accordingly — ESLint, TypeScript, and rust-analyzer all work this way for exactly this reason |
| **D-11** | **[draft2]** Agent tools: VS Code LM Tools or MCP? | (a) LM Tools only (draft 1); (b) MCP server + LM shim | **(b)** — comparable effort, works in every MCP-capable agent rather than Copilot agent mode alone, and removes the dependency on the unstable agent-mode APIs behind R3 (§7.2) |
| **D-12** | **[draft2]** Is the execution queue serialized into the committed plan file? | (a) yes, as today; (b) derived, regenerated on read, gitignored | **(b)** in P10-H13. Storing a derived section is what makes a one-word title edit rewrite the whole 446 KB document. Deferred to P10 because it changes the committed file shape and should not land alongside the P0 parser fix |
| **D-13** | **[draft3]** How are safety-relevant settings scoped? | (a) leave window-scoped; (b) machine-scope, with stricter-only workspace override | **(b)** — under (a) any cloned repository can disable consent and egress controls. The stricter-only rule keeps the legitimate team-repo case (§12.4) |
| **D-14** | **[draft3]** Is the usage ledger an audit log? | (a) add integrity protection and keep the claim; (b) rename to "usage ledger" and drop audit framing for 3.0 | **(b)** for 3.0 — a plain user-writable JSONL cannot support audit reliance, and claiming otherwise is the larger exposure. Revisit with a hash chain if a user actually needs it (§8.2) |
| **D-15** | **[draft3]** Does PMP record file-level provenance for AI-generated code? | (a) no; (b) yes, joining ledger and trace links | **(b)** — cheap given v3's existing data, and the only way to evidence an indemnity claim or answer a disclosure request. §8.2, P8-C11 |

---

## 16. Appendix

### 16.1 Glossary

| Term | Meaning |
|---|---|
| Spec | A per-feature document with requirements, acceptance criteria, and clarifications (`S0001`) |
| Requirement | A single testable statement inside a spec (`R0001`), with kind and MoSCoW priority |
| Acceptance criterion | A Given/When/Then statement tied to one requirement (`AC0001`) |
| Clarification | An open question raised by `[NEEDS CLARIFICATION: ...]` (`C0001`) |
| Trace link | A typed edge between requirement, task, file, symbol, test, or external issue |
| Drift | A detected disagreement between spec, plan, code, or tracker (codes D1–D11) |
| Fingerprint | A short hash of requirement text or a git revision used to detect change |
| Ledger | `.pmp/usage.jsonl`, the append-only record of every AI call with tokens and cost |
| Gate | A condition that blocks Implement: dependency, research, debate, spec, drift, budget |
| Hand-off | Implement With Agent: PMP prepares context and lets Copilot agent mode write code using PMP tools. The agent writes the files, so PMP's path-safety enforcement does not apply (§7.3) |
| **Provenance** | **[draft3]** The record of which model, provider, and parameters produced a given file, joining the usage ledger to trace links (§8.2) |
| **Untrusted content** | **[draft3]** Text from the workspace, a tracker, or a model: data to be described, never instructions to follow (§3.5, I13) |

### 16.2 End-to-End Walkthrough (Target Experience)

1. Open a workspace with some code. The onboarding wizard offers "Start from a spec". You type "Invoice PDF download".
2. `@pmp /specify` streams a draft spec with four requirements, three ACs, and one `[NEEDS CLARIFICATION]` about fonts. You save it as `S0001`.
3. The Specs view shows S0001 (draft, 1 open). You run Clarify, answer the font question. Status returns to draft with zero open items.
4. You approve. The spec's content hash is frozen and recorded.
5. Plan From Spec proposes three root tasks; you accept. Each carries `specRef=S0001` and `reqRefs`. The tree shows them with spec badges. The consent dialog said "≈ 4.1k tokens · est. $0.05".
6. You Plan T0010 one level. Children arrive with `reqRefs` validated against the spec. One research task appears: "Evaluate PDF libraries". You debate it, resolve it, mark it complete with a conclusion; the ADR exporter writes `docs/adr/0003-pdf-library.md`.
7. You run Implement With Agent on T0012. Copilot agent mode writes `src/pdf/render.ts` and a test, calls `pmp_recordTrace`, then `pmp_setTaskStatus done`. PMP runs D1/D2, records `completedRev`, and marks the task verified after the test task passes.
8. A teammate edits R0001 to add a footer requirement. On their save, the Problems panel shows D1 on T0010 and T0012 and D4 for the new AC. They run Plan From Spec for the delta.
9. You run Sync With Tracker. S0001 becomes epic PROJ-41; tasks become stories with `[PMP:T0012]` markers. A week later someone closes PROJ-52 in Jira; D10 appears and one click syncs the status.
10. The Usage view shows the feature cost $1.84 across 23 calls; the status bar has been showing the running total the whole time.

### 16.3 Relationship to Existing Documents

| Document | Status after v3 |
|---|---|
| `PlanMyProject_v3_Performance.md` | **[draft2]** Companion measurement record; source for §2.6, §4.4, §4.5, §6.4, and §14.4. Kept alongside this document; its §15 reproduction steps become `test/bench/` in P0-C1 |
| `PlanMyProject_v3_Security.md` | **[draft3]** Companion security and legal review; source for §3.5, §12.4, the P0-D tasks, §8.2 provenance, R13–R16 and D-13–D-15. Its §10 reproduction commands become `test/security.test.ts` in P0-D4. The legal half is issue-spotting for counsel, not advice, and provider terms must be re-checked before publication |
| `PlanMyProject_v2_Spec.md` | Frozen as the v2 specification; referenced for unchanged behavior |
| `FEATURE_PROGRESS.md` | Continues as the running progress report; P5–P10 tables are appended as work proceeds |
| `Improvements.md` | Historical (P1–P3) |
| `constitution.md` | Updated to 1.1 in P10-H3 |
| `FEATURE_CHECKLIST.json` | Grows with every ✅ in this document |
| `CLAUDE.md` | Updated in P10-H7 with the new module map |

---

*End of PlanMyProject v3 Spec — 3.0.0-draft2, amended against `PlanMyProject_v3_Performance.md`*
