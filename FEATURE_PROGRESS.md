# PlanMyProject v2 — Feature Progress Report

**As of March 19, 2026**  
**Validated against:** `PlanMyProject_v2_Spec.md` + current code in `src/` + `npm run compile` + `npm test`

---

## Executive Summary

| Metric | Status |
|---|---|
| Build/Test Health | ✅ `compile` and all 6 test suites passing |
| Delivery Model | ✅ Big-bang rewrite branch structure present |
| Overall Spec Alignment | 🟡 ~78% implemented / wired |
| Major Risk | Spec tracker previously overstated several sections as fully complete |

---

## Implemented in This Validation Pass

The following missing behaviors were implemented now:

1. `Open Plan` now auto-runs scan when no scan cache exists.
2. Scanner now reads both `.gitignore` and `.pmpignore` patterns.
3. `.gitignore` suggestion flow added for `.pmp/scan-cache.json`.
4. Workspace state now persists:
   - AI session "Allow All" consent
   - last scan timestamp
5. Implement flow now blocks non-implementation tasks.
6. Implement flow now prompts before overwriting files currently marked `complete` by scan.
7. Debate panel now rehydrates existing debate log entries from plan file.
8. Debate panel now displays task rationale.
9. Debate conflict markers now raise warning in UI.
10. Debate rewrite now regenerates rationale via AI.
11. Debate split now supports AI-suggested split titles + user selection.
12. Tree rows now show clearer blocked/origin/confidence-at-a-glance indicators.
13. Status bar "No project goal set" click now opens Goal Setup.

---

## Current Status by Area

### 1) Core Architecture & Data Model

| Area | Status | Notes |
|---|---|---|
| Modular rewrite layout (`controller/parser/model/scanner/ai/...`) | ✅ Complete | Present and active runtime paths use v2 modules |
| v2 task/goal/scan/research models | ✅ Complete | Core fields implemented |
| Queue builder with dependency/research blocking | ✅ Complete | Implemented and unit tested |
| Safe-write/path checks + prompt masking baseline | ✅ Complete | Implemented and unit tested |

### 2) Parser, Schema, Migration

| Area | Status | Notes |
|---|---|---|
| v2 parser/serializer round-trip | ✅ Complete | Covered by `parser.test.ts` |
| v1 detection + migration prompt + backup file | ✅ Complete | Implemented in controller/repository/upgrader |
| v1 compatibility path | 🟡 Partial | Commands requiring v2 are blocked, but explicit "read-only mode UX" is minimal |
| Debate archive comment block in `planmyproject.md` | ❌ Missing | Archive file exists under `.pmp/debate-archive/`, but no `pmp:debate-archive` block serialization |

### 3) Workspace Analysis / `.pmp` Persistence

| Area | Status | Notes |
|---|---|---|
| Scanner pipeline (discover/lang/deps/modules/signatures/features/tests) | ✅ Complete | Implemented |
| Scan limits/settings (`maxFiles`, `maxFileSize`, `extractSignatures`) | ✅ Complete | Implemented via config |
| `.pmpignore` support | ✅ Complete | Implemented |
| `.gitignore` support in scanner | ✅ Complete | Implemented in this pass |
| Persisted scan cache/research index/debate archive files | ✅ Complete | Implemented |
| `.gitignore` suggestion flow for scan cache | ✅ Complete | Implemented in this pass |
| Rich classification (source/test/config/asset/generated buckets) | 🟡 Partial | Source/test handling exists; broader typed classification is limited |

### 4) AI Platform / Generation Pipeline

