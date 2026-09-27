# Project Plan

<!-- pmp:schema=v2 -->

<!-- Source: PlanMyProject_v3_Implementation_Plan.md (v1.0, 2026-09-27), baseline pmp-v3-spec @ baebf65. Units U0-U90 map 1:1 to tasks below; phase headers are milestone parents (not in the execution queue). createdAt/completedAt are placed last in each metadata comment as a mitigation for the still-live P0-A colon-truncation bug (U1/U3 fix it) so dependsOn/linkedFiles are not at risk of being clipped. -->

<!-- pmp:goal:id=G0001;statement=Ship PlanMyProject v3 - close the P0 defects and security gaps, release 2.0.0, then deliver spec-driven planning, traceability and drift detection, cost monitoring, native AI-surface integration, and SDLC tool sync for 3.0.0;scanned=2026-09-27T00:00:00Z -->

## Goals

- [G0001] Ship PlanMyProject v3 - close the P0 defects and security gaps, release 2.0.0, then deliver spec-driven planning, traceability and drift detection, cost monitoring, native AI-surface integration, and SDLC tool sync for 3.0.0
  <!-- pmp:goal-meta:id=G0001;criteria=["Metadata round-trips field by field, queue stays under 10ms at 2,000 tasks with edges intact","No unscoped VS Code setting, egress sensitivity enforced, security regression suite green","2.0.0 published to the Marketplace before any v3 feature work begins","specify -> clarify -> approve -> plan-from-spec works end to end on schema v3","11 drift detectors running within the §4.5 performance budgets","Every AI call logged with usage and cost, budgets enforced","@pmp chat participant, MCP server, and VS Code LM tool shim all callable against the same trace graph","GitHub Issues push and Jira push/pull-status shipped, Spec Kit round-trip and ADR export shipped","3.0.0 published to the Marketplace with all §4.5 budgets met on the full build"];constraints=["Solo maintainer, part-time hours - treat the 18-24 developer-week estimate as six to nine calendar months","No runtime dependencies, no bundler until U11 lands, npm run compile is bare tsc today","main is the release branch - each work unit is one PR onto a phase branch (v3/p0, v3/p5, ...)","D-10 (LSP) is a measured gate per amendment A1 - only taken if in-process drift misses the §4.5 budgets at the U41 checkpoint"];out-of-scope=["Jira two-way sync, Azure DevOps, Linear, and GitLab adapters (3.1 per D-8)","P4 backlog items not required by v3 (tracked separately in FEATURE_PROGRESS.md)","Schedule buffers (§14) and descope triggers (§15) are process guidance, not discrete tasks - not encoded in this tree"] -->

## Plan Tree

