# PlanMyProject v3 — Performance Analysis and Surface Options

**Companion to `PlanMyProject_v3_Spec.md`**

Date: 2026-09-17 | Baseline: `pmp-v2-rewrite` @ `7266bca` | Measurements taken on this machine against the compiled `out-test/` build

---

## Table of Contents

1. [Verdict](#1-verdict)
2. [Method](#2-method)
3. [Baseline Measurements (v2 Today)](#3-baseline-measurements-v2-today)
4. [The Blocker: Two Coupled Defects](#4-the-blocker-two-coupled-defects)
5. [Path 1 — Activation and Loading Time](#5-path-1--activation-and-loading-time)
6. [Path 2 — The Mutation Write Path](#6-path-2--the-mutation-write-path)
7. [Path 3 — The Drift Engine](#7-path-3--the-drift-engine)
8. [Path 4 — The AI Request Path](#8-path-4--the-ai-request-path)
9. [Usability Implications Beyond Milliseconds](#9-usability-implications-beyond-milliseconds)
10. [Performance Budgets to Hold](#10-performance-budgets-to-hold)
11. [Mitigations That Keep v3 a VS Code Extension](#11-mitigations-that-keep-v3-a-vs-code-extension)
12. [Alternative Surfaces](#12-alternative-surfaces)
13. [Recommended Target Architecture](#13-recommended-target-architecture)
14. [Impact on the v3 Roadmap](#14-impact-on-the-v3-roadmap)
15. [Appendix — Reproducing the Measurements](#15-appendix--reproducing-the-measurements)

---

## 1. Verdict

**v3 is viable as a VS Code extension, but not on the current execution model.** Four findings decide this, and the first was not what this analysis set out to look for.

1. **There is a live data-loss bug in the plan file parser.** Every task's metadata is truncated at the first colon on read, which in practice means everything before `createdAt` is discarded. Measured on a single round trip: `dependsOn` → `[]`, `linkedFiles` → `[]`, `goalRef` → `null`, `confidence` → `null`, `origin` → `"manual"`, `fileSendPolicy` → `"global"`. Because `persistAndRefresh()` re-parses its own output and assigns it back to the in-memory plan, this happens **after every single mutation**. A task blocked by an unresolved dependency becomes "Ready to Implement" after one save, and a per-task `fileSendPolicy: "never"` privacy setting silently reverts to the global default. Details and the one-line cause in §4.1.

2. **There is a severe performance defect in the same write path.** Building the execution queue is super-linear: 21 ms at 100 tasks, 1.66 s at 500, 18.8 s at 1,000, and **117 s at 2,000** — measured, not extrapolated. It accounts for 99% of plan serialization time, and serialization runs on every plan mutation.

3. **The two defects mask each other, so they must be fixed together.** The queue's pathological path only triggers when dependency edges resolve to leaf tasks — and defect 1 destroys those edges on the first save. Today, users are largely spared the performance cliff *because* their dependency data is being thrown away. Measured at 500 tasks: 2,602 ms with dependencies intact, 66 ms once they have been wiped. **Fixing the parser alone would make the write path roughly 40× slower overnight.** §4.3.

4. **The v3 feature set puts a continuously-running analysis engine on the extension host**, which is the wrong place for it. The drift engine, trace graph, and spec parsing are exactly the workload that language servers exist to isolate. Left on the extension host, they contend with every other extension the user has installed.

The queue fix is small and decisive: precomputing traversal ranks once and inserting into a sorted array instead of re-sorting inside the dependency walk brings the same work to 0.5–2.6 ms at every size tested — 641× faster at 500 tasks, roughly 9,800× at 1,000.

The recommended response to finding 4 is not to abandon the extension. It is to **extract the engine from the editor**. 28 of the 59 source modules are already free of any `vscode` import across their full transitive closure — the entire model, parser, queue, prompt builder, response parser, and signature extractor. The architectural boundary v3 needs already exists in the codebase; it has simply never been drawn.

> **A note on how findings 1 and 3 surfaced.** Neither came from reading the code. They came from a benchmark that measured the same operation two ways — on a directly constructed plan and on one round-tripped through markdown — and got answers 40× apart. The discrepancy was the signal. This is the argument for §15: benchmarks belong in the repository, because they find things tests do not.

---

## 2. Method

All figures labelled **measured** come from running the compiled build on this machine. Figures labelled **projected** are reasoned from those measurements plus the v3 specification, and are marked as such.

| What | How |
|---|---|
| Queue, parse, serialize timings | Synthetic plans of 100–2,000 tasks with realistic shape (roots → features → leaves, 1 research task per group, dependency edges between siblings, 2 linked files and a rationale per leaf). Median of 3–5 iterations after a warm-up call. |
| Cost attribution | Timed each stage of `serializePlanMarkdown` separately against the same plan. |
| Fix validation | Reimplemented `sortLeavesByDependencies` with precomputed ranks and binary insertion; timed against the shipping implementation on identical inputs. |
| Module load | `require()` of the vscode-free subset, timed from a cold process. |
| Dependency closure | Static import-graph walk over `src/` computing transitive reachability of `import ... from "vscode"`. |
| Scan cache | Synthesized a `WorkspaceScan` at the configured 500-file ceiling with signatures, then timed `JSON.parse` / `JSON.stringify`. |
| Filesystem RPC | Static inventory of `vscode.workspace.fs.*` call sites. |

Numbers will differ on other hardware. The **shape** of the curves and the **ratios** between implementations are what matter, and those are machine-independent.

---

## 3. Baseline Measurements (v2 Today)

### 3.1 Plan file operations

Measured, at increasing plan size. "md KB" is the size of the serialized plan file.

| Tasks | md KB | Parse | Serialize | Queue build |
|---:|---:|---:|---:|---:|
| 100 | 45 | 4.7 ms | 18.3 ms | 21.3 ms |
| 250 | 111 | 8.7 ms | 203.7 ms | 323.6 ms |
| 500 | 223 | 16.3 ms | 1,525 ms | 1,657 ms |
| 1,000 | 446 | 23.5 ms | 12,988 ms | 18,774 ms |
| 2,000 | 895 | 60.5 ms | **117,042 ms** | *>110 s* |

**Parsing is healthy** — roughly linear, 23 ms for a 446 KB file. The parser is not a problem at any plausible plan size.

**Serialization is not.** It grows about 8× per doubling of task count, which is consistent with cubic behaviour.

### 3.2 Cost attribution within serialization

Measured at 500 tasks (418 leaves):

| Stage | Time | Share |
|---|---:|---:|
| `duplicatePlanDocument` | 1.3 ms | 0.1% |
| `recomputeDerivedStatuses` | 0.4 ms | <0.1% |
| **`buildExecutionQueue`** | **1,563.8 ms** | **99.1%** |
| `getTaskBlockReason` for all blocked tasks | 0.4 ms | <0.1% |
| Markdown rendering and the rest | ~12 ms | 0.8% |
| **Total `serializePlanMarkdown`** | **1,578.4 ms** | |

Everything except the queue is fast. The queue is the whole story.

### 3.3 Module loading

| Measurement | Value |
|---|---:|
| Compiled output | 712 KB across 59 JavaScript modules, unbundled |
| Total JavaScript bytes | 246 KB |
| `require()` of 26 vscode-free modules, cold | 36.5 ms |
| Projected full activation graph (59 modules) | ~70–90 ms |

Every module is a separate `require` with its own stat, read, and compile. `extension.ts` constructs `PlanController`, whose constructor eagerly imports the parser, storage, AI, generation, research, debate, UI, and scanner layers — so effectively the entire graph loads before activation returns. Only `CodeLensProvider` is dynamically imported.

### 3.4 Scan cache

At the configured 500-file ceiling with signature extraction on:

| Measurement | Value |
|---|---:|
| `scan-cache.json` size | 0.33 MB |
| `JSON.parse` cost | 4.9 ms — **on the activation path**, via `scanService.loadCached()` |
| `JSON.stringify` cost | 2.8 ms — after every scan |

Modest today. It scales with `scanner.maxFilesScanned`, which the settings allow users to raise; at 2,000 files this becomes a 1.3 MB file and roughly 20 ms of activation-path parsing.

### 3.5 Filesystem access

21 call sites use `vscode.workspace.fs`:

| Operation | Sites |
|---|---:|
| `readFile` | 7 |
| `createDirectory` | 6 |
| `writeFile` | 5 |
| `stat` | 1 (inside `uriExists`, called from many places) |
| `readDirectory` | 1 (the scanner's directory walk) |
| `delete` | 1 |

Every one of these is an RPC round trip from the extension host to the main process file service. A full workspace scan issues one `readDirectory` per directory plus one `readFile` per source file, up to the 500-file ceiling — so on the order of 550–600 round trips per scan.

Notably, `PathSafetyChecker` already imports `node:fs` directly. The codebase uses both access paths inconsistently, and the faster one is the exception.

### 3.6 Dependency closure

| Category | Modules |
|---|---:|
| Import `vscode` directly | 20 |
| Reach `vscode` transitively | 31 |
| **Free of `vscode` entirely** | **28** |

The vscode-free set is the complete engine:

```
model/          TaskNode, PlanModel, ProjectGoal, WorkspaceScan, ResearchIndexEntry
parser/         PlanParser, SchemaUpgrader
queue/          QueueBuilder
ai/             types, PromptBuilder, ResponseParser, ClaudeProvider, OpenAIProvider, ApiKeyError
scanner/        SignatureExtractor, ModuleGrouper, FeatureInferrer, LanguageDetector
research/       TagExtractor
util/           IdGenerator, PathSafetyChecker, PromptMasker, GoalParser, FileSendPolicyResolver
```

This is the single most important structural fact in this document. It is repeated in §12 and §13 because every alternative surface depends on it.

---

## 4. The Blocker: Two Coupled Defects

### 4.1 Defect one — plan metadata is destroyed on every read

`parseInlineMetadata` ([src/parser/PlanParser.ts:358](src/parser/PlanParser.ts#L358)) opens with a prefix-stripping line:

```typescript
const payload = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
```

The intent is to drop a leading `pmp:`-style prefix. But the task-metadata caller has **already stripped that prefix** before calling:

```typescript
const metadata = parseInlineMetadata(
  trimmed.replace(/^<!--\s*pmp:/, "").replace(/\s*-->$/, "")
);
```

So `raw` arrives as `id=T0002;parent=ROOT;…;createdAt=2026-09-17T18:22:36.390Z;…`, and `indexOf(":")` finds the first colon **inside the ISO timestamp**. Everything before it is discarded.

The serializer writes fields in this order:

```
id · parent · type · origin · goalRef · confidence · dependsOn · linkedFiles · fileSendPolicy · createdAt · completedAt · notes · archivedDebatePath
```

Every field up to `createdAt` is lost. Measured on one round trip of a task carrying all of them:

| Field | Before | After one save | |
|---|---|---|---|
| `dependsOn` | `["T0001"]` | `[]` | **lost** |
| `linkedFiles` | `["src/pdf/render.ts"]` | `[]` | **lost** |
| `goalRef` | `"G0001"` | `null` | **lost** |
| `confidence` | `0.88` | `null` | **lost** |
| `origin` | `"ai-generated"` | `"manual"` | **lost** |
| `fileSendPolicy` | `"always"` | `"global"` | **lost** |
| `notes` | `"Use pdfkit"` | `"Use pdfkit"` | survives — it sits after `createdAt` |
| `completedAt` | `null` | `null` | survives |

The consequence for the execution queue, measured on the same two-task plan:

```
blocked before round trip: [T0002]   ready: []
blocked after  round trip: []        ready: [T0001, T0002]
```

**A task blocked by an unresolved research dependency is presented as ready to implement**, which is the exact failure the research gate exists to prevent. A per-task `fileSendPolicy: "never"` reverting to `"global"` is a privacy regression of the same kind.

This happens on every mutation, because `persistAndRefresh()` re-parses its own serialized output and assigns the result back to `this.plan` — so the corruption enters memory immediately and is written to disk on the next mutation. The plan file degrades progressively toward a structure-only document.

**Why 72 tests miss it.** Task identity, titles, status, and parent/child nesting all survive, because they come from the task *line* rather than the metadata comment: IDs and titles from the line regex, status from the checkbox, nesting from indentation, and `type` from the leading icon via `inferTaskType`. A round-trip test that compares tree shape and task titles passes cleanly while every metadata-only field is being dropped.

The goal-metadata path escapes by accident: its caller does **not** pre-strip the prefix, so the same line consumes `pmp:` as intended and only mangles a `goal-meta:id` key whose value is recovered from the goal line anyway.

**The fix**, verified against the full field set: delete the prefix-stripping line from `parseInlineMetadata` and have each caller pass only the payload. The task caller already does. The goal caller needs `.replace(/^pmp:goal-meta:/, "")` added. With that change all thirteen fields round-trip intact.

> **Recommendation P0-A.** This is a correctness and privacy bug, not a performance one. Fix it first — but read §4.3 before shipping it alone.

### 4.2 Defect two — execution queue build is super-linear

#### Root cause

In `sortLeavesByDependencies` ([src/queue/QueueBuilder.ts:69](src/queue/QueueBuilder.ts#L69)), three compounding costs stack:

```typescript
// 1. Called inside the dependency-walk loop, on every insertion:
queue.push(nextTask);
queue.sort((a, b) => compareTaskOrder(plan, a, b));   // line 108

// 2. Each comparison calls getTaskTraversalRank twice:
function compareTaskOrder(plan, a, b) {
  const rankA = getTaskTraversalRank(plan, a.id);
  const rankB = getTaskTraversalRank(plan, b.id);
  ...
}

// 3. Each rank lookup walks the ENTIRE task tree from all roots:
function getTaskTraversalRank(plan, taskId) {   // line 134
  const visit = (id) => { ...; for (const childId of task.children) visit(childId); };
  for (const rootId of plan.rootTaskIds) visit(rootId);
  return rank;
}
```

The full tree is walked once per comparison, the queue is re-sorted once per insertion, and there are O(n) insertions. That is O(n³ log n) in the worst case.

`FEATURE_PROGRESS.md` records this as item **C5** ("`queue.sort()` inside dependency-walk loop — O(n³) in the worst case for large plans"), classified as a code-quality issue. The measurements show it is not a code-quality issue. It is the dominant cost of the extension's most frequent write operation.

#### Why it matters more than the raw numbers suggest

`serializePlanMarkdown` is called from `PlanRepository.savePlan`, which is called from `PlanController.persistAndRefresh()`, which runs after:

- Add task, add root task, delete task
- Plan task (after AI generation commits)
- Implement task (after files are written)
- Every debate message and every debate resolution action
- Mark research complete
- Set task file-send policy
- Rebuild queue, set project goal, import goal statement
- Undo

It is also called a second time on the same tick, because `persistAndRefresh` re-parses the serialized string to refresh in-memory state. The parse is cheap; the serialize is not.

So on a 500-task plan, typing a message in the debate panel costs a 1.6-second extension-host stall. On a 1,000-task plan it is 19 seconds. Users will read this as a hang.

### 4.3 The two defects mask each other

The queue's pathological path is reached only when a leaf task's `dependsOn` entries resolve to **other leaf tasks** — those are the edges that drive insertions into the ready queue and trigger the re-sort. Defect one destroys exactly those edges on the first save.

Measured on identical plans, the only difference being whether the plan has been through one markdown round trip:

| Tasks | Dependency edges | Resolving to a leaf | Queue build |
|---:|---:|---:|---:|
| 250, as authored | 139 | 139 | 508.7 ms |
| 250, after one save | 0 | 0 | 14.5 ms |
| 500, as authored | 278 | 278 | 2,602.1 ms |
| 500, after one save | 0 | 0 | 66.0 ms |

So the performance cliff described in §4.2 is **largely invisible in production today**, because users' dependency data is being thrown away before it can be walked. The plans that do hit multi-second serializes are those built up within a single session, before the first save flattens them.

This has a direct sequencing consequence:

> **Fixing the parser without fixing the queue would make the write path roughly 40× slower overnight**, and would look to users like the metadata fix caused a severe regression. Ship both in the same change, with a benchmark asserting the combined result.

It also revises the §3.1 figures' interpretation. The serialize timings there were taken on directly constructed plans with intact dependencies — which is what a **correct** implementation will face. They are the right numbers to design against, not an overstatement.

### 4.4 The queue fix, validated

Precompute traversal ranks once in a single O(n) walk, then maintain the ready-queue as a sorted array with binary insertion instead of re-sorting:

| Tasks | Current | Fixed | Speedup |
|---:|---:|---:|---:|
| 100 | 21.3 ms | 0.54 ms | 39× |
| 250 | 323.6 ms | 1.20 ms | 270× |
| 500 | 1,656.7 ms | 2.58 ms | 641× |
| 1,000 | 18,773.7 ms | 1.91 ms | ~9,800× |
| 2,000 | >110,000 ms | ~4 ms | >25,000× |

Same output ordering, same semantics. The change is confined to one function plus a rank map threaded through `compareTaskOrder`.

> **Recommendation P0-B.** Land this together with the parser fix, before P5 begins. It is currently scheduled as `P10-H4` ("Queue rank precompute") in the last phase of the v3 roadmap. Move it to the front of the P4 finishing work. Every subsequent phase adds work to the write path this defect dominates — and per §4.3, the parser fix cannot ship safely without it.

### 4.5 Recommended fix sequence

One change, one benchmark, one test, in this order:

1. Add a round-trip **fidelity test** asserting that all thirteen task metadata fields survive serialize → parse. It should fail on the current code.
2. Add a **benchmark** asserting queue build under 10 ms at 2,000 tasks with dependencies intact. It should fail on the current code.
3. Fix `parseInlineMetadata` (§4.1) — the fidelity test passes, the benchmark gets dramatically worse.
4. Fix `sortLeavesByDependencies` (§4.4) — the benchmark passes.
5. Add a **regression test** asserting that a task with an unresolved dependency stays in the blocked queue section across a round trip.

Steps 1 and 2 first is deliberate: it proves both defects exist before either is touched, and proves the interaction in §4.3 rather than asserting it.

---

## 5. Path 1 — Activation and Loading Time

### 5.1 What VS Code measures

VS Code records per-extension activation time and surfaces it in **Developer: Show Running Extensions**. Extensions that consistently activate slowly degrade the editor's startup profile, and on slower machines a multi-hundred-millisecond activation is user-visible as a delay before the sidebar populates.

Practical bands: under 100 ms is unremarkable, 100–300 ms is acceptable for a feature-rich extension, 300 ms–1 s is noticeable, and beyond 1 s users perceive the editor as slow to become usable.

### 5.2 v2 today

`activate()` in `PlanController` does the following before returning:

```typescript
async activate(): Promise<void> {
  // registers tree provider + dynamically imports CodeLensProvider
  this.registerCommands();
  this.registerWatchers();
  await this.scanService.loadCached();   // reads + JSON.parses scan-cache.json
  await this.refreshPlanState();         // reads + parses planmyproject.md, renders tree
}
```

Estimated composition, combining measured parts:

| Component | Cost |
|---|---:|
| Module loading (59 unbundled modules) | ~70–90 ms (projected from 36.5 ms / 26 modules) |
| Scan cache read (RPC) + `JSON.parse` | ~10 ms |
| Plan file read (RPC) + parse | ~10–30 ms |
| Provider/command/watcher registration | ~10 ms |
| **Total (projected)** | **~100–140 ms** |

Acceptable. Note that both `await`s are I/O that could run after activation returns.

### 5.3 v3, if built as specified without care

The spec adds, per §4.2 of the v3 document, six new service groups and roughly 50 new modules. If services are constructed in `PlanController`'s constructor as all current services are, and if the new file-backed state loads on the activation path:

| Added component | Projected cost | Notes |
|---|---:|---|
| ~50 more unbundled modules | +60–80 ms | Linear in module count |
| Spec discovery glob (`specs/**/spec.md`) | +10–100 ms | Workspace glob; scales with repo size |
| Parse N spec files | +5–20 ms each | 20 specs ≈ 100–400 ms |
| Constitution load + render | +5 ms | |
| Trace cache load + `JSON.parse` | +5–20 ms | Grows with task and link count |
| Usage ledger open | +2 ms | Append-only; rollups should be lazy |
| Chat participant + 9 LM tool registrations | +5 ms | Declarative contributions are free; the API calls are not |
| 4 tree providers, diagnostics collection | +5 ms | |
| **Initial drift run, if triggered at activation** | **+500–3,000 ms** | See §7 |
| **Projected total** | **~400–700 ms**, or **>1.5 s with an activation-time drift run** | |

That crosses from "unremarkable" into "noticeable", and with an eager drift check into "slow".

### 5.4 Activation event risk

v2 activates on `workspaceContains:planmyproject.md`, `workspaceContains:projectplan.md`, and `onView:planmyproject.tree`. The `workspaceContains` checks with plain filenames are cheap — VS Code resolves them against the workspace file index.

If v3 adds a glob-shaped activation event such as `workspaceContains:specs/**/spec.md`, VS Code must run a workspace search to decide whether to activate, for every window, at startup. **Do not add glob activation events.** The plan file's presence is a sufficient trigger, and the Specs view supplies `onView:planmyproject.specs` for workspaces that have specs but no plan.

---

## 6. Path 2 — The Mutation Write Path

This is the path users hit most often, and the one v3 loads most heavily.

### 6.1 Current sequence

```
persistAndRefresh()
  ├─ readTextFile(planUri)              RPC round trip — snapshot for the undo stack
  ├─ serializePlanMarkdown(plan)        1,578 ms @ 500 tasks   ← measured
  ├─ writeFile(planUri)                 RPC round trip
  ├─ parsePlanMarkdown(serialized)      16 ms @ 500 tasks      ← measured
  ├─ maybeArchiveDebateEntries()        Promise.all over ALL tasks, each may touch disk
  └─ render()                           tree fire + 3 setContext calls
```

Two structural issues beyond the queue defect:

- **The undo snapshot re-reads the file from disk** on every mutation, even though the previous serialized string was in memory one tick earlier. This is a spare RPC round trip per mutation.
- **`maybeArchiveDebateEntries` iterates every task** on every persist and constructs a fresh `DebateArchiver` each time, even when no debate log is near the archive threshold.

### 6.2 With the queue fixed

| Stage | 500 tasks | 1,000 tasks |
|---|---:|---:|
| Undo snapshot read (RPC) | ~2 ms | ~3 ms |
| Serialize | ~15 ms | ~25 ms |
| Write (RPC) | ~3 ms | ~5 ms |
| Re-parse | ~16 ms | ~24 ms |
| Archive sweep | ~2 ms | ~4 ms |
| Render | ~5 ms | ~8 ms |
| **Total (projected)** | **~43 ms** | **~69 ms** |

That is within budget. Everything below depends on the queue fix landing first.

### 6.3 What v3 adds to this path

| Addition | Projected cost | Mitigation |
|---|---:|---|
| Drift check (spec + plan detectors) | 100 ms–2 s | Debounce, run incrementally, move off the host (§12) |
| Diagnostics collection rebuild | 5–30 ms | Diff findings; only `set` changed URIs |
| 4 tree views firing full invalidation | 10–40 ms | Fire scoped elements, not `undefined` |
| Optional `sync.onPersist` push | **200 ms–60 s** | Never on this path; background queue only |
| Spec index section re-serialization | ~2 ms | Negligible |

`sync.onPersist` as specified is the sharpest trap in the v3 document. A Jira push of 50 tasks, sequential with the specified 200 ms inter-request gap plus 200–800 ms of network latency each, takes 20–50 seconds. Wiring that to a debounced persist means an editor that periodically spends a minute talking to Jira. It must be a background job with its own queue, progress reporting, and cancellation — never a step in a save.

---

## 7. Path 3 — The Drift Engine

The drift engine is the feature most likely to make v3 feel slow, because unlike planning and implementation it runs **without the user asking**.

### 7.1 Trigger frequency

The spec defines five triggers: spec save, plan save, git state change (throttled to 10 s), manual verify/analyze, and pre-implement. Git state changes are the concerning one — VS Code's Git extension refreshes repository state on file saves, branch operations, and its own polling interval. During an active editing session, a 10-second throttle means **up to six full drift runs per minute**, none of them user-initiated.

### 7.2 Cost per detector

Projected, for a 500-task plan with 20 specs and 2 linked files per task:

| Detector | Work per run | Projected cost | Risk |
|---|---|---:|---|
| D1 stale spec | Hash compare over `reqHashes` | 2–10 ms | Low |
| **D2 missing link target** | **`stat` per linked file — ~1,000 RPC round trips** | **200 ms–1 s** | **High** |
| D3 code changed after done | Git diff per done task, or file hash compare | 50–500 ms | High |
| D4 requirement uncovered | Graph traversal | 5–20 ms | Low |
| D5 AC unverified | Test file existence — more `stat` calls | 50–200 ms | Medium |
| D6 orphan task | In-memory check | 2 ms | Low |
| **D7 unplanned change** | **Merge-base + diff against default branch — git process spawns** | **50–800 ms** | **High** |
| D8 status mismatch | Depends on D2/D3 results | reuses above | Medium |
| D9 constitution conflict | String matching over constraints | 5–20 ms | Low |
| D10 external status | Cached sync state only, no network | 2 ms | Low |
| D11 blocked but implemented | Reuses D3 | reuses above | Low |
| **Full run (projected)** | | **0.5–3 s** | |

A 0.5–3 second run every 10 seconds means the extension host is busy with unsolicited analysis a meaningful fraction of every editing session.

### 7.3 The two specific hazards

**Symbol resolution.** §6.2 of the spec defines D2 as including "symbol not found by scanner or document symbols". Resolving symbols through `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)` activates the language server for each file. On a TypeScript project, the first such call on a cold file can take 100 ms to 2 s. Doing this in bulk across a few hundred linked symbols would take minutes and would hammer the TypeScript server. **Symbol checks must come from the scanner's own extracted signatures**, which are already cached. The document symbol provider should be used only on demand, for one task, when the user explicitly asks.

**Existence checks.** D2 and D5 together issue on the order of 1,500 `stat` calls per run through `vscode.workspace.fs`. Each is an RPC round trip on the channel every other extension shares. These should be answered from a file-existence cache invalidated by the file watcher, not re-issued per run — turning a per-run O(links) RPC storm into O(changed files) watcher events.

### 7.4 Required design change

The spec already calls for incremental drift in `P10-H4` ("when only one spec or one task changed, run detectors for the affected subgraph"). That must move from a late optimization to the **initial design**. A drift engine that recomputes everything on every trigger cannot meet any reasonable budget.

---

## 8. Path 4 — The AI Request Path

### 8.1 Pre-flight estimation blocks a UI action

The spec's `cost.preflightMode: "exact"` uses the provider's token-counting endpoint before showing the consent dialog. For Claude that is a network round trip of 100–400 ms; for Copilot, `model.countTokens()` is an async RPC.

The consent dialog is a response to a direct user action — clicking "Plan Task". Inserting a network call before the modal appears makes the button feel broken. **Show the dialog immediately with a heuristic estimate, and refine the figure in place if the exact count arrives before the user decides.** Reserve `"exact"` for the budget enforcement check, which can run after consent.

### 8.2 Ledger growth

`.pmp/usage.jsonl` is append-only with no rotation specified. At roughly 300 bytes per entry and 50 AI calls per day, that is 15 KB/day and about 5.5 MB per year. Rollups as specified read and parse the whole file.

| Ledger age | Size | Rollup parse cost (projected) |
|---|---:|---:|
| 1 month | 0.5 MB | ~5 ms |
| 1 year | 5.5 MB | ~50 ms |
| 3 years | 16 MB | ~150 ms |

The status bar shows a session cost that requires a rollup. If that recomputes from the full file on each AI call, it degrades steadily over the life of a project. **Keep running totals in memory, persist daily aggregates alongside the raw log, and rotate the raw log monthly.**

### 8.3 Streaming and provider changes are a net win

`P8-C1` converts the Claude and OpenAI providers to streaming. Beyond usage capture, this removes a real latency problem: the current Claude provider is non-streaming with `max_tokens: 1800`, so the user sees nothing until the entire response arrives, and long task lists are silently truncated. Streaming also makes the existing cancellation token meaningful mid-response rather than only between requests.

---

## 9. Usability Implications Beyond Milliseconds

### 9.1 The extension host is shared

All extensions in a window run in a single extension host process. A 1.6-second synchronous serialize does not freeze the editor UI — the renderer is a separate process — but it does block every other extension's event handlers for that duration. GitLens decorations, ESLint fixes, and any other extension's command handlers queue behind it.

This is the strongest argument for moving heavy analysis off the extension host entirely (§12). Language servers already work this way for exactly this reason.

### 9.2 CodeLens density

At 4 lenses per task line and 1,000 tasks, `provideCodeLenses` returns 4,000 CodeLens objects. VS Code resolves lenses lazily for visible ranges, but the provider still builds and returns the full array — and today it **re-parses the entire document** to do so ([src/ui/CodeLensProvider.ts:6](src/ui/CodeLensProvider.ts#L6)), on every document change and every lens refresh.

v3 adds hover, definition, and document-link providers over the same files. Implemented the same way, each would re-parse independently, and hovers fire on mouse movement. **All four providers must share one parsed-document cache keyed by `document.version`.**

### 9.3 The plan file becomes a merge-conflict surface

A 1,000-task plan is a 446 KB single file that every mutation rewrites in full. For a team, that means:

- Constant git diff noise — a one-word title edit rewrites the derived execution queue section, touching lines throughout the file.
- Frequent merge conflicts on a file everyone edits, which the spec already acknowledges for debate blocks but which applies to the whole document.
- Slow `git blame` and review — reviewers cannot easily see what actually changed.

Moving specs into `specs/SNNNN-slug/spec.md` helps, and is one of the better structural decisions in the v3 document. Consider going further: **treat the execution queue section as derived and regenerate it on read rather than serializing it into the committed file**, or write it to a separate generated file that is gitignored. The queue is computed from the tree; storing it is what makes every mutation touch the whole document.

### 9.4 Notification and Problems noise

D7 ("unplanned change") reports any file changed since the merge base that is not linked to an active task. On a real branch, that is most of the diff. The spec sets it to Information severity with ignore globs, which helps, but Problems-panel entries compete with compiler errors — the panel users rely on to find real defects. **Default D7 to manual runs only**, and surface it in the Drift view rather than Problems.

### 9.5 Status bar crowding

v2 has one status bar item (scan state plus goal warning). v3 adds drift score and session cost, for three PlanMyProject items in a bar shared with language mode, line/column, git branch, problems counts, and every other extension. **Consolidate into a single item** whose text rotates or summarizes, with the detail in a hover and a click that opens the relevant view.

### 9.6 Retained WebViews hold memory

`DebatePanel` sets `retainContextWhenHidden: true`. VS Code's own guidance is to avoid this because each retained webview keeps a full renderer context alive. v3 adds a Spec Review panel and a Usage Dashboard panel. Three retained webviews is tens of megabytes held for panels the user may have opened once.

**Serialize webview state and restore it on reveal** instead, or better, prefer native UI (§11.9).

### 9.7 Feedback loops

The write path triggers the file watcher, which the `isSelfWriting` flag suppresses. v3 adds a second loop: plan write → git status refresh → drift trigger → findings → diagnostics → possible auto-fix → plan write. Each new trigger source needs an explicit guard, and the guards need to compose. A single `isSelfWriting` boolean will not be sufficient once three subsystems write files; this needs a proper write-origin token threaded through.

---

## 10. Performance Budgets to Hold

Proposed budgets, to be asserted in tests where possible:

| Path | Budget | Enforcement |
|---|---|---|
| Activation, cold | **< 150 ms** | Assert in an integration test; check Runtime Status per release |
| Activation, warm | **< 80 ms** | |
| Plan mutation → file written | **< 50 ms @ 1,000 tasks** | Unit benchmark in CI, fails the build on regression |
| Parse plan file | **< 30 ms @ 1,000 tasks** | Already met (23.5 ms measured) |
| Build execution queue | **< 10 ms @ 2,000 tasks** | Met by the validated fix (~4 ms) |
| Incremental drift (one spec changed) | **< 100 ms** | |
| Full drift sweep | **< 2 s, off the extension host** | |
| CodeLens provide | **< 20 ms @ 1,000 tasks** | Requires the shared parse cache |
| Any single extension-host block | **< 100 ms** | The hard rule; anything longer moves off-host |
| Tracker sync | **No budget — background only** | Must never block a user action |

Alongside the timing budgets, one correctness gate belongs in the same suite:

| Invariant | Enforcement |
|---|---|
| **Every task metadata field survives serialize → parse** | Field-by-field round-trip assertion (§4.5 step 1) |
| **A blocked task stays blocked across a round trip** | Queue-section assertion (§4.5 step 5) |

The CI gate matters more than the specific numbers. A benchmark suite that fails the build when the mutation path regresses would have caught the queue defect the day it was written — and the field-level fidelity test would have caught the parser bug, which 72 passing tests did not.

---

## 11. Mitigations That Keep v3 a VS Code Extension

If the decision is to stay a single extension, these are the required changes, in priority order.

| # | Mitigation | Effort | Impact |
|---|---|---|---|
| **1** | **Fix `sortLeavesByDependencies`** (precomputed ranks, binary insertion) | S | 641× on the write path. Non-negotiable. |
| **2** | **Bundle with esbuild** into a single `out/extension.js` | S | Removes ~50–70 ms of module loading; also shrinks the VSIX |
| **3** | **Lazy service construction** — build SpecService, TraceService, DriftEngine, CostService, SyncService on first use, not in the constructor | M | Keeps activation flat as features are added |
| **4** | **Move I/O off the activation path** — return from `activate()`, then load the scan cache, specs, and trace cache in the background; render the tree progressively | M | Cuts perceived activation to registration only |
| **5** | **Incremental drift from day one** — a dirty-set model, not full recompute | L | The difference between viable and not |
| **6** | **File-existence cache** invalidated by the file watcher, replacing per-run `stat` storms | M | Removes ~1,500 RPC round trips per drift run |
| **7** | **Never bulk-invoke `executeDocumentSymbolProvider`** — resolve symbols from scanner signatures; use the symbol provider only on explicit single-task requests | S | Avoids multi-minute stalls and language-server thrash |
| **8** | **One shared parsed-document cache** keyed by `document.version`, used by CodeLens, hover, definition, and document links | S | Removes 3 redundant full-document parses |
| **9** | **Virtual documents instead of WebViews** for reports — a `TextDocumentContentProvider` on a `pmp:` scheme for drift reports, usage exports, and the audit log | M | Cheaper than webviews, and gets find, copy, diff, and split-view for free |
| **10** | **Drop `retainContextWhenHidden`**; serialize and restore panel state | S | Reclaims tens of MB |
| **11** | **Scoped tree invalidation** — fire the changed element, not `undefined` | S | Avoids full re-serialization of 4 trees per mutation |
| **12** | **Use `node:fs` for `file:` scheme paths**, falling back to `workspace.fs` for virtual schemes | M | 10–50× on scanner I/O; precedent already exists in `PathSafetyChecker` |
| **13** | **Background sync only**, with a job queue, progress, and cancellation; remove `sync.onPersist` as specified | M | Keeps 20–60 s network work out of the editor |
| **14** | **Rotate the usage ledger**; keep running totals in memory, persist daily aggregates | S | Prevents steady degradation over a project's life |
| **15** | **Heuristic pre-flight estimate**, refined asynchronously; never block the consent modal on a network call | S | Keeps a click feeling like a click |
| **16** | **Avoid glob activation events** | S | Protects editor startup |

Items 1, 2, 7, 8, 10, and 11 are each a day or less and together remove most of the risk.

---

## 12. Alternative Surfaces

Even with every mitigation above, one structural problem remains: a continuously-running analysis engine sharing a process with every other extension. This section covers where else the work could live.

### 12.0 Prerequisite — extract a headless core

**This is the enabling move for everything below, and it is nearly free.** 28 of 59 modules already have no `vscode` import anywhere in their transitive closure (§3.6). Package them as `@planmyproject/core`:

```
@planmyproject/core          (no vscode, no I/O, pure functions + types)
  model/      TaskNode, PlanModel, ProjectGoal, WorkspaceScan, SpecDocument, TraceLink
  parser/     PlanParser, SpecParser, SchemaUpgrader
  queue/      QueueBuilder
  drift/      detectors (pure: DriftInput → DriftFinding[])
  ai/         PromptBuilder, ResponseParser, PromptBudgeter, PricingTable
  scanner/    SignatureExtractor, ModuleGrouper, FeatureInferrer, LanguageDetector
  util/       IdGenerator, PromptMasker, path normalization
```

The v3 spec already specifies drift detectors as pure functions `(input: DriftInput) => DriftFinding[]` "for testability" — which means it has already, perhaps unintentionally, designed for this boundary. Formalizing it costs little and unlocks every surface below.

Everything that needs a host — file access, secrets, UI, consent — stays in a thin adapter layer per surface.

### 12.1 Language Server (separate process) — recommended primary

Move parsing, the trace graph, drift detection, and the language features into an LSP server process.

| Aspect | Assessment |
|---|---|
| **What moves** | Plan and spec parsing, trace graph, all 11 drift detectors, diagnostics, hover, definition, document links, CodeLens, code actions |
| **What stays in the extension** | Commands, tree views, webviews, consent, secrets, AI calls, sync, Git facade |
| **Why it fits** | Every language feature v3 wants maps directly onto an LSP capability. The protocol already provides incremental document sync, cancellation, and progress. |
| **Performance gain** | Heavy analysis never blocks the extension host. Drift can run continuously without contending with other extensions. |
| **Cost** | One process spawn (~50–100 ms, off the activation path) and result serialization. Adds `vscode-languageclient` / `vscode-languageserver` as dependencies, which conflicts with invariant **I6** (no runtime dependencies) — that invariant should be revisited; it is a means, not an end. |
| **Precedent** | ESLint, TypeScript, rust-analyzer, and every serious analysis extension work this way, for exactly this reason. |

This is the highest-value change after fixing the queue.

### 12.2 MCP server — the portable agent surface

The v3 spec defines nine Language Model Tools (`pmp_getSpec`, `pmp_setTaskStatus`, and so on). These are VS Code-specific and only reachable from Copilot agent mode.

The same nine functions exposed as an **MCP server** work in Claude Code, Claude Desktop, Cursor, Windsurf, JetBrains, and VS Code — which supports MCP directly. The implementation is substantially the same code over a different transport.

| Aspect | Assessment |
|---|---|
| **Reach** | Every MCP-capable agent, rather than one editor's agent mode |
| **Effort vs. LM Tools** | Comparable — both are a schema plus a handler over the core |
| **Risk it removes** | `P7-N5` (Implement With Agent) depends on Copilot agent mode APIs that the spec itself flags as unstable in risk **R3** |
| **Recommendation** | **Build the MCP server first; make the VS Code LM Tools a thin shim over the same handlers.** Strictly more reach for the same work. |

This also reframes goal G1. "Native first" currently means "native to VS Code". Native to the *agent* may serve users better, since the agent is increasingly where implementation happens.

### 12.3 CLI — gives goal G4 real teeth

A `pmp` command-line tool over the same core:

```bash
pmp specify "Invoice PDF download"     # scaffold a spec
pmp plan S0001                         # generate tasks
pmp drift --format sarif               # exit non-zero on Error findings
pmp analyze S0001                      # coverage matrix
pmp sync jira --push                   # headless tracker sync
```

The decisive one is `pmp drift` in CI. An editor-only drift feature is advisory — a developer can ignore the squiggle and merge. **A drift check as a required PR status check makes low drift enforceable**, which is what goal G4 actually asks for. SARIF output renders inline in GitHub's PR review UI with no extra work.

This also moves tracker sync out of the editor entirely (§12.5).

### 12.4 Web extension / vscode.dev

Not currently feasible without work. Blockers found:

- `PathSafetyChecker` imports `node:fs` and relies on `fs.realpath` for symlink-escape checks — neither exists in the browser, and the symlink threat model does not apply there.
- `Buffer` is used throughout for encoding; browsers need `TextEncoder`/`TextDecoder`.
- `node:path` is used in the scanner and controller; needs a path shim or `vscode-uri`.
- The Git facade, child processes, and direct filesystem access are unavailable.

Reaching parity is a meaningful project for uncertain benefit. **Not recommended for 3.0.** If it is ever pursued, the headless core (§12.0) is again the enabler — it is nearly browser-safe already, once `PathSafetyChecker` is split into a pure normalizer plus a host-specific symlink check.

### 12.5 GitHub App or Action — sync off the hot path

Tracker sync and drift reporting as CI jobs rather than editor features:

| Job | Trigger | Benefit |
|---|---|---|
| Drift check | Pull request | Blocks merge on Error findings; no editor cost |
| Jira sync | Push to main, or nightly | Removes 20–60 s of sequential network work from the editor |
| Spec coverage report | Pull request comment | Reviewers see requirement coverage without opening the editor |

This directly addresses risk **R2** (Jira adapter brittleness) and **R6** (P9 scope creep): a CI job that fails is a retry, whereas an editor operation that fails mid-way leaves local state inconsistent.

### 12.6 Surfaces worth rejecting explicitly

| Surface | Why not |
|---|---|
| Custom editor for specs | Specs are markdown; a custom editor loses find, diff, extensions, and git integration for cosmetic gain |
| Notebook interface for the plan | Interesting for the debate loop, but notebooks add a serialization format and a second source of truth |
| Standalone desktop app | Abandons the entire premise — the plan lives next to the code |
| Hosted service | Explicitly a non-goal, and correctly so |

---

## 13. Recommended Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  @planmyproject/core          pure TS · no vscode · no I/O           │
│  model · parsers · queue · drift detectors · prompt · pricing        │
│  ~28 modules already qualify today                                   │
└───┬──────────────┬──────────────┬───────────────┬────────────────────┘
    │              │              │               │
    ▼              ▼              ▼               ▼
┌─────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐
│ LSP     │  │ MCP       │  │ CLI      │  │ CI Action    │
│ server  │  │ server    │  │ pmp      │  │ drift/sync   │
│         │  │           │  │          │  │              │
│ parse   │  │ 9 tools   │  │ headless │  │ PR gate      │
│ trace   │  │ any agent │  │ scripting│  │ SARIF        │
│ drift   │  │           │  │ CI       │  │              │
│ hovers  │  │           │  │          │  │              │
└────┬────┘  └─────┬─────┘  └──────────┘  └──────────────┘
     │             │
     └──────┬──────┘
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  VS Code extension  (thin)                                           │
│  commands · tree views · webviews · consent · secrets · AI calls     │
│  Git facade · LM Tools (shim over MCP handlers) · chat participant   │
└──────────────────────────────────────────────────────────────────────┘
```

### What runs where

| v3 component | Recommended surface | Rationale |
|---|---|---|
| Plan and spec parsing | Core, hosted in LSP | Pure; needed by every surface |
| Queue building | Core | Pure |
| Trace graph | LSP server | Continuous, incremental, memory-resident |
| Drift detectors | Core (pure), driven by LSP | Off the extension host |
| Diagnostics, hover, definition, links, CodeLens | LSP server | Native protocol capabilities |
| Workspace scanner | LSP server | Heavy file I/O, benefits from `node:fs` |
| AI calls, consent, masking | Extension | Needs secrets and UI |
| Cost ledger and budgets | Core math, extension I/O | Ledger writes need workspace access |
| Tree views, webviews, walkthrough | Extension | UI |
| Chat participant | Extension | VS Code API |
| LM Tools | Extension shim over MCP handlers | One implementation, two transports |
| Tracker sync | CLI + CI Action, manual trigger in extension | Network latency must not touch the editor |
| Spec Kit / ADR / CSV export | Core + CLI | Useful headless |

### Cost of this architecture

| Change | Effort | When |
|---|---|---|
| Extract `@planmyproject/core` | **M** — mostly moving files; the boundary exists | Before P5 |
| Stand up the LSP server | **L** | During P6, when drift arrives |
| MCP server | **M** — replaces the LM Tools task rather than adding to it | P7, instead of `P7-N3`/`N4` as specified |
| CLI | **M** | P9, alongside sync |
| CI Action | **S** once the CLI exists | P9 |

Net effect on the 14–18 week estimate: roughly **+2 weeks** for the core extraction and LSP scaffolding, offset by the MCP server replacing rather than supplementing LM Tools, and by the CLI making `P9` sync work testable without a live Jira instance. Call it **+1 to +2 weeks** for a substantially more durable result.

---

## 14. Impact on the v3 Roadmap

Recommended amendments to §13 of the v3 spec:

| Change | Reason |
|---|---|
| **Add the parser metadata fix to P4 as P0-A**, with a field-level round-trip test | Live data-loss and privacy bug; dependency gates and per-task file-send policy do not currently survive a save (§4.1) |
| **Move `P10-H4` (queue rank precompute) into the P4 finishing work as P0-B**, shipped in the same change as P0-A | 641× on the most frequent write path; and the parser fix is unsafe without it (§4.3) |
| **Re-validate every v2 feature that depends on task metadata** | `dependsOn`, `linkedFiles`, `goalRef`, `confidence`, `origin`, and `fileSendPolicy` have not round-tripped since the v2 parser was written; the research gate, queue blocking, implement context, and file-send policy all read them |
| **Add a benchmark suite with CI budget enforcement to P4** | Would have caught both defects at write time; protects every subsequent phase |
| **Add "extract `@planmyproject/core`" as a P5 prerequisite** | Enabler for LSP, MCP, and CLI; cheapest now, before 50 new modules are written against the current structure |
| **Add esbuild bundling to P4** | One day; removes most module-load cost permanently |
| **Design the drift engine as incremental from the start in P6**, rather than optimizing in P10 | Full recompute cannot meet any budget |
| **Replace `P7-N3`/`P7-N4` (LM Tools) with an MCP server plus a thin VS Code shim** | Same effort, far more reach, removes dependency on unstable agent-mode APIs (risk R3) |
| **Stand up the LSP server during P6** | The drift engine is the workload that justifies it |
| **Add a CLI to P9 and a CI drift gate** | Makes goal G4 enforceable rather than advisory |
| **Remove `sync.onPersist`** from the settings surface | 20–60 s of network work on a save path |
| **Revisit invariant I6** (no runtime dependencies) | `vscode-languageclient` is worth the dependency; the invariant is a means, not an end |

Two decisions from §15.2 of the spec should also be revisited in light of these measurements:

- **D-2** (adopt provider SDKs): unchanged — staying dependency-free for providers is still reasonable. The LSP dependency is a separate question and should be decided on its own merits.
- **New D-10**: should the drift engine run in-process or out-of-process? The measurements here argue strongly for out-of-process. Recording it as an explicit decision with this data attached would be worthwhile.

---

## 15. Appendix — Reproducing the Measurements

The benchmark scripts used for this document are not committed. To reproduce:

```bash
npm run test:build          # produces out-test/ with the vscode shim available
```

Then, against `out-test/src/`:

1. **Plan scaling** — construct plans of N tasks with `createTaskNode`/`addTask` in a roots → features → leaves shape, with one research leaf per group and sibling dependency edges. Time `serializePlanMarkdown`, `parsePlanMarkdown`, and `buildExecutionQueue` separately, median of 3–5 runs after a warm-up.

2. **Cost attribution** — time `duplicatePlanDocument`, `recomputeDerivedStatuses`, `buildExecutionQueue`, and `getTaskBlockReason` individually against the same plan; the residual is markdown rendering.

3. **Fix validation** — reimplement `sortLeavesByDependencies` with a rank map built in one pre-pass and binary insertion into the ready queue; compare output ordering for equality and time both.

4. **Dependency closure** — walk relative imports from each file in `src/`, mark files importing `vscode`, and propagate reachability to a fixed point.

5. **Round-trip fidelity** — construct one task carrying every metadata field, serialize, parse, and compare field by field. This is the four-line check that exposes §4.1.

6. **The masking interaction** — build a plan with sibling dependency edges, then time `buildExecutionQueue` on the plan as constructed and on the same plan after one serialize/parse cycle. Count dependency edges in each. The 40× gap and the zero edge count are §4.3.

Suggested permanent home: `test/bench/` with an `npm run bench` script, and a CI check that fails when the mutation path exceeds its budget (§10).

**Benchmarks belong in the repository.** Both defects in §4 persisted through a full architecture refactor and 72 passing tests precisely because nothing measured them — and the parser bug was found not by a test or a code review but by a benchmark that measured the same operation two ways and disagreed with itself.

---

*End of performance analysis — companion to PlanMyProject v3 Spec 3.0.0-draft1*
