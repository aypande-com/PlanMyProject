# PlanMyProject v3 — Implementation Plan

**Execution plan for `PlanMyProject_v3_Spec.md` (3.0.0-draft3)**

Version: 1.0 | Date: 2026-09-27 | Baseline: branch `pmp-v3-spec` @ `baebf65` (72 tests, all passing)

---

## 0. What This Document Is

`PlanMyProject_v3_Spec.md` says **what** v3 is and lists ~100 tasks (`P0-A1` … `P10-H14`).
`PlanMyProject_v3_Performance.md` and `PlanMyProject_v3_Security.md` say **why** several of them exist.

This document says **how the work gets done**: verified starting state, decisions that must be locked before
code is written, the work broken into merge-sized units in dependency order, the definition of done for each,
and the points at which the plan should be re-cut rather than pushed through.

It does not restate the spec. Every unit below cites the spec task IDs it delivers; the spec remains the
authority on behaviour, data model, and file formats.

**Table of contents**

1. [Verified baseline](#1-verified-baseline)
2. [Decisions to lock before coding](#2-decisions-to-lock-before-coding)
3. [Release strategy](#3-release-strategy)
4. [Standing rules for every work unit](#4-standing-rules-for-every-work-unit)
5. [Phase P0 — Blocking defects](#5-phase-p0--blocking-defects)
6. [Phase P4F — Finish v2, release 2.0.0](#6-phase-p4f--finish-v2-release-200)
7. [Phase P5 — Spec core](#7-phase-p5--spec-core)
8. [Phase P6 — Traceability and drift](#8-phase-p6--traceability-and-drift)
9. [Phase P8 — Cost monitoring](#9-phase-p8--cost-monitoring-parallel-with-p6)
10. [Phase P7 — Native surfaces](#10-phase-p7--native-surfaces)
11. [Phase P9 — SDLC compatibility](#11-phase-p9--sdlc-compatibility)
12. [Phase P10 — Hardening and release](#12-phase-p10--hardening-and-release)
13. [Critical path and parallelism](#13-critical-path-and-parallelism)
14. [Schedule, and an honest word about it](#14-schedule-and-an-honest-word-about-it)
15. [Descope triggers](#15-descope-triggers)
16. [Tracking and reporting](#16-tracking-and-reporting)

---

## 1. Verified Baseline

The spec's baseline is `pmp-v2-rewrite @ 7266bca`. Work now starts from `pmp-v3-spec @ baebf65`, which is that
commit plus the three v3 documents and the secure-API-key/error-handling commit. Every P0 claim in the spec was
re-checked against this HEAD before this plan was written. **All of them are still live.**

| Spec claim | Verified on `baebf65` | Evidence |
|---|---|---|
| 72 tests, all passing | ✅ confirmed | `npm test` → `pass 72 / fail 0` |
| 59 source files, 6,345 lines | ✅ confirmed | `find src -name '*.ts'` |
| P0-A: `parseInlineMetadata` truncates at first colon | ✅ **live** | [PlanParser.ts:359](src/parser/PlanParser.ts#L359) slices at first `:`; task caller [line 296](src/parser/PlanParser.ts#L296) has already stripped `pmp:`, so the split lands inside the `createdAt` timestamp |
| P0-B: queue build is super-linear | ✅ **live** | [QueueBuilder.ts:69](src/queue/QueueBuilder.ts#L69) — `queue.shift()`, full `queue.sort()` on every insertion, and `getTaskTraversalRank` walking the tree from all roots per comparison |
| P0-D1: all 17 settings unscoped | ✅ **live** | no `scope` key on any entry in `contributes.configuration.properties` |
| P0-D1: plaintext API key survives migration | ✅ **live** | [AIService.ts:66](src/ai/AIService.ts#L66) stores to secrets and warns, but never clears the setting |
| P0-D2: sensitivity check absent from egress | ✅ **live** | `isSensitiveWorkspacePath` has exactly one call site, [TaskCommandService.ts:266](src/controller/TaskCommandService.ts#L266), on the *write* path; `collectLinkedFileSnapshots` ([line 517](src/controller/TaskCommandService.ts#L517)) reads linked files into the prompt with no check |
| P0-D3: masking is thin and unwired | ✅ **live** | [PromptMasker.ts](src/util/PromptMasker.ts) has 5 base patterns; `maskEmails` / `maskIpAddresses` default `false` and no caller ever passes them |

**Additional facts that shape the plan, not stated in the spec:**

- **There is no CI workflow.** `.github/` contains only `copilot-instructions.md`. §14.3 and §14.4 both assume
  `.github/workflows/ci.yml` exists. It does not, so P0 creates it — every gate in this plan is otherwise unenforced.
- **39 of 59 modules have no direct `vscode` import** (the spec's 28 is the stricter transitive-closure count).
  The core-extraction boundary is real and a little roomier than the spec assumes.
- **No runtime dependencies, no bundler.** `npm run compile` is bare `tsc`; `package` ships `out/` unbundled.
- `npm test` globs `out-test/test/*.test.js` and `out-test/test/integration/*.test.js` explicitly — **a new
  `test/bench/` or `test/security/` directory will not be picked up** without a script change. Easy to miss.

---

## 2. Decisions to Lock Before Coding

§15.2 of the spec lists D-1 … D-15 with recommendations. **Treat the recommended default as accepted unless
explicitly overturned**, and record the decision in `FEATURE_PROGRESS.md` when the phase that depends on it starts.
Three of them must be settled *before* P0 or P5 begins, because reversing them later is expensive:

| Decision | Needed by | Recommended | Cost of reversing later |
|---|---|---|---|
| **D-13** settings scoping | **P0** | machine-scope + stricter-only | Low — but it gates the security suite, so settle it first |
| **D-12** queue derived, not committed | **P10** | derived + gitignored | Medium — changes committed file shape; the spec defers it to P10 *deliberately*, keep that |
| **D-1** where trace fields live | **P5-S8** | second `pmp:trace:` comment line | **High** — P5-S8 writes the serializer; changing the comment layout after P6/P9 add fields means a migration |
| **D-4** requirement ID scope | **P5-S1** | global `R0001` | **High** — ID format is baked into every `reqRefs` in every plan file in the wild |
| **D-10** LSP for drift | **P6** | LSP server process | **High** — see the amendment below |
| **D-11** MCP over LM Tools | **P7** | MCP + thin shim | Medium |

### Three amendments proposed to the spec

These are judgement calls this plan makes on top of the spec. Each is small and reversible; flag disagreement
before the relevant phase.

**A1 — Make D-10 (LSP) a measured gate, not an unconditional build.**
R11 already rates LSP slip as *Medium likelihood, High impact*, and its own mitigation says to "extract the core
in P5 and run it in-process first, so the boundary is validated by use before a wire is introduced." This plan
makes that explicit: **P6 builds the drift engine in-process behind the `@planmyproject/core` boundary and ships
`drift.bench` (P6-T18) before P6-T17 starts.** If incremental drift is inside the 100 ms budget and the full
sweep is inside 2 s *on the extension host*, the LSP move is re-evaluated at that checkpoint rather than executed
by default. The core boundary is what makes the move cheap whenever it is taken; paying for the wire before the
measurement is the part R11 warns about. This does not weaken D-10's reasoning — unsolicited analysis on a shared
host is bad regardless of speed — it only sequences it behind evidence.

**A2 — P0 creates the CI workflow, and it is the first thing in P0.**
Every gate this plan relies on (`bench`, `check:coverage`, the security suite, the settings-scope check) is
worthless without a workflow to fail. §14.4's own closing argument is that both P0 defects survived 72 passing
tests *because nothing measured them*. Shipping the measurements without the thing that enforces them repeats
the mistake.

**A3 — `npm test` moves to a recursive glob in P0.**
The current explicit two-glob form silently ignores any new test directory. `test/security/`, `test/bench/`,
and P5's `test/spec/` all land in directories that do not exist yet. This is a two-line change that prevents a
whole class of "the test exists but never runs" failure.

---

## 3. Release Strategy

Two releases, in this order. The spec's §13.1 assumes this; it is restated here because it drives branch layout.

| Release | Contents | Gate |
|---|---|---|
| **2.0.0** | P0 (defects + security) + P4F (finish v2) | Marketplace publish. First public release since 1.0.2 |
| **3.0.0** | P5 → P10 | Marketplace publish |

**2.0.0 ships before any v3 feature work.** Not for marketing reasons: P5-S8 extends exactly the task metadata
that P0-A3 repairs, and building spec fields onto a parser that drops fields buries the defect under 50 new modules.
Equally, publishing 2.0.0 *without* P0-D would ship an extension whose egress controls a cloned repository can
switch off — worse than a two-week delay.

**Branching.** `main` is the release branch. Each work unit below is one PR onto a phase branch
(`v3/p0`, `v3/p5`, …), and each phase branch merges to `main` at its exit gate. The one exception is
[U3](#u3--fix-both-defects-together), which the spec requires to be a *single commit*.

**3.0.0 scope is cut at P9, not expanded.** Per R6 and D-8, 3.0 ships **GitHub Issues + Jira push/pull-status**.
Jira two-way, Azure DevOps, Linear, and GitLab are 3.1.

---

## 4. Standing Rules for Every Work Unit

Applied to every PR below; not repeated in the tables.

1. **Tests before fix for defects.** A defect unit opens with a test that fails on the current code. If the test
   passes before the fix, the test is wrong.
2. **`FEATURE_CHECKLIST.json` entry before "done".** Invariant I8. `npm run check:coverage` must be green; it
   verifies the test file exists, the test name is a literal in it, and the compiled output is present.
3. **No merge with a regression** in the existing 72 tests (I3), the §4.5 budgets (I11), or the I10 fidelity
   assertions.
4. **New setting ⇒ explicit `scope`.** CI fails otherwise (§12.4). No exceptions, including during P5–P9.
5. **New serialized field ⇒ a fidelity assertion in the same PR.** Invariant I10. This is the rule that would
   have caught P0-A.
6. **Safety enforcement goes in the lowest shared layer** (I14). A check written in a VS Code command handler
   is a check the MCP server and CLI do not have.
7. **Untrusted text stays data** (I13). Spec text, constitution text, tracker text, and model output never
   decide a gate. Gates are evaluated in code from parsed state.
8. **Every phase ends with its §13.3 milestone demo recorded as an integration test**, and a
   `FEATURE_PROGRESS.md` entry.

---

## 5. Phase P0 — Blocking Defects

**Exit:** metadata round-trips field by field; queue < 10 ms @ 2,000 tasks with edges intact; bench suite gating
CI; bundled VSIX; no unscoped setting; egress sensitivity enforced; security suite green.
**Estimate:** 1–1.5 weeks. **Blocks:** everything.

| Unit | Delivers | Files | Notes |
|---|---|---|---|
| **U0** | CI workflow + test glob (**A2, A3**) | `.github/workflows/ci.yml`, `package.json` | `compile`, `test`, `check:coverage` on every push. Recursive test glob. Bench added in U5 |
| **U1** | P0-A1 — field-level round-trip fidelity test, 13 metadata fields | `test/parser-fidelity.test.ts` | **Must fail on `baebf65`.** Assert each field individually, not deep-equal on the tree |
| **U2** | P0-A2 — queue benchmark @ 2,000 tasks | `test/bench/queue.bench.ts` | **Must fail on `baebf65`.** The fixture *asserts its own dependency-edge count* as a precondition (§14.4) — a fixture whose edges are dropped measures nothing |
| **U3** | P0-A3 + P0-B1 — **both fixes, one commit** | `src/parser/PlanParser.ts`, `src/queue/QueueBuilder.ts` | Parser: drop the prefix-strip at line 359, have the goal caller strip `pmp:goal-meta:`. Queue: one O(n) rank pre-pass, binary insertion, rank map threaded through `compareTaskOrder`; assert identical ordering to the old implementation on a fixture corpus. **Shipping the parser fix alone makes the write path ~40× slower** |
| **U4** | P0-B2 — regression test: unresolved dependency stays blocked across a round trip | `test/queue.test.ts` | The specific failure the gates exist to prevent |
| **U5** | P0-C1 — `test/bench/` harness, `npm run bench`, CI budget gate | `test/bench/`, `package.json`, `ci.yml` | Median of 3–5 runs after warm-up; compare to a committed baseline with a tolerance band, not a hard constant |
| **U6** | **P0-B3 — re-validate every feature that reads task metadata** | tests across suites | Research gate, dependency gate, queue blocking, implement context, file-send policy, linked files, confidence routing. **Budget this as M and expect to find bugs** — none of these has ever run against data that survived a save (R10). Findings are P0 scope, not deferrals |
| **U7** | P0-D1 — settings-scope hardening | `package.json`, `src/ai/AIService.ts` | Classify all 17 per §12.4. One-way-migrate the API keys: read once → secrets → **clear the setting** → tell the user. CI check: no setting without `scope` |
| **U8** | P0-D2 — sensitivity on egress | `PathSafetyChecker.ts`, `TaskCommandService.ts` | Apply `isSensitiveWorkspacePath` inside `collectLinkedFileSnapshots`. Split the list into `BUILD_METADATA` (warn on write) / `SECRET_BEARING` (**refuse** on egress). Name the refused files to the user |
| **U9** | P0-D3 — masking expansion | `PromptMasker.ts`, `AIService.ts`, `test/masking.test.ts` | AWS, GCP, Slack, JWT, connection strings, `github_pat_`, `glpat-`. Wire `maskEmails`/`maskIpAddresses` to settings **or delete them** — an option no caller can set is worse than no option. One test per pattern class |
| **U10** | P0-D4 — security regression suite | `test/security.test.ts` | Workspace setting cannot weaken a control; `.env` in `linkedFiles` refused on egress *and named*; symlink escape blocked at every write site |
| **U11** | P0-C2 — esbuild bundling | `esbuild.js`, `package.json`, `.vscodeignore` | Single `out/extension.js`. Keep `tsc --noEmit` for typechecking; keep the `tsc`-based test build |

**Sequencing inside P0:** U0 → (U1, U2 in parallel) → U3 → (U4, U6) → U5 → (U7, U8, U9) → U10 → U11.
U7–U9 are independent of the parser work and can run alongside U6.

**Demo (§13.3 #0):** a workspace `settings.json` setting `requireAiConsent: "never"` changes nothing; `.env`
reached through `linkedFiles` is refused by name; a task with dependencies, linked files, and
`fileSendPolicy: "never"` survives ten save cycles byte-identical; a 2,000-task plan with intact edges
serializes in under 50 ms.

---

## 6. Phase P4F — Finish v2, Release 2.0.0

**Exit:** 2.0.0 on the Marketplace; checklist green. **Estimate:** 1–2 weeks. **Depends on:** P0.

Only the P4 items v3 actually depends on (§2.4). The rest of the P4 backlog stays in `FEATURE_PROGRESS.md`.

| Unit | Delivers | Why v3 needs it |
|---|---|---|
| **U12** | P4-B1 — auto-mark from scan deltas | Becomes drift detector D-status; P6 generalizes it |
| **U13** | P4-B2 — `code-inferred` tasks from scan | Needed for "unplanned change" drift and the onboarding wizard |
| **U14** | P4-D1 + P4-D2 — goal-criterion enforcement, tighter response schema validation | P5-S9 replaces `goalCriterionIndex` with `reqRefs` at the same validation hook; spec generation adds new schemas that need strict guards first |
| **U15** | P4-H3 + P4-H4 — watcher error handling, dependency-cycle surfacing | Drift diagnostics reuse the same surfacing path |
| **U16** | Release 2.0.0 — CHANGELOG, README, version bump, publish | Per `.github/copilot-instructions.md` |

> **Judgement call:** P4-C2 (debate streaming) is listed in §2.4 as a prerequisite because "the chat participant
> streams; the debate panel should not lag behind." That is a consistency argument, not a dependency. It is
> **deferred to P7**, where the streaming work actually happens, rather than delaying 2.0.0.

---

## 7. Phase P5 — Spec Core

**Exit:** core package extracted with a lint rule; specify → clarify → approve → plan-from-spec works end to end;
schema v3 parses and migrates. **Estimate:** 3–3.5 weeks. **Depends on:** P0 (hard), P4F (release ordering).

| Unit | Delivers | Size | Depends on |
|---|---|---|---|
| **U17** | **P5-S0 — extract `@planmyproject/core`** | M | — |
| **U18** | P5-S1 — spec model types, `S`/`R`/`AC`/`C` ID generators | S | U17 |
| **U19** | P5-S2 — `SpecParser` round-trip + tests mirroring `parser.test.ts` | L | U18 |
| **U20** | P5-S3 — `SpecService`: discover, load/save, lifecycle, watcher | M | U19 |
| **U21** | P5-S4 + **P5-S17** — `ConstitutionService`, prompt layer with cap, **validator enforcing I9**, untrusted-layer delimiting in `PromptBuilder` | M+M | — |
| **U22** | **P5-S8 — `TaskNode` extensions + plan serialization + v2→v3 upgrader** | L | U18 |
| **U23** | P5-S16 — spec + task round-trip fidelity test (I10) | S | U19, U22 |
| **U24** | P5-S5 — `SpecGenerator`, `SpecDraft` schema, `Specify Feature` | L | U20, U21 |
| **U25** | P5-S6 — `Clarify Spec` + marker resolution | M | U24 |
| **U26** | P5-S7 — `Approve Spec`, `Supersede Spec`, `spec-gate` block reason | M | U20 |
| **U27** | P5-S9 — `Plan From Spec`, SPEC LAYER, `reqRefs` validation | M | U22 |
| **U28** | P5-S10 + P5-S11 + P5-S13 — Specs tree view, spec CodeLens, spec diagnostics | M+S+S | U20 |
| **U29** | P5-S12 — Spec Review WebView | M | U25, U26 |
| **U30** | P5-S14 — onboarding wizard option D "Start from a spec" | S | U24 |
| **U31** | P5-S15 — integration test + checklist entries | M | U27 |

**U17 is the phase's real risk and it goes first.** It is mostly file moves, but it is 39 candidate modules and
it must land with the lint rule that fails any `vscode` import inside `core/` — without the rule, the boundary
erodes within a week. Do it before the ~50 new modules of P5–P9 are written against the current structure; that
is the entire argument for doing it now rather than in P7.

**U22 carries D-1.** The `pmp:trace:` second-comment decision is implemented here. Get it right; a plan file in
the wild is a migration.

**Do not start U24 before U23 is green.** The fidelity test is the guard that stops P5 from re-creating P0-A
with spec fields.

**Demo (§13.3 #1):** one spec, one clarification resolved, plan-from-spec produces three root tasks with `reqRefs`.

---

## 8. Phase P6 — Traceability and Drift

**Exit:** 11 detectors with tests; incremental drift within budget; Problems panel populated; `Verify Task`
records evidence. **Estimate:** 3.5–4 weeks. **Depends on:** P5-S8 (U22).

| Unit | Delivers | Size | Depends on |
|---|---|---|---|
| **U32** | P6-T1 + P6-T15 — trace types, `TraceService` graph, trace cache, dirty-set subgraph, **file-existence cache** (no per-run `stat` storms) | M+M | U22 |
| **U33** | P6-T2 + **P6-T19** — link validation at materialization; **sensitivity refusal, in the shared handlers** (I14, I15) | S+S | U32 |
| **U34** | P6-T3 — `GitFacade` with graceful degradation; `completedRev` on status change | M | — |
| **U35** | P6-T4 — detectors D1, D2, D4, D5, D6 (spec/plan only) | L | U32 |
| **U36** | P6-T5 — detectors D3, D7, D8, D11 (git-aware) + file-hash fallback | L | U34, U35 |
| **U37** | P6-T6 — detector D9 (constitution/constraints) | S | U21 |
| **U38** | P6-T7 — `DriftDiagnostics` publisher + quick fixes | M | U35 |
| **U39** | P6-T8 + P6-T16 — triggers, debounce, incremental scheduling, scoring, status bar; **write-origin tokens replacing `isSelfWriting`** | M+S | U36, U38 |
| **U40** | **P6-T18 — `drift.bench` against the §4.5 budgets** | S | U39 |
| **U41** | **Checkpoint: LSP decision (amendment A1)** | — | U40 |
| **U42** | P6-T17 — stand up the LSP server, if U41 says so | L | U41, U17 |
| **U43** | P6-T9 — Drift tree view + Export Report | M | U39 |
| **U44** | P6-T10 + **P6-T20** — `Verify Task`/`Verify Spec`, `TaskVerification` model; `verify.runTests` hardening (**no `"always"` mode**, resolved-command confirmation, re-confirm on task-definition change) | L+S | U36 |
| **U45** | P6-T11 + P6-T12 — `Analyze Spec` coverage report; pre-implement drift gate | S+S | U35 |
| **U46** | P6-T13 — source CodeLens (opt-in) | M | U32 |
| **U47** | P6-T14 — integration tests | M | U44 |

**U40 before U41 before U42** is the whole point of amendment A1. Note that U40 is listed in the spec as
depending on T17 (benchmark the LSP); this plan inverts it — benchmark in-process, then decide.

**R4 (drift noise) is a design constraint on U36, not a later fix.** D7 ships at Information severity, with
ignore globs and per-spec mute, and runs only on manual Verify unless `drift.autoCheck` opts in. Retrofitting
noise control after users have turned the feature off does not get them back.

**Demo (§13.3 #2):** edit R0001 → Problems panel shows D1 on T0010 → quick fix refreshes links; delete a linked
file → D2 appears.

---

## 9. Phase P8 — Cost Monitoring (parallel with P6)

**Exit:** every AI call logged with usage and cost; consent shows a non-blocking estimate; budgets enforce;
ledger rotates. **Estimate:** 2 weeks. **Depends on:** nothing in P5 — *can start the day P5 starts.*

This is the one genuinely parallel phase: it touches `src/ai/` and a new `src/cost/`, disjoint from P5's
`src/spec/` and P6's `src/trace/`. For a solo developer it is better used as the **context-switch phase** — the
thing to pick up when P6 stalls on a hard detector — than as literal parallel work.

| Unit | Delivers | Size | Depends on |
|---|---|---|---|
| **U48** | P8-C1 — `AIUsage` type; Claude SSE streaming + usage + per-op `max_tokens`; OpenAI streaming + usage; Copilot `countTokens`; **sanitize error bodies** (closes P4-H2) | L | — |
| **U49** | P8-C2 — model settings, `selectChatModels` by family, remove hardcoded IDs | S | U48 |
| **U50** | P8-C3 — `UsageLedger` append + rollups + rotation; wire every AI call site | M | U48 |
| **U51** | P8-C4 — `PricingTable` with dated defaults and overrides | S | U50 |
| **U52** | P8-C5 — `TokenEstimator` + `PromptBudgeter` | M | U48 |
| **U53** | P8-C6 — `BudgetGuard` + consent summary with estimate and session spend | M | U51, U52 |
| **U54** | P8-C7 + P8-C8 — Usage tree view, status bar, tooltips; Export Usage, Reset Counters | M+S | U50 |
| **U55** | P8-C10 — tests: rollups, pricing incl. unpriced, **budgeter trimming order**, thresholds, provider usage from recorded fixtures | M | U53 |
| **U56** | **P8-C11 — file-level provenance** joining ledger and trace links; `Export Provenance Report` | M | U50, U32 |
| **U57** | P8-C9 — Usage dashboard WebView | M | U54 |

**U52 has an ordering trap the spec calls out explicitly (§5.5):** `PromptBudgeter` trims **before**
`maskPromptText` runs, or a trim reintroduces unmasked content into the final string. Assert the order in U55.

**U49 sets the default Claude model per D-5 (`claude-opus-5`)** with `model.claude` documented for cost-sensitive
users. Hardcoded IDs go; the ledger makes the trade-off visible.

**R5 is a UI constraint on U54:** never show a dollar figure for Copilot. Label every Copilot row
"estimated, included in subscription."

**U57 is the first slip candidate** — the spec itself marks it "can slip to P10."

**Demo (§13.3 #3):** three operations → Usage view totals match the ledger → budget warning at 80%.

---

## 10. Phase P7 — Native Surfaces

**Exit:** `@pmp` handles all slash commands; MCP server usable from ≥2 agents; VS Code shim usable from Copilot
agent mode; hand-off implement closes the trace loop. **Estimate:** 2.5 weeks.
**Depends on:** P8-C3 (U50) for `/cost`; P5-S6, P6-T10 for the lifecycle commands.

| Unit | Delivers | Size | Depends on |
|---|---|---|---|
| **U58** | P7-N1 — `ChatParticipant` skeleton, `/status`, `/tasks`, `/cost`, follow-ups | M | U50 |
| **U59** | **P7-N3 — MCP server over the core: nine handlers, schemas, stdio transport, read-only tools first** | M | U32, U17 |
| **U60** | P7-N4 — mutating handlers with confirmation and ledger; `vscode.lm.registerTool` shim; **shared parsed-document cache keyed by `document.version`** (closes F4) | M | U59 |
| **U61** | **P7-N10 — MCP hardening**: stdio only, enforcement in shared handlers, confirmation a workspace cannot defeat, transport + calling client in the ledger. One security suite **run against both transports** | M | U59 |
| **U62** | P7-N2 — `/specify`, `/clarify`, `/plan`, `/analyze`, `/verify`, `/debate` with streaming (absorbs deferred P4-C2) | L | U25, U44 |
| **U63** | P7-N5 — `Implement With Agent` hand-off + watcher-based link proposal | L | U60 |
| **U64** | P7-N6 — `GitFacade` user name (fixes F1) + branch offer | S | U34 |
| **U65** | P7-N7 — document links, hovers, definitions for IDs | M | U20 |
| **U66** | P7-N8 — walkthrough, welcome views, snippets | S | U62 |
| **U67** | P7-N9 — chat handler and tool input validation tests; `vscode` shim growth | M | U62, U60 |

**U59 before U60 before U61, and read-only tools first.** The MCP server widens the trust boundary to *any MCP
client on the machine* (§7.2 draft3). Shipping the read-only nine first means a mistake in the transport layer
leaks information rather than mutating a plan.

**U63 ships with a first-run notice, and the notice is honest.** In hand-off mode the agent writes the files, so
`PathSafetyChecker`, the sensitivity refusal, and the overwrite confirmation **do not apply** — the constitution's
"no codebase writes without task scope" red line is structurally unenforceable there. The spec says so plainly
(§7.3) and the notice must too. What PMP still does: runs every gate before hand-off, scopes the prompt to the
task's linked files, watches for files touched outside the expected set, and records provenance.

**R3 is a build constraint on U63:** feature-detect the agent-mode APIs, fall back to classic implement, and pin
`engines.vscode` to the tested version.

**Demo (§13.3 #4):** `@pmp /specify`, `/plan`, `/implement` with Copilot agent mode calling `pmp_recordTrace` —
and the same `pmp_recordTrace` called from a second, non-VS Code agent over MCP against the same workspace.

---

## 11. Phase P9 — SDLC Compatibility

**Exit:** GitHub Issues push; Jira push + pull-status; Spec Kit round-trip; ADR export; `pmp drift` as a CI gate.
**Estimate:** 3 weeks. **Depends on:** P5-S8 (U22); P6-T3 (U34) for GitHub repo inference.

| Unit | Delivers | Size | Depends on |
|---|---|---|---|
| **U68** | P9-X1 — `SyncAdapter` interface, `SyncItem` rendering, `ExternalRef` serialization | M | U22 |
| **U69** | P9-X2 — `SyncService`: mode, conflict policy, state files, confirmation, **background job with progress and cancellation** | L | U68 |
| **U70** | **P9-X10 — `pmp` CLI over the core** (`specify`, `plan`, `drift --format sarif`, `analyze`, `sync`) + CI Action | M | U35, U69 |
| **U71** | **P9-X4 — `GitHubIssuesAdapter`** (native auth) — *the reference adapter* | L | U69, U34 |
| **U72** | P9-X3 — `JiraAdapter` (auth, create/update, transitions, search, ADF, backoff) | XL | U69 |
| **U73** | **P9-X11 — tracker credential binding**: host stored with the secret, other hosts refused, HTTPS required, cross-host redirects rejected, **target host named in the confirmation** | S | U69 |
| **U74** | P9-X5 — sync UI + D10 detector | M | U71 |
| **U75** | P9-X6 — `SpecKitBridge` import/export | L | U20 |
| **U76** | P9-X7 — `AdrExporter`, Superpowers-style plan export, Jira CSV export | M | U22 |
| **U77** | P9-X8 — requirements import into a spec draft | M | U24 |
| **U78** | P9-X9 — adapter tests with recorded HTTP fixtures, conflict matrix, Spec Kit round-trip, ADR golden files | L | U71, U72, U75 |

**Two reorderings from the spec's task numbering, both deliberate:**

1. **GitHub (U71) before Jira (U72).** The spec's own R2 mitigation says "ship GitHub Issues as the reference
   adapter," and X3 is the single largest task in the project and the most likely to slip. Building the smaller
   adapter first proves the `SyncAdapter` interface against real API shapes while there is still time to change it.
2. **CLI (U70) early, not last.** It depends only on the core and the detectors, and it makes adapter logic
   testable headlessly — which de-risks U72 directly. It also delivers `pmp drift --format sarif` as a PR check,
   which is what turns G4 from advisory into enforceable.

**U73 is not optional and not cosmetic.** `jira.siteUrl` unscoped means a repository can point the sync at an
attacker's host and receive the user's real Jira API token in a basic-auth header. U73 ships with or before U72.

**U71 carries a disclosure obligation:** GitHub's `repo` scope grants read/write to **every** private repository
the user can access. Request `public_repo` when the target is public, prefer fine-grained tokens where available,
and state the grant in the consent flow, README, and `PRIVACY.md`.

**Demo (§13.3 #5):** spec becomes an epic, tasks become stories, a status change in Jira shows as D10 then syncs.

---

## 12. Phase P10 — Hardening and Release

**Exit:** 3.0.0 published; all §4.5 budgets met on the full build. **Estimate:** 1.5–2 weeks.

| Unit | Delivers | Size |
|---|---|---|
| **U79** | P10-H1 — schema v3 marker, upgrader chain (v1→v2→v3 in one pass), backups, v2 read-only mode | M |
| **U80** | P10-H13 — **queue becomes derived** (D-12): regenerated on read, written to a gitignored file, not serialized into the committed plan | M |
| **U81** | P10-H12 — mutation-path cleanup (F14): reuse the in-memory serialized string for the undo snapshot; threshold-gate the debate archive sweep; lazy service construction | M |
| **U82** | P10-H10 — `node:fs` for `file:` paths with `workspace.fs` fallback; split `PathSafetyChecker` into pure normalizer + host symlink check | M |
| **U83** | P10-H11 — drop `retainContextWhenHidden` (F13); serialize/restore panel state; `pmp:` virtual documents for reports; one status bar item | M |
| **U84** | P10-H5 + P10-H6 — `usedInPrompts` out of the committed index (F8); scanner buckets + content hashes | S+M |
| **U85** | P10-H2 — retry/backoff, `Test AI Connection` | S |
| **U86** | **P10-H3 — constitution 1.1, hand-written** | S |
| **U87** | P10-H4 — verify §4.5 budgets on the full v3 build; record in `FEATURE_PROGRESS.md` | S |
| **U88** | **P10-H14 — `SECURITY.md`, `PRIVACY.md`, `NOTICE`**; IP/indemnity/provider-terms section; assurance-language pass; SBOM + `npm audit` in CI | M |
| **U89** | P10-H7 + P10-H8 — docs, README, CHANGELOG, template, screenshots; checklist completion pass | M+S |
| **U90** | P10-H9 — release 3.0.0 | S |

**U86 is done by hand, not generated.** `constitution.md` §10 requires a human-authored commit with rationale for
any constitutional change. The changes are corrections, not additions: remove the "HIPAA/SOC2 contexts" claim from
§11 (a governance document naming regulated frameworks it does not support is a reliance risk), correct the
`ai-audit.jsonl` promise to match D-14 (it is a *usage ledger*, not an audit log — a user-writable JSONL cannot
support audit reliance), and state that red lines are model guidance whose enforcement lives in code.

**U80 is deliberately last among the file-format changes.** It alters the shape of the committed plan file and
must not land anywhere near the P0 parser fix.

**Demo (§13.3 #6):** fresh install on a v1 plan → migrated to v3 → walkthrough completes.

---

## 13. Critical Path and Parallelism

```
U0 ─► U1,U2 ─► U3 ─► U4,U6 ─► U5 ─► U7,U8,U9 ─► U10 ─► U11     [P0]
                                                          │
                                                          ▼
                          U12…U16  ────────────────────────────► 2.0.0   [P4F]
                                                          │
                                                          ▼
         U17 (core) ─► U18 ─► U19 ─► U20 ─┬─► U24 ─► U25 ─┬─► U29        [P5]
                        └─► U22 ─► U23 ───┴─► U27          └─► U31
                                                          │
                        ┌─────────────────────────────────┤
                        ▼                                 ▼
   U32 ─► U35 ─► U36 ─► U39 ─► U40 ─► U41? ─► U42   U48 ─► U50 ─► U53    [P6 | P8]
                                 └─► U43,U44,U45,U47        └─► U56
                                                          │
                                                          ▼
              U59 ─► U60 ─► U61 ─► U62 ─► U63             [P7]
                                                          │
                                                          ▼
              U68 ─► U69 ─┬─► U70 (CLI) ─► U71 ─► U72 ─► U78   [P9]
                          └─► U73
                                                          │
                                                          ▼
                              U79 … U90 ─► 3.0.0          [P10]
```

**The critical path is: U3 → U17 → U22 → U32 → U35 → U59 → U69 → U72 → U90.** Everything else has slack.

**What can genuinely run in parallel** (for a second developer, or as context-switch work for one):

| Can run alongside | Because |
|---|---|
| **P8 (U48–U57)** alongside all of P5 and P6 | Touches `src/ai/` and `src/cost/` only; depends on nothing in P5 |
| **U21** (constitution) alongside U18–U20 | No dependency on the spec parser |
| **U34** (`GitFacade`) any time after P0 | Standalone |
| **U75, U76** (Spec Kit, ADR, CSV) alongside P6 | Depend only on P5 |
| **U70** (CLI) alongside U72 (Jira) | Depends only on core + detectors, and de-risks Jira |

**What looks parallel but is not:** U59 (MCP) reads the trace graph, so it waits on U32. U58 (`/cost`) waits on
U50. U62 waits on both U25 and U44 — it is the single most dependency-laden unit in the plan.

---

## 14. Schedule, and an Honest Word About It

| Phase | Spec estimate | Cumulative |
|---|---|---|
| P0 | 1–1.5 wk | 1.5 |
| P4F | 1–2 wk | 3.5 |
| P5 | 3–3.5 wk | 7 |
| P6 | 3.5–4 wk | 11 |
| P8 | 2 wk | 13 *(less if genuinely parallel)* |
| P7 | 2.5 wk | 15.5 |
| P9 | 3 wk | 18.5 |
| P10 | 1.5–2 wk | **20.5** |

The spec's "15–20 developer-weeks" counts from *after* the 2.0.0 release. Counted from `baebf65`, the honest
range is **18–24 developer-weeks**, and the estimates assume "one developer familiar with the codebase" working
without interruption. For a solo maintainer on part-time hours, treat that as **six to nine calendar months** and
plan the descope triggers in §15 accordingly, rather than discovering the overrun at month five.

Three specific estimates are, in this plan's assessment, optimistic:

- **U6 (P0-B3)** is sized M and the spec's own R10 rates it *High likelihood* of uncovering second-order bugs.
  Six metadata fields have never round-tripped; every feature reading them is unexercised. Budget two weeks for
  P0 rather than one and be pleasantly surprised.
- **U17 (core extraction)** is sized M for 39 candidate modules plus a lint rule plus a build-system change.
  The file moves are easy; the import-cycle untangling is where the time goes.
- **U72 (Jira)** is the only XL in the project and the spec flags it twice as the likeliest slip. Its descope is
  already written into D-8 — use it early rather than late.

---

## 15. Descope Triggers

Decide these *at the named checkpoint*, not when the deadline arrives.

| Trigger | Checkpoint | Action |
|---|---|---|
| P0 exceeds 2 weeks | End of U6 | Do not descope. P0 is the foundation; everything after it is cheaper. Absorb the overrun |
| Drift meets budget in-process | **U41** | Defer U42 (LSP) to 3.1. Keep the core boundary; record the measurement in `FEATURE_PROGRESS.md` |
| P6 exceeds 5 weeks | After U39 | Ship detectors D1–D6 + D9 for 3.0; defer D7/D8/D11 (the git-aware, noisiest ones) to 3.1 |
| P8 runs late | After U54 | Drop U57 (dashboard WebView) — the spec already marks it slippable |
| P7 runs late | After U61 | Ship MCP + read-only tools + `@pmp`; defer U63 (`Implement With Agent`) to 3.1. **Do not** defer U61 |
| P9 runs late | After U71 | **Ship 3.0 with GitHub Issues only.** Jira becomes 3.1. This is D-8's recommendation taken one step further and it is a legitimate 3.0 |
| Anything runs late | Any | **U10, U61, U73, U88 do not descope.** Security controls and the documents that describe them ship or the release does not |

The last row is the one that matters. Every other line in this table is a feature; those four are the difference
between an extension that is safe to install and one that is not.

---

## 16. Tracking and Reporting

- **Per unit:** one PR, one `FEATURE_CHECKLIST.json` entry, `npm test && npm run bench && npm run check:coverage`
  green in CI.
- **Per phase:** the §13.3 milestone demo recorded as an integration test, plus a `FEATURE_PROGRESS.md` section
  in the existing format (what landed, what moved, test count delta, budget measurements).
- **Per decision:** when a phase starts, record in `FEATURE_PROGRESS.md` which of D-1 … D-15 it locks and what
  was chosen. The three amendments in §2 are recorded the same way, as amendments to the spec rather than silent
  divergence.
- **Baseline numbers to carry forward:** 72 tests; parse 23.5 ms @ 1,000 tasks; queue 1,656 ms @ 500 tasks
  (pre-U3); serialize 12,988 ms @ 1,000 tasks (pre-U3). Re-measure after U5 and record the committed baseline
  the CI tolerance band compares against.

---

## Appendix — Unit-to-Spec-Task Index

| Unit | Spec tasks | Unit | Spec tasks |
|---|---|---|---|
| U0 | *(new — amendment A2/A3)* | U45 | P6-T11, P6-T12 |
| U1 | P0-A1 | U46 | P6-T13 |
| U2 | P0-A2 | U47 | P6-T14 |
| U3 | P0-A3, P0-B1 | U48 | P8-C1 (+P4-H2) |
| U4 | P0-B2 | U49 | P8-C2 |
| U5 | P0-C1 | U50 | P8-C3 |
| U6 | P0-B3 | U51 | P8-C4 |
| U7 | P0-D1 | U52 | P8-C5 |
| U8 | P0-D2 | U53 | P8-C6 |
| U9 | P0-D3 | U54 | P8-C7, P8-C8 |
| U10 | P0-D4 | U55 | P8-C10 |
| U11 | P0-C2 | U56 | P8-C11 |
| U12 | P4-B1 | U57 | P8-C9 |
| U13 | P4-B2 | U58 | P7-N1 |
| U14 | P4-D1, P4-D2 | U59 | P7-N3 |
| U15 | P4-H3, P4-H4 | U60 | P7-N4 |
| U16 | *(release)* | U61 | P7-N10 |
| U17 | P5-S0 | U62 | P7-N2 (+P4-C2) |
| U18 | P5-S1 | U63 | P7-N5 |
| U19 | P5-S2 | U64 | P7-N6 |
| U20 | P5-S3 | U65 | P7-N7 |
| U21 | P5-S4, P5-S17 | U66 | P7-N8 |
| U22 | P5-S8 | U67 | P7-N9 |
| U23 | P5-S16 | U68 | P9-X1 |
| U24 | P5-S5 | U69 | P9-X2 |
| U25 | P5-S6 | U70 | P9-X10 |
| U26 | P5-S7 | U71 | P9-X4 |
| U27 | P5-S9 | U72 | P9-X3 |
| U28 | P5-S10, S11, S13 | U73 | P9-X11 |
| U29 | P5-S12 | U74 | P9-X5 |
| U30 | P5-S14 | U75 | P9-X6 |
| U31 | P5-S15 | U76 | P9-X7 |
| U32 | P6-T1, P6-T15 | U77 | P9-X8 |
| U33 | P6-T2, P6-T19 | U78 | P9-X9 |
| U34 | P6-T3 | U79 | P10-H1 |
| U35 | P6-T4 | U80 | P10-H13 |
| U36 | P6-T5 | U81 | P10-H12 |
| U37 | P6-T6 | U82 | P10-H10 |
| U38 | P6-T7 | U83 | P10-H11 |
| U39 | P6-T8, P6-T16 | U84 | P10-H5, P10-H6 |
| U40 | P6-T18 | U85 | P10-H2 |
| U41 | *(new — amendment A1)* | U86 | P10-H3 |
| U42 | P6-T17 | U87 | P10-H4 |
| U43 | P6-T9 | U88 | P10-H14 |
| U44 | P6-T10, P6-T20 | U89 | P10-H7, P10-H8 |
| | | U90 | P10-H9 |

All 102 spec tasks across P0, P4F, P5, P6, P7, P8, P9, and P10 are assigned to a unit: 12 (P0), 6 (P4F), 18 (P5), 20 (P6), 10 (P7), 11 (P8), 11 (P9), 14 (P10).
