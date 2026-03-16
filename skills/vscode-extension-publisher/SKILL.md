---
name: vscode-extension-publisher
description: Publish VS Code extensions safely from build to Marketplace release using repository-defined instructions. Use when the user asks things like "publish my extension", "publish my VS Code extension as a patch release", "release the extension", "ship a new version", "bump and release", "do a full minor release", "run the vscode publish workflow", "package the extension but don't publish", or "bump the version and update the changelog".
---

# VS Code Extension Publisher

Execute a safe, repeatable VS Code extension release workflow driven by repository instructions.

## Load Authority First

1. Read `.github/copilot-instructions.md` at repository root.
2. If it does not exist, read `copilot-instructions.md`.
3. Treat that file as the single source of truth for commands, sequence, and guardrails.
4. Extract concrete commands from its build, test, changelog/versioning, and publishing sections before running anything.
5. If neither file exists, stop and ask the user for the release instruction file location.

## Route By User Intent

Use the first matching route:

1. `full-release`:
   Trigger on prompts like "publish my extension", "publish my VS Code extension as a patch release", "release the extension", "ship a new version", "bump and release", "full minor release", "do a full minor release of my extension", "run the vscode publish workflow".
   Run the complete 5-step pipeline.
2. `package-only`:
   Trigger on prompts like "package the extension", "create a vsix", "package but do not publish", "package the extension but don't publish yet".
   Run build + test + package + `vsce ls`; do not publish.
3. `version-only`:
   Trigger on prompts like "bump version and update changelog".
   Run changelog + version bump; do not package/publish unless asked.

## Non-Negotiable Release Rules

1. Never publish when build fails.
2. Never publish when tests fail.
3. Always ask the user to confirm bump type (`patch`, `minor`, `major`) before running `npm version`, even when the user already suggested one.
4. Never run `major` without explicit confirmation that breaking changes are intended.
5. Never tag or push tags before changelog release notes are dated and populated.
6. Always run `npx vsce ls` (or repository-equivalent command) before publish to audit package contents.
7. Prefer commands from the copilot instruction file over generic defaults.

## 5-Step Pipeline

### Step 1: Build

1. Run the repository build command from the instruction file (for example `npm run build` and/or `npm run compile`).
2. If build fails, stop and report the failure; do not continue.

### Step 2: Test

1. Run `npm test` unless the instruction file defines another test command.
2. If tests fail, refuse publish and explain the blocking failures.

### Step 3: Changelog

1. Update `CHANGELOG.md` under `## [Unreleased]` with user-facing entries.
2. Keep entries specific and release-ready (no TODO placeholders).

### Step 4: Version Bump

1. Ask for bump type confirmation before versioning. If user already provided a type, restate it and request explicit confirmation.
2. Run one command:
   - `npm version patch --no-git-tag-version`
   - `npm version minor --no-git-tag-version`
   - `npm version major --no-git-tag-version`
3. Convert `Unreleased` notes into a dated version section (`## [X.Y.Z] - YYYY-MM-DD`).
4. Add a new empty `## [Unreleased]` section at the top.
5. Create release commit and tag only after changelog is correct.

### Step 5: Publish

1. Package using repository command (for example `npm run package` or `npx vsce package`).
2. Audit package contents using `npx vsce ls` (or equivalent `@vscode/vsce` command variant).
3. Publish using repository command (for example `npm run publish:vsce` or `npx vsce publish`).
4. Push branch and tag only after publish succeeds.
5. Optionally create a GitHub Release with the `.vsix` artifact when requested.

## Failure Handling

1. Reject requests to publish with failing tests or failing build, even if user asks to proceed anyway.
2. Explain the exact blocked step and command output summary.
3. Offer the next safe action: fix failures, rerun verification, then continue release.

## Expected Inputs

- VS Code extension repository.
- `package.json`, `CHANGELOG.md`, `tsconfig.json`, `.vscodeignore`.
- Repository release instructions in `.github/copilot-instructions.md` or `copilot-instructions.md`.

## Expected Outputs

- For `full-release`: published Marketplace version, git tag, and optional GitHub Release.
- For `package-only`: generated `.vsix` and package audit report without publishing.
- For `version-only`: updated version metadata and changelog without publishing.
