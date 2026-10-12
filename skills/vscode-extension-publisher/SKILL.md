---
name: vscode-extension-publisher
description: Publish VS Code extensions safely from build to Marketplace release using repository-defined instructions. Use when the user asks things like "publish my extension", "publish my VS Code extension as a patch release", "release the extension", "ship a new version", "bump and release", "do a full minor release", "run the vscode publish workflow", "package the extension but don't publish", or "bump the version and update the changelog".
---

# VS Code Extension Publisher

Execute a safe, repeatable VS Code extension release workflow driven by repository instructions. Publishing is public and a version number can never be reused, so every step before it exists to make the publish boring.

## Load Authority First

1. Read `.github/copilot-instructions.md` at repository root.
2. If it does not exist, read `copilot-instructions.md`.
3. Treat that file as the single source of truth for commands, sequence, and guardrails. This skill describes the shape of the pipeline; the instruction file names the actual commands.
4. Extract the concrete commands from its build, test, changelog/versioning, and publishing sections before running anything.
5. If neither file exists, stop and ask the user for the release instruction file location.
6. If the instruction file contradicts `package.json` (a script it names does not exist, or its project structure is wrong), trust `package.json`, tell the user, and fix the instruction file as part of the release.

## Route By User Intent

Use the first matching route:

1. `full-release`: "publish my extension", "release the extension", "ship a new version", "bump and release", "full minor release", "run the vscode publish workflow". Run every step below.
2. `package-only`: "package the extension", "create a vsix", "package but do not publish". Run Steps 0-2 and 5 (package and audit). Do not publish, commit or tag.
3. `version-only`: "bump version and update changelog". Run Steps 3-4. Do not package or publish unless asked.

## Non-Negotiable Release Rules

1. Never publish when the build, tests, benchmarks, feature-coverage check or settings-scope check fail, even if the user asks to proceed.
2. Confirm the bump type (`patch`, `minor`, `major`) with the user before `npm version`, even when they suggested one. Never run `major` without confirmation that breaking changes are intended. A user who names the exact target version (for example "release 2.0.0") has confirmed it.
3. Publish only after the user has explicitly said to publish this version in the current conversation. "Prepare the release" is not "publish".
4. Never tag, commit the release, or push before the publish succeeds, and never before the changelog is dated and populated.
5. Always audit the package contents before publishing.
6. Never retry a failed publish in a loop and never work around an authentication failure.
7. If the publish succeeded but a later step failed, never publish again. Finish the remaining steps by hand.
8. Prefer commands from the instruction file over generic defaults.

## Pipeline

### Step 0: Preflight

1. Report the current branch, `git status`, and the current version from `package.json`.
2. Check credentials without publishing: `VSCE_PAT` is set, or `npx @vscode/vsce ls-publishers` lists the publisher. A listed publisher does not prove the token is valid; an expired token only fails at publish time. If you cannot be sure, say so before spending effort on the rest.
3. Confirm `package.json` has `publisher`, `repository`, `license`, `icon`, and that the repository URL resolves.

### Step 1: Build

Run the repository compile command. Stop on failure.

### Step 2: Verify

Run every gate the instruction file lists, in order: tests, benchmarks, feature-coverage check, settings-scope check. Stop and report on the first failure, with the failing test names. Report the counts (tests, benchmark tests, checklist entries, settings) in the final summary.

### Step 3: Changelog

1. Write entries under `## [Unreleased]` in user-facing language, with no TODO placeholders.
2. Put behavior changes that affect existing users first, under `### Upgrading from X.x`: settings whose scope changed, data that is migrated or deleted, files that are now refused. Then `### Added`, `### Changed`, `### Fixed`.
3. Verify every claim against the code or a test before writing it. A changelog line that is wrong is worse than a missing one.
4. Compare the README's command list, settings and privacy section with `package.json`. Update what drifted.

### Step 4: Version bump

1. Run exactly one of `npm version patch|minor|major --no-git-tag-version`.
2. Convert `Unreleased` into `## [X.Y.Z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]` above it.
3. Update the README release line.
4. Re-run the README build-status refresh so the badges match the final tree.

### Step 5: Package and audit

1. Package with the repository command.
2. List the contents with `vsce ls` and check all of the following:
   - exactly one `out/extension.js` for a bundled extension (many files under `out/` means a stray `tsc` emit polluted the bundle)
   - no `src/`, `test/`, `.pmp/`, plan files, specs, `.claude/`, `skills/` or `*.skill`
   - the file count and size are about what the last release had
3. `vsce package` and `vsce publish` both run `vscode:prepublish`, which recompiles and rewrites the README status block. Expect README to change after packaging and commit it with the release.

### Step 6: Publish

1. State the exact version and the Marketplace identifier you are about to publish, and confirm the user has told you to publish it.
2. Publish with the repository command.
3. On "Personal Access Token ... expired" or any authentication error, stop. Tell the user to create a new token (the CLI prints the link), then run `npx @vscode/vsce login <publisher>` or set `VSCE_PAT`. Leave the version bump and changelog in the working tree, uncommitted, and say so.
4. On "version already exists", stop. Do not delete or overwrite anything. Ask which version to use.

### Step 7: Release commit, tag, push

Only after a successful publish: commit `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md` as `chore: release vX.Y.Z`, tag `vX.Y.Z`, then push the branch and the tag. Pushing is not merging: if the release branch differs from the default branch, say so and leave the merge to the user. Create a GitHub Release with the `.vsix` only when asked.

### Step 8: Record

Update the project's own tracking (here: mark the release unit done in `planmyproject.md` and add a release entry to `FEATURE_PROGRESS.md`).

## Failure Handling

1. Name the exact blocked step, the command, and a summary of its output.
2. Offer the next safe action: fix, re-run verification, then continue.
3. State plainly what has and has not happened. After a failed publish, nothing is on the Marketplace; after a partial failure, say which of publish, commit, tag and push completed.

## Known Pitfalls In This Repo

- `vscode:prepublish` once only refreshed README badges and never compiled, so a stale `out/` could ship. It is now `compile && build`. Do not "simplify" it back.
- `scripts/update-readme-build-status.js` once ran `tsc` without `--noEmit`, re-emitting the unbundled tree over the esbuild bundle (the VSIX had 60 files in `out/`). Step 5's audit is what catches this class of problem.
- The test scripts use explicit directory globs because the CI Node version cannot expand `**` for `node --test`. A new test directory needs a `package.json` script change.
- The instruction file drifted badly once (it described files that no longer existed). Re-read it against `package.json` every release.
- Publisher tokens expire. `ls-publishers` succeeding does not mean publish will.

## Expected Outputs

- `full-release`: published Marketplace version, release commit, git tag, and a record in the project's tracking files.
- `package-only`: a `.vsix` and a package audit report; nothing published, committed or tagged.
- `version-only`: updated version metadata and changelog; nothing packaged or published.