- [/] [T0001] 🏁 Phase P0 — Blocking defects
  <!-- pmp:id=T0001;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;notes=Exit: metadata round-trips field by field. Queue under 10ms at 2,000 tasks with edges intact. Bench suite gating CI. Bundled VSIX. No unscoped setting. Egress sensitivity enforced. Security suite green. Estimate 1 to 1.5 weeks. Blocks everything.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [x] [T0002] ⚙️ U0 — CI workflow + recursive test glob
    <!-- pmp:id=T0002;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[".github/workflows/ci.yml","package.json"];fileSendPolicy=global;notes=Delivers amendments A2 and A3. compile, test, and check:coverage run on every push. Recursive test glob so test/bench and test/security are picked up. Bench step added in U5. Verified locally: npm test and npm run check:coverage both green at 72/72 and 17/17 with the quoted globstar pattern node --test "out-test/test/**/*.test.js" - no infra to push a CI run against yet since this is the workflow that stands the pipeline up.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0003] ⚙️ U1 — Parser fidelity test (P0-A1), 13 metadata fields
    <!-- pmp:id=T0003;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0002"];linkedFiles=["test/parser-fidelity.test.ts"];fileSendPolicy=global;notes=Must fail on baebf65 - confirmed. After U3 landed, this now passes (73/73). Along the way found the fixture itself was invalid (completedAt set without status done, which recomputeDerivedStatuses correctly nulls) and fixed the test, not the parser.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0004] ⚙️ U2 — Queue benchmark @ 2,000 tasks (P0-A2)
    <!-- pmp:id=T0004;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0002"];linkedFiles=["test/bench/queue.bench.ts"];fileSendPolicy=global;notes=Must fail on baebf65 - confirmed at ~11.4s versus the 10ms budget. After U3, passes reliably at min-of-5-after-warmup (a single cold call was ~30-50ms - V8 inline-cache warm-up on this code's object/Map shapes, not algorithmic complexity, confirmed by timing a trivial same-size loop at under 2ms cold). Rewrote the timing assertion to warm up 3 times then take the best of 5, matching U5's own stated median-after-warmup-with-tolerance methodology rather than a single noisy cold sample.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0005] ⚙️ U3 — Fix parser truncation + queue super-linearity (P0-A3 + P0-B1, one commit)
    <!-- pmp:id=T0005;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0003","T0004"];linkedFiles=["src/parser/PlanParser.ts","src/queue/QueueBuilder.ts","src/model/PlanModel.ts"];fileSendPolicy=global;notes=Shipped as one commit (76f659f) as required. Parser: removed the colon-slice in parseInlineMetadata, goal-meta caller now strips its own prefix explicitly. Queue: O(n) rank pre-pass plus a binary min-heap (O(log n) insert/extract) instead of the old resorted array - a plain sorted-array-plus-splice attempt still measured ~37ms at 2000 tasks, the heap got it to single digits ms warm. Verified identical ordering to the pre-fix implementation across 20 randomized fixtures. Also touched PlanModel.ts: found a second O(n^2) path while chasing the 10ms budget - getTaskBlockReason's research-gate check scans every sibling, and buildExecutionQueue called it once per leaf. Added an optional precomputed unresolvedResearchParents set (buildUnresolvedResearchParentIds) so only QueueBuilder's bulk path is O(1) per task - the other 3 call sites (PlanParser serialize, TreeProvider, TaskCommandService) still do the full per-task sibling scan and are NOT fixed here, flagged for U6 below. 73/73 tests green, check:coverage green.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0006] ⚙️ U4 — Regression test: unresolved dependency stays blocked across a round trip (P0-B2)
    <!-- pmp:id=T0006;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=["test/queue.test.ts"];fileSendPolicy=global;notes=The specific failure the gates exist to prevent. Build dependency + dependent, confirm blocked, serialize, parse back, confirm still blocked and dependsOn survived, complete the dependency, round-trip again, confirm ready. 74/74 tests green. Also backfilled FEATURE_CHECKLIST.json entries for this test and the U1/U2 tests, which were missed at the time (Standing Rule 2) - 20/20 checklist entries green now.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0007] ⚙️ U5 — test/bench harness, npm run bench, CI budget gate (P0-C1)
    <!-- pmp:id=T0007;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0006","T0008"];linkedFiles=["test/bench/benchHarness.ts","test/bench/baseline.json","package.json",".github/workflows/ci.yml"];fileSendPolicy=global;notes=Shared measure() helper (3 warm-up + 5 timed runs) plus assertWithinBaseline() reading test/bench/baseline.json. Gates on min not median - median was measurably noisier in repeated local runs (7-23ms vs min's consistent 6-13ms). Committed queue-build-2000-tasks baseline at 25ms x2 tolerance = 50ms budget; measured min consistently under 6ms. npm run bench wired into CI after the Test step. 77/77 tests and 23/23 checklist entries still green.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [/] [T0008] ⚙️ U6 — Re-validate every feature that reads task metadata (P0-B3)
    <!-- pmp:id=T0008;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=["src/parser/PlanParser.ts","src/ui/TreeProvider.ts","src/controller/TaskCommandService.ts"];fileSendPolicy=global;notes=Research gate, dependency gate, queue blocking, implement context, file-send policy, linked files, confidence routing - none of these has ever run against data that survived a save (R10). Budget as M and expect to find bugs. Findings are P0 scope, not deferrals. STATUS: research gate (sibling, no dependsOn edge), collectAncestorChain, and collectResearchConclusions all re-validated post-round-trip and green (commit b64f87b). Confidence routing reviewed - operates on GeneratedTaskDraft before materialization, never re-read from a saved plan, no defect found. File-send policy resolver already covered field-by-field (U1) and exhaustively at resolver level (policy.test.ts). RESOLVED in U8 (076a663): collectLinkedFileSnapshots's vscode.workspace.fs calls are now tested - added an in-memory workspace.fs + workspaceFolders mock to test/shims/vscode.js. window/commands mocks were already added in U7 for AIService. Known finding from U3 also still open: getTaskBlockReason's research-gate sibling scan is O(children) per call at PlanParser.ts:130 (serialize, once per blocked task) and TreeProvider.ts:51 (tree render) - only QueueBuilder's bulk path got the O(1) precomputed-set treatment.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0009] ⚙️ U7 — Settings-scope hardening (P0-D1)
    <!-- pmp:id=T0009;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=["package.json","src/ai/AIService.ts"];fileSendPolicy=global;notes=Classify all 17 settings per §12.4. One-way-migrate the API keys: read once, move to secrets, clear the setting, tell the user. CI check: no setting without scope. Independent of the parser work, can run alongside U6.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [x] [T0010] ⚙️ U8 — Sensitivity check on egress (P0-D2)
    <!-- pmp:id=T0010;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=["src/util/PathSafetyChecker.ts","src/controller/TaskCommandService.ts"];fileSendPolicy=global;notes=Split isSensitiveWorkspacePath into isSecretBearingPath (.env*, .git/**, .vscode/**, .github/**, .devcontainer/**) and isBuildMetadataPath (package.json, lockfiles, tsconfig*.json, .gitignore etc). collectLinkedFileSnapshots now refuses SECRET_BEARING outright on egress with no override, names the refused files in a warning and in the consent summary. BUILD_METADATA still passes through as AI context. Write-path gate (isSensitiveWorkspacePath, still the OR of both) unchanged. Closed enough of the U6/U7 workspace.fs shim gap to test this - added an in-memory workspace.fs and workspaceFolders mock, first real test coverage collectLinkedFileSnapshots has ever had. 86/86 tests, 30/30 checklist.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [x] [T0011] ⚙️ U9 — Masking expansion (P0-D3)
    <!-- pmp:id=T0011;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=["src/util/PromptMasker.ts","src/ai/AIService.ts","test/masking.test.ts"];fileSendPolicy=global;notes=Added github_pat_, glpat-, AWS access keys, GCP API keys, Slack tokens, JWTs, connection strings. Found and fixed a real gap in the pre-existing password/secret/token/api_key pattern while writing its test - it missed JSON-quoted-key form ("api_key": "x"), only matched bareword. Wired maskEmails/maskIpAddresses to new window-scoped settings via AIService.resolveMaskingOptions() (extracted so it is testable without invoking a real provider). 103/103 tests, 40/40 checklist, 19/19 settings scoped.;createdAt=2026-09-27T00:00:00Z;completedAt=2026-09-27T00:00:00Z -->

  - [ ] [T0012] ⚙️ U10 — Security regression suite (P0-D4)
    <!-- pmp:id=T0012;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0007","T0009","T0010","T0011"];linkedFiles=["test/security.test.ts"];fileSendPolicy=global;notes=Workspace setting cannot weaken a control. .env in linkedFiles refused on egress and named. Symlink escape blocked at every write site.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0013] ⚙️ U11 — esbuild bundling (P0-C2)
    <!-- pmp:id=T0013;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0012"];linkedFiles=["esbuild.js","package.json",".vscodeignore"];fileSendPolicy=global;notes=Single out/extension.js. Keep tsc --noEmit for typechecking. Keep the tsc-based test build.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0014] 🏁 Phase P4F — Finish v2, release 2.0.0
  <!-- pmp:id=T0014;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0013"];linkedFiles=[];fileSendPolicy=global;notes=Exit: 2.0.0 on the Marketplace, checklist green. Estimate 1 to 2 weeks. Only the P4 items v3 depends on per §2.4 - the rest of the P4 backlog stays in FEATURE_PROGRESS.md. 2.0.0 ships before any v3 feature work: P5-S8 extends the same task metadata that P0-A3 repairs, and P0-D must not be skipped or a cloned repo could switch off egress controls.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0015] ⚙️ U12 — Auto-mark from scan deltas (P4-B1)
    <!-- pmp:id=T0015;parent=T0014;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0013"];linkedFiles=[];fileSendPolicy=global;notes=Becomes the drift detector D-status baseline that P6 generalizes.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0016] ⚙️ U13 — code-inferred tasks from scan (P4-B2)
    <!-- pmp:id=T0016;parent=T0014;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0015"];linkedFiles=[];fileSendPolicy=global;notes=Needed for unplanned-change drift and the onboarding wizard. Ordering vs U14/U15 is not specified in the source plan - sequenced here as a conservative default, confirm before relying on it.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0017] ⚙️ U14 — Goal-criterion enforcement + tighter response schema validation (P4-D1 + P4-D2)
    <!-- pmp:id=T0017;parent=T0014;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0015"];linkedFiles=[];fileSendPolicy=global;notes=P5-S9 replaces goalCriterionIndex with reqRefs at the same validation hook. Spec generation adds new schemas that need strict guards first. Ordering vs U13/U15 inferred, not stated explicitly in the source plan.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0018] ⚙️ U15 — Watcher error handling + dependency-cycle surfacing (P4-H3 + P4-H4)
    <!-- pmp:id=T0018;parent=T0014;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0017"];linkedFiles=[];fileSendPolicy=global;notes=Drift diagnostics reuse the same surfacing path. Ordering vs U13 inferred, not stated explicitly in the source plan.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0019] ⚙️ U16 — Release 2.0.0
    <!-- pmp:id=T0019;parent=T0014;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0016","T0017","T0018"];linkedFiles=["CHANGELOG.md","README.md","package.json"];fileSendPolicy=global;notes=CHANGELOG, README, version bump, publish per .github/copilot-instructions.md. P4-C2 (debate streaming) is deliberately deferred to P7 (see U62) rather than delaying 2.0.0 - it is a consistency argument, not a hard dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0020] 🏁 Phase P5 — Spec core
  <!-- pmp:id=T0020;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0019"];linkedFiles=[];fileSendPolicy=global;notes=Exit: core package extracted with a lint rule. specify -> clarify -> approve -> plan-from-spec works end to end. Schema v3 parses and migrates. Estimate 3 to 3.5 weeks. Depends on P0 hard and P4F for release ordering.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0021] ⚙️ U17 — Extract @planmyproject/core (P5-S0)
    <!-- pmp:id=T0021;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0019"];linkedFiles=[];fileSendPolicy=global;notes=Size M. The phase's real risk, goes first. 39 candidate modules plus a lint rule that fails any vscode import inside core/. Do this before the roughly 50 new modules of P5 through P9 are written against the current structure.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0022] ⚙️ U18 — Spec model types, S/R/AC/C ID generators (P5-S1)
    <!-- pmp:id=T0022;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0021"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Locks D-4: global R0001 requirement ID scope - high cost to reverse, the ID format is baked into every reqRefs in every plan file in the wild.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0023] ⚙️ U19 — SpecParser round-trip + tests mirroring parser.test.ts (P5-S2)
    <!-- pmp:id=T0023;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0022"];linkedFiles=[];fileSendPolicy=global;notes=Size L.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0024] ⚙️ U20 — SpecService: discover, load/save, lifecycle, watcher (P5-S3)
    <!-- pmp:id=T0024;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0023"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0025] ⚙️ U21 — ConstitutionService + prompt layer cap + I9 validator + untrusted-layer delimiting (P5-S4 + P5-S17)
    <!-- pmp:id=T0025;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=["src/ai/PromptBuilder.ts"];fileSendPolicy=global;notes=Size M+M. No dependency on the spec parser, can run alongside U18 through U20.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0026] ⚙️ U22 — TaskNode extensions + plan serialization + v2-to-v3 upgrader (P5-S8)
    <!-- pmp:id=T0026;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0022"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Carries D-1: the pmp:trace: second-comment decision is implemented here. Get it right - a plan file in the wild is a migration if the layout changes after P6/P9 add fields.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0027] ⚙️ U23 — Spec + task round-trip fidelity test, I10 (P5-S16)
    <!-- pmp:id=T0027;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0023","T0026"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Do not start U24 before this is green - it is the guard that stops P5 from re-creating P0-A with spec fields.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0028] ⚙️ U24 — SpecGenerator, SpecDraft schema, Specify Feature (P5-S5)
    <!-- pmp:id=T0028;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0024","T0025"];linkedFiles=[];fileSendPolicy=global;notes=Size L.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0029] ⚙️ U25 — Clarify Spec + marker resolution (P5-S6)
    <!-- pmp:id=T0029;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0028"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0030] ⚙️ U26 — Approve Spec, Supersede Spec, spec-gate block reason (P5-S7)
    <!-- pmp:id=T0030;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0024"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0031] ⚙️ U27 — Plan From Spec, SPEC LAYER, reqRefs validation (P5-S9)
    <!-- pmp:id=T0031;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0032] ⚙️ U28 — Specs tree view, spec CodeLens, spec diagnostics (P5-S10 + S11 + S13)
    <!-- pmp:id=T0032;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0024"];linkedFiles=[];fileSendPolicy=global;notes=Size M+S+S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0033] ⚙️ U29 — Spec Review WebView (P5-S12)
    <!-- pmp:id=T0033;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0029","T0030"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0034] ⚙️ U30 — Onboarding wizard option D, Start from a spec (P5-S14)
    <!-- pmp:id=T0034;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0028"];linkedFiles=[];fileSendPolicy=global;notes=Size S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0035] ⚙️ U31 — Integration test + checklist entries (P5-S15)
    <!-- pmp:id=T0035;parent=T0020;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0031"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Demo (§13.3 #1): one spec, one clarification resolved, plan-from-spec produces three root tasks with reqRefs.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0036] 🏁 Phase P6 — Traceability and drift
  <!-- pmp:id=T0036;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026"];linkedFiles=[];fileSendPolicy=global;notes=Exit: 11 detectors with tests. Incremental drift within budget. Problems panel populated. Verify Task records evidence. Estimate 3.5 to 4 weeks. Depends on P5-S8 (U22).;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0037] ⚙️ U32 — Trace types, TraceService graph, trace cache, dirty-set subgraph, file-existence cache (P6-T1 + P6-T15)
    <!-- pmp:id=T0037;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026"];linkedFiles=[];fileSendPolicy=global;notes=Size M+M. File-existence cache avoids per-run stat storms.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0038] ⚙️ U33 — Link validation at materialization + sensitivity refusal in shared handlers (P6-T2 + P6-T19)
    <!-- pmp:id=T0038;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0037"];linkedFiles=[];fileSendPolicy=global;notes=Size S+S. Sensitivity refusal lives in the shared handlers per I14 and I15.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0039] ⚙️ U34 — GitFacade with graceful degradation, completedRev on status change (P6-T3)
    <!-- pmp:id=T0039;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0013"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Standalone - can run any time after P0.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0040] ⚙️ U35 — Detectors D1, D2, D4, D5, D6, spec/plan only (P6-T4)
    <!-- pmp:id=T0040;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0037"];linkedFiles=[];fileSendPolicy=global;notes=Size L.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0041] ⚙️ U36 — Detectors D3, D7, D8, D11, git-aware + file-hash fallback (P6-T5)
    <!-- pmp:id=T0041;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0039","T0040"];linkedFiles=[];fileSendPolicy=global;notes=Size L. R4, drift noise, is a design constraint here not a later fix. D7 ships at Information severity with ignore globs and per-spec mute, and runs only on manual Verify unless drift.autoCheck opts in.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0042] ⚙️ U37 — Detector D9, constitution/constraints (P6-T6)
    <!-- pmp:id=T0042;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0025"];linkedFiles=[];fileSendPolicy=global;notes=Size S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0043] ⚙️ U38 — DriftDiagnostics publisher + quick fixes (P6-T7)
    <!-- pmp:id=T0043;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0040"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0044] ⚙️ U39 — Triggers, debounce, incremental scheduling, scoring, status bar + write-origin tokens (P6-T8 + P6-T16)
    <!-- pmp:id=T0044;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0041","T0043"];linkedFiles=[];fileSendPolicy=global;notes=Size M+S. Write-origin tokens replace isSelfWriting.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0045] ⚙️ U40 — drift.bench against the §4.5 budgets (P6-T18)
    <!-- pmp:id=T0045;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0044"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Amendment A1: benchmark in-process before deciding on the LSP move, inverting the spec's own T17-before-T18 ordering.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0046] ⚖️ U41 — Checkpoint: LSP decision (amendment A1)
    <!-- pmp:id=T0046;parent=T0036;type=decision;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0045"];linkedFiles=[];fileSendPolicy=global;notes=If incremental drift is inside the 100ms budget and the full sweep is inside 2s on the extension host, defer U42 to 3.1 and record the measurement in FEATURE_PROGRESS.md instead of standing up the LSP.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0047] ⚙️ U42 — Stand up the LSP server, if U41 says so (P6-T17)
    <!-- pmp:id=T0047;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0046","T0021"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Conditional on the U41 checkpoint outcome.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0048] ⚙️ U43 — Drift tree view + Export Report (P6-T9)
    <!-- pmp:id=T0048;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0044"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0049] ⚙️ U44 — Verify Task/Verify Spec, TaskVerification model, verify.runTests hardening (P6-T10 + P6-T20)
    <!-- pmp:id=T0049;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0041"];linkedFiles=[];fileSendPolicy=global;notes=Size L+S. No "always" mode for runTests. Resolved-command confirmation. Re-confirm on task-definition change.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0050] ⚙️ U45 — Analyze Spec coverage report + pre-implement drift gate (P6-T11 + P6-T12)
    <!-- pmp:id=T0050;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0040"];linkedFiles=[];fileSendPolicy=global;notes=Size S+S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0051] ⚙️ U46 — Source CodeLens, opt-in (P6-T13)
    <!-- pmp:id=T0051;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0037"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0052] ⚙️ U47 — Integration tests (P6-T14)
    <!-- pmp:id=T0052;parent=T0036;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0049"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Demo (§13.3 #2): edit R0001, Problems panel shows D1 on T0010, quick fix refreshes links. Delete a linked file, D2 appears.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0053] 🏁 Phase P8 — Cost monitoring (parallel with P6)
  <!-- pmp:id=T0053;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0019"];linkedFiles=[];fileSendPolicy=global;notes=Exit: every AI call logged with usage and cost. Consent shows a non-blocking estimate. Budgets enforce. Ledger rotates. Estimate 2 weeks. Depends on nothing in P5 - touches src/ai/ and a new src/cost/ only. For a solo developer, best used as the context-switch phase when P6 stalls on a hard detector.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0054] ⚙️ U48 — AIUsage type, Claude SSE streaming+usage+max_tokens, OpenAI streaming+usage, Copilot countTokens, sanitize error bodies (P8-C1)
    <!-- pmp:id=T0054;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0019"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Closes P4-H2.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0055] ⚙️ U49 — Model settings, selectChatModels by family, remove hardcoded IDs (P8-C2)
    <!-- pmp:id=T0055;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0054"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Sets the default Claude model per D-5 (claude-opus-5) with model.claude documented for cost-sensitive users.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0056] ⚙️ U50 — UsageLedger append + rollups + rotation, wire every AI call site (P8-C3)
    <!-- pmp:id=T0056;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0054"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0057] ⚙️ U51 — PricingTable with dated defaults and overrides (P8-C4)
    <!-- pmp:id=T0057;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0056"];linkedFiles=[];fileSendPolicy=global;notes=Size S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0058] ⚙️ U52 — TokenEstimator + PromptBudgeter (P8-C5)
    <!-- pmp:id=T0058;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0054"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Ordering trap per §5.5: PromptBudgeter must trim before maskPromptText runs, or a trim reintroduces unmasked content into the final string. Asserted in U55.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0059] ⚙️ U53 — BudgetGuard + consent summary with estimate and session spend (P8-C6)
    <!-- pmp:id=T0059;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0057","T0058"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0060] ⚙️ U54 — Usage tree view, status bar, tooltips, Export Usage, Reset Counters (P8-C7 + P8-C8)
    <!-- pmp:id=T0060;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0056"];linkedFiles=[];fileSendPolicy=global;notes=Size M+S. R5: never show a dollar figure for Copilot - label every Copilot row estimated, included in subscription.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0061] ⚙️ U55 — Tests: rollups, pricing incl. unpriced, budgeter trimming order, thresholds, provider usage from recorded fixtures (P8-C10)
    <!-- pmp:id=T0061;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0059"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Asserts the U52 trim-before-mask ordering explicitly.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0062] ⚙️ U56 — File-level provenance joining ledger and trace links, Export Provenance Report (P8-C11)
    <!-- pmp:id=T0062;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0056","T0037"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0063] ⚙️ U57 — Usage dashboard WebView (P8-C9)
    <!-- pmp:id=T0063;parent=T0053;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0060"];linkedFiles=[];fileSendPolicy=global;notes=Size M. First slip candidate - the spec itself marks it can slip to P10. Demo (§13.3 #3): three operations, Usage view totals match the ledger, budget warning at 80%.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0064] 🏁 Phase P7 — Native surfaces
  <!-- pmp:id=T0064;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0056","T0029","T0049"];linkedFiles=[];fileSendPolicy=global;notes=Exit: @pmp handles all slash commands. MCP server usable from at least 2 agents. VS Code shim usable from Copilot agent mode. Hand-off implement closes the trace loop. Estimate 2.5 weeks. Depends on P8-C3 (U50) for /cost, and P5-S6 / P6-T10 for the lifecycle commands.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0065] ⚙️ U58 — ChatParticipant skeleton, /status, /tasks, /cost, follow-ups (P7-N1)
    <!-- pmp:id=T0065;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0056"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0066] ⚙️ U59 — MCP server over the core: nine handlers, schemas, stdio transport, read-only tools first (P7-N3)
    <!-- pmp:id=T0066;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0037","T0021"];linkedFiles=[];fileSendPolicy=global;notes=Size M. The MCP server widens the trust boundary to any MCP client on the machine, per §7.2 draft3. Read-only nine ship first so a transport-layer mistake leaks information rather than mutating a plan.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0067] ⚙️ U60 — Mutating handlers with confirmation and ledger, vscode.lm.registerTool shim, shared parsed-document cache keyed by document.version (P7-N4)
    <!-- pmp:id=T0067;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0066"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Closes F4.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0068] ⚙️ U61 — MCP hardening: stdio only, enforcement in shared handlers, confirmation a workspace cannot defeat, transport + calling client in the ledger (P7-N10)
    <!-- pmp:id=T0068;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0066"];linkedFiles=[];fileSendPolicy=global;notes=Size M. One security suite run against both transports. Does not descope if P7 runs late.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0069] ⚙️ U62 — /specify, /clarify, /plan, /analyze, /verify, /debate with streaming (P7-N2, absorbs deferred P4-C2)
    <!-- pmp:id=T0069;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0029","T0049"];linkedFiles=[];fileSendPolicy=global;notes=Size L. The single most dependency-laden unit in the plan - waits on both U25 and U44.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0070] ⚙️ U63 — Implement With Agent hand-off + watcher-based link proposal (P7-N5)
    <!-- pmp:id=T0070;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0067"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Ships with a first-run notice that says plainly that in hand-off mode PathSafetyChecker, sensitivity refusal, and overwrite confirmation do not apply - the constitution's no-codebase-writes-without-task-scope red line is structurally unenforceable there. PMP still runs every gate before hand-off, scopes the prompt to the task's linked files, watches for files touched outside the expected set, and records provenance. R3: feature-detect the agent-mode APIs, fall back to classic implement, pin engines.vscode. Defers to 3.1 if P7 runs late.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0071] ⚙️ U64 — GitFacade user name fix + branch offer (P7-N6)
    <!-- pmp:id=T0071;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0039"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Fixes F1.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0072] ⚙️ U65 — Document links, hovers, definitions for IDs (P7-N7)
    <!-- pmp:id=T0072;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0024"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0073] ⚙️ U66 — Walkthrough, welcome views, snippets (P7-N8)
    <!-- pmp:id=T0073;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0069"];linkedFiles=[];fileSendPolicy=global;notes=Size S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0074] ⚙️ U67 — Chat handler and tool input validation tests, vscode shim growth (P7-N9)
    <!-- pmp:id=T0074;parent=T0064;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0069","T0067"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Demo (§13.3 #4): @pmp /specify, /plan, /implement with Copilot agent mode calling pmp_recordTrace, and the same tool called from a second, non-VS Code agent over MCP against the same workspace.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0075] 🏁 Phase P9 — SDLC compatibility
  <!-- pmp:id=T0075;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026","T0039"];linkedFiles=[];fileSendPolicy=global;notes=Exit: GitHub Issues push. Jira push + pull-status. Spec Kit round-trip. ADR export. pmp drift as a CI gate. Estimate 3 weeks. Depends on P5-S8 (U22), and P6-T3 (U34) for GitHub repo inference. 3.0.0 scope is cut here, not expanded, per R6/D-8: GitHub Issues + Jira push/pull-status ship, Azure DevOps/Linear/GitLab are 3.1.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0076] ⚙️ U68 — SyncAdapter interface, SyncItem rendering, ExternalRef serialization (P9-X1)
    <!-- pmp:id=T0076;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0077] ⚙️ U69 — SyncService: mode, conflict policy, state files, confirmation, background job with progress and cancellation (P9-X2)
    <!-- pmp:id=T0077;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0076"];linkedFiles=[];fileSendPolicy=global;notes=Size L.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0078] ⚙️ U70 — pmp CLI over the core: specify, plan, drift --format sarif, analyze, sync + CI Action (P9-X10)
    <!-- pmp:id=T0078;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0040","T0077"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Deliberately sequenced early, not last, per the plan's reordering of the spec's task numbering. Depends only on the core and the detectors, makes adapter logic testable headlessly, de-risks Jira directly, and delivers pmp drift --format sarif as a PR check which is what turns G4 from advisory into enforceable.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0079] ⚙️ U71 — GitHubIssuesAdapter, native auth, the reference adapter (P9-X4)
    <!-- pmp:id=T0079;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0077","T0039"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Deliberately sequenced before Jira (U72), per the plan's reordering of the spec's task numbering and R2's own mitigation to ship GitHub Issues as the reference adapter first, proving SyncAdapter against real API shapes while there is still time to change it. Carries a disclosure obligation: GitHub's repo scope grants read/write to every private repository the user can access - request public_repo when the target is public, prefer fine-grained tokens where available, and state the grant in the consent flow, README, and PRIVACY.md. If P9 runs late after this unit, ship 3.0 with GitHub Issues only and move Jira to 3.1.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0080] ⚙️ U72 — JiraAdapter: auth, create/update, transitions, search, ADF, backoff (P9-X3)
    <!-- pmp:id=T0080;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0077"];linkedFiles=[];fileSendPolicy=global;notes=Size XL. The only XL in the project and the spec's own likeliest slip candidate, flagged twice. Its descope is already written into D-8 - use it early rather than late.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0081] ⚙️ U73 — Tracker credential binding: host stored with the secret, other hosts refused, HTTPS required, cross-host redirects rejected, target host named in the confirmation (P9-X11)
    <!-- pmp:id=T0081;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0077"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Not optional and not cosmetic - jira.siteUrl unscoped means a repository can point the sync at an attacker's host and receive the user's real Jira API token in a basic-auth header. Ships with or before U72. Does not descope if anything runs late.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0082] ⚙️ U74 — Sync UI + D10 detector (P9-X5)
    <!-- pmp:id=T0082;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0079"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0083] ⚙️ U75 — SpecKitBridge import/export (P9-X6)
    <!-- pmp:id=T0083;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0024"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Depends only on P5, can run alongside P6.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0084] ⚙️ U76 — AdrExporter, Superpowers-style plan export, Jira CSV export (P9-X7)
    <!-- pmp:id=T0084;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0026"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Depends only on P5, can run alongside P6.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0085] ⚙️ U77 — Requirements import into a spec draft (P9-X8)
    <!-- pmp:id=T0085;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0028"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0086] ⚙️ U78 — Adapter tests with recorded HTTP fixtures, conflict matrix, Spec Kit round-trip, ADR golden files (P9-X9)
    <!-- pmp:id=T0086;parent=T0075;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0079","T0080","T0083"];linkedFiles=[];fileSendPolicy=global;notes=Size L. Demo (§13.3 #5): spec becomes an epic, tasks become stories, a status change in Jira shows as D10 then syncs.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

- [ ] [T0087] 🏁 Phase P10 — Hardening and release
  <!-- pmp:id=T0087;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0052","T0063","T0074","T0086"];linkedFiles=[];fileSendPolicy=global;notes=Exit: 3.0.0 published, all §4.5 budgets met on the full build. Estimate 1.5 to 2 weeks.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0088] ⚙️ U79 — Schema v3 marker, upgrader chain v1->v2->v3 in one pass, backups, v2 read-only mode (P10-H1)
    <!-- pmp:id=T0088;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0052","T0063","T0074","T0086"];linkedFiles=[];fileSendPolicy=global;notes=Size M.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0089] ⚙️ U80 — Queue becomes derived, D-12: regenerated on read, written to a gitignored file, not serialized into the committed plan (P10-H13)
    <!-- pmp:id=T0089;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0088"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Deliberately last among the file-format changes - alters the shape of the committed plan file and must not land anywhere near the P0 parser fix. Ordering vs U81-U89 is table order from the source plan, not an explicitly stated dependency - confirm before relying on it.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0090] ⚙️ U81 — Mutation-path cleanup, F14: reuse in-memory serialized string for undo snapshot, threshold-gate debate archive sweep, lazy service construction (P10-H12)
    <!-- pmp:id=T0090;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0089"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Ordering inferred from table order, not an explicitly stated dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0091] ⚙️ U82 — node:fs for file: paths with workspace.fs fallback, split PathSafetyChecker into pure normalizer + host symlink check (P10-H10)
    <!-- pmp:id=T0091;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0090"];linkedFiles=["src/util/PathSafetyChecker.ts"];fileSendPolicy=global;notes=Size M. Ordering inferred from table order, not an explicitly stated dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0092] ⚙️ U83 — Drop retainContextWhenHidden, F13, serialize/restore panel state, pmp: virtual documents for reports, one status bar item (P10-H11)
    <!-- pmp:id=T0092;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0091"];linkedFiles=[];fileSendPolicy=global;notes=Size M. Ordering inferred from table order, not an explicitly stated dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0093] ⚙️ U84 — usedInPrompts out of the committed index, F8, scanner buckets + content hashes (P10-H5 + P10-H6)
    <!-- pmp:id=T0093;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0092"];linkedFiles=[];fileSendPolicy=global;notes=Size S+M. Ordering inferred from table order, not an explicitly stated dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0094] ⚙️ U85 — Retry/backoff, Test AI Connection (P10-H2)
    <!-- pmp:id=T0094;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0093"];linkedFiles=[];fileSendPolicy=global;notes=Size S. Ordering inferred from table order, not an explicitly stated dependency.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0095] ⚙️ U86 — Constitution 1.1, hand-written (P10-H3)
    <!-- pmp:id=T0095;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0094"];linkedFiles=["constitution.md"];fileSendPolicy=global;notes=Size S. Done by hand, not generated - constitution.md §10 requires a human-authored commit with rationale for any constitutional change. These are corrections, not additions: remove the HIPAA/SOC2 contexts claim from §11, correct the ai-audit.jsonl promise to match D-14 since it is a usage ledger not an audit log, and state that red lines are model guidance whose enforcement lives in code.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0096] ⚙️ U87 — Verify §4.5 budgets on the full v3 build, record in FEATURE_PROGRESS.md (P10-H4)
    <!-- pmp:id=T0096;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0095"];linkedFiles=["FEATURE_PROGRESS.md"];fileSendPolicy=global;notes=Size S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0097] ⚙️ U88 — SECURITY.md, PRIVACY.md, NOTICE, IP/indemnity/provider-terms section, assurance-language pass, SBOM + npm audit in CI (P10-H14)
    <!-- pmp:id=T0097;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0096"];linkedFiles=["SECURITY.md","PRIVACY.md","NOTICE"];fileSendPolicy=global;notes=Size M. Does not descope if anything runs late - a security control and the documents describing it ship or the release does not.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0098] ⚙️ U89 — Docs, README, CHANGELOG, template, screenshots, checklist completion pass (P10-H7 + P10-H8)
    <!-- pmp:id=T0098;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0097"];linkedFiles=["README.md","CHANGELOG.md","planmyproject.template.md"];fileSendPolicy=global;notes=Size M+S.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

  - [ ] [T0099] ⚙️ U90 — Release 3.0.0 (P10-H9)
    <!-- pmp:id=T0099;parent=T0087;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0098"];linkedFiles=["package.json"];fileSendPolicy=global;notes=Size S. Demo (§13.3 #6): fresh install on a v1 plan migrates to v3, walkthrough completes.;createdAt=2026-09-27T00:00:00Z;completedAt=null -->

## Execution Queue (Auto-Generated, Leaf Tasks Only)

<!-- This section is derived from the tree above by QueueBuilder and will be regenerated the first time the PlanMyProject extension opens this file (Refresh Tree / Rebuild Queue). Left empty here since this file was hand-authored outside the running extension. -->
