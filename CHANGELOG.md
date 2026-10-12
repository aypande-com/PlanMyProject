# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.0.0] - 2026-10-12

Major release: the v2 rewrite, plus a security and reliability pass. It changes how settings are scoped and where API keys live, so read **Upgrading from 1.x** first.

### Upgrading from 1.x

- **Plan files move to schema v2.** v1 plans open read-only until you migrate them; migration keeps a backup at `.pmp/planmyproject.v1.backup.md`.
- **API keys are moved out of `settings.json`.** If `planmyproject.claudeApiKey` or `planmyproject.openaiApiKey` is found at any scope, it is stored in VS Code secure storage, removed from every settings file, and you are told. If that file was ever committed, treat the key as compromised and rotate it. Use `PlanMyProject: Set API Key` from now on.
- **A workspace can no longer weaken your safety settings.** `aiProvider`, `sendFileContentsToAI`, `defaultTaskFileSendPolicy` and `requireAiConsent` are machine-scoped and the API keys are application-scoped, so a cloned repository's `.vscode/settings.json` cannot change them. `researchGate` and `confidenceThreshold` can still be set per workspace, but only to a stricter value than yours.
- **Secret-bearing files are never sent to the AI.** Linked files under `.env*`, `.git/`, `.vscode/`, `.github/` and `.devcontainer/` are refused, with no override, and the warning names each file. Lockfiles and build configs are still allowed as context.

### Added

- Workspace scanner (languages, dependencies, signatures, modules, missing areas) with a cached result under `.pmp/`.
- Project goals with success criteria, constraints and out-of-scope items; import a goal from markdown; starter root tasks suggested from the goal.
- Wording review after `Set Project Goal` and `Import Goal Statement`: one consent-gated AI pass proposes spelling fixes (pre-checked) and flags vague requirement language such as "fast" or "secure" for you to rewrite. If it is declined or fails, your original text is kept.
- `PlanMyProject: Infer Tasks From Scan` (and an `Infer` CodeLens) adds `code-inferred` tasks from what the scan finds in the workspace.
- After `Implement Task`, if the AI did not mark the task complete but its linked files clearly changed, you are asked whether to mark it complete.
- AI-generated tasks that cite a success criterion that does not exist are given lower confidence.
- A dependency cycle is now reported instead of silently sitting in the queue, and plan-file watcher failures are logged to the output channel and warned about once per session.
- Research index of completed research and decision tasks, reused when planning later tasks.
- `PlanBot` debate with accept, rewrite, split, dismiss and defer resolutions; unresolved debates block implementation.
- Per-task file send policy, AI consent modes, and a research gate that blocks implementation until research is done.
- Prompt masking now covers AWS, GCP, Slack, GitHub and GitLab tokens, JWTs, and database connection strings. `planmyproject.masking.maskEmails` and `planmyproject.masking.maskIpAddresses` (both off by default) redact emails and IP addresses.
- `PlanMyProject: Set API Key`, `PlanMyProject: Undo Last Change`, `PlanMyProject: Scan Task`, and the v2 command set (goal setup/import, scan refresh, debate, rationale, linked files, policy override, index and archive viewers, summary export).
- Multi-provider AI abstraction (Copilot, Claude, OpenAI).

### Changed

- The extension is bundled into a single file, which is smaller to install and faster to activate.
- Plans with thousands of tasks load, save and build their execution queue in tens of milliseconds. Task metadata (dependencies, linked files, notes, timestamps, per-task file policy) is preserved exactly across saves.
- Every setting now declares an explicit scope.

### Fixed

- Setting a project goal in a new workspace could leave the saved plan with tasks that reference a goal but an empty Goals section.

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