| Area | Status | Notes |
|---|---|---|
| Multi-provider service (Copilot/Claude/OpenAI) | ✅ Complete | Implemented via `AIService` abstraction |
| API key storage in Secret Storage | ✅ Complete | Implemented with migration from legacy settings |
| Layered prompt builder | ✅ Complete | Implemented |
| Response parsing + validation + dedupe | 🟡 Partial | Validation exists; some strict schema checks from spec are lighter than documented |
| Confidence threshold gating | ✅ Complete | Implemented |
| Goal criterion index validation | 🟡 Partial | Not strictly enforced against goal criteria bounds in generation pipeline |
| Streaming UX | 🟡 Partial | On-chunk hooks exist; not fully reflected in Debate panel for planning stream |

### 5) UI / Commands

| Area | Status | Notes |
|---|---|---|
| Command surface (retained + v2 additions) | ✅ Complete | Commands registered in `package.json` + controller |
| Tree provider with task types + blocked/origin/confidence hints | ✅ Complete | Updated in this pass |
| CodeLens (`Plan | Debate | Implement | Scan`) | ✅ Complete | Implemented |
| Debate panel actions (accept/rewrite/split/dismiss/defer) | ✅ Complete | Implemented; rewrite/split improved this pass |
| Debate persistence across restart | ✅ Complete | Rehydration implemented in this pass |
| Goal setup flow | ✅ Complete | Input-driven flow implemented (not dedicated webview UI) |
| Status bar warning + scan states | ✅ Complete | Implemented |

### 6) Execution / Research / Implementation

| Area | Status | Notes |
|---|---|---|
| Research completion + indexing + queue unblocking | ✅ Complete | Implemented |
| Implement prompt includes research conclusions and linked files by policy | ✅ Complete | Implemented |
| Research/decision tasks blocked from Implement flow | ✅ Complete | Implemented in this pass |
| Extra confirm for writes into scan-complete files | ✅ Complete | Implemented in this pass |
| Auto-rescan after implement | ✅ Complete | Implemented |
| Auto-mark task complete based on scan deltas | ❌ Missing | Not implemented |

### 7) Security / Policy / Consent

| Area | Status | Notes |
|---|---|---|
| Global + per-task file-send policy resolution | ✅ Complete | Implemented and tested |
| Prompt masking (tokens/secrets) | ✅ Complete | Implemented |
| Session consent persistence | ✅ Complete | Implemented in this pass (workspaceState) |
| Extension state for active debate draft input | ❌ Missing | Not currently persisted |

### 8) Partial Codebase Awareness

| Area | Status | Notes |
|---|---|---|
| Gap-aware generation based on scan completeness | 🟡 Partial | Existing-complete module exclusion exists |
| Initial detection UX with options A/B/C (scan around gaps / fresh plan / import) | ❌ Missing | Not implemented as explicit UX flow |
| Code-inferred task generation path | 🟡 Partial | Data model supports origin type; full pipeline behavior is limited |

### 9) Testing / Acceptance Gates

| Area | Status | Notes |
|---|---|---|
| Unit tests for parser/path/policy/queue/response/migration | ✅ Complete | 6 suites passing |
| Integration workflows from spec | ❌ Missing | Most spec-listed integration scenarios are not yet automated |
| Feature coverage >=95% gate | ❌ Missing | Not currently measured/reported in codebase |

---

## Updated Bottom Line

- v2 rewrite is structurally solid and operational.
- Core planning, scanning, provider integration, and safe-write foundations are in place.
- Several user-visible gaps were closed in this pass (scan trigger, debate rehydration, rewrite/split AI assist, safety prompts, gitignore flow).
- Remaining work is concentrated in:
  1. spec-level partial-codebase onboarding UX,
  2. debate archive-in-plan serialization,
  3. stronger schema/goal-reference validation,
  4. integration test coverage and acceptance gating.

---

## Suggested Next Milestones

1. Implement partial-codebase detection wizard (A/B/C options) and wire into first-run planning.
2. Add `pmp:debate-archive` block serialization/parsing and mark archived entries read-only in panel.
3. Add integration test harness for migration, scan->generate->queue, research->index->prompt injection, and debate multi-author lifecycle.
4. Add explicit feature coverage checklist mapped to spec sections for merge gate.

