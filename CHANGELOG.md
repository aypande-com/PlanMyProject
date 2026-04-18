# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Debate panel assistant is now presented as `PlanBot`, including updated debate prompts and UI labels.
- Debate prompts now force critical debate behavior: justify, challenge, and rationalize user suggestions before proposing an action.
- Implementation flow now blocks tasks with unresolved debate threads (in addition to dependency/research blockers) and surfaces explicit block reasons in queue/tree messaging.
- Debate serialization now persists structured action markers (`[action:accept|rewrite|split|dismiss|defer]`) in plan and archive logs.
- Rewrote extension architecture for v2 around modular controller, parser, scanner, AI, debate, queue, and storage layers.
- Added schema v2 parsing/serialization with typed task metadata, goal blocks, rationale, dependency-aware queue sections, and v1 migration support.
- Added workspace scanner pipeline with language/dependency/signature/module inference plus persisted scan cache.
- Added research index and debate archive persistence under `.pmp/`.
- Added multi-provider AI abstraction (Copilot, Claude, OpenAI) and layered prompt/response parsing pipeline.
- Added v2 command surface (goal setup/import, scan refresh, debate, rationale, linked files, policy override, index/archive viewers, summary export).
- Replaced v1 tests with v2 unit coverage for parser, queue, migration, policy resolver, path safety, and AI response parsing.

## [1.0.2] - 2026-03-16

- Refreshed README build-status metadata and test-count badges from the latest verification run.

## [1.0.1] - 2026-03-15

- Updated release documentation: moved `Unreleased` implementation notes into the `1.0.0` section.
- Updated README to reflect current release version `v1.0.1`.

## [1.0.0] - 2026-03-15

- Refactored the extension entrypoint into smaller helper modules to reduce `extension.ts` size and repeated plan parsing work.
- Fixed the tree view toolbar add action so it creates a new root task even when tasks already exist.
- Optimized activation and startup overhead with lazy loading and narrower activation/watch scopes.
- Added in-tree progress reporting for Copilot requests and moved status to the active task item.
- Added cancellable active-request flow with `PlanMyProject: Cancel Active Request`.
- Added command icon for cancel action and conditional tree menu behavior for running tasks.
- Hardened generated workspace writes against symlink-escape paths outside workspace root.
- Expanded tests to cover tree-provider runtime behavior.

## [0.1.1] - 2026-02-23

- Added `Allow All` option in Copilot consent modal for session-scoped approval.
- Expanded README with explicit data exchange details for Copilot requests.
- Documented supported workspace edit behavior and sensitive-file safeguards.

## [0.1.0] - 2026-02-22

- First publish-ready release of PlanMyProject.
- Added extension metadata and Marketplace publishing scripts.
- Added packaging hygiene updates and license.
