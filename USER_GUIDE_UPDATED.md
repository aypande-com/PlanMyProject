# PlanMyProject — User Guide (For Humans)

This document has **two jobs**:

1. **Quick guide for new users**: learn the extension in plain English.
2. **Publicity-ready content**: reusable copy for a blog post or landing page.

---

## Part A — Quick Guide (For New Users)

## 1) What this extension does (in simple words)

PlanMyProject helps you go from:

- idea
- to plan
- to implementation

without leaving VS Code.

It keeps a markdown plan file in your repo, helps you break work into tasks, lets you challenge AI suggestions, and can generate file changes for implementation tasks.

If you have ever felt this:

- "AI gave me code, but no clear plan"
- "Tasks are messy and out of order"
- "I am coding before I answered the risky questions"

this extension is built for that.

## 2) What you need before starting

- VS Code `1.95+`
- An open folder/workspace (not a single loose file)
- Trusted workspace
- AI provider:
  - `copilot` (default)
  - `claude` (requires `planmyproject.claudeApiKey`)
  - `openai` (requires `planmyproject.openaiApiKey`)

## 3) Your first 10 minutes (do this once)

1. Run `PlanMyProject: Open Plan`.
- This creates or opens `planmyproject.md` in your workspace root.
- If no scan exists yet, PlanMyProject scans your workspace.

2. Run `PlanMyProject: Set Project Goal`.
- Enter:
  - Goal statement
  - Success criteria
  - Constraints
  - Out-of-scope
- If your plan is empty, PlanMyProject suggests starter root tasks.

3. Add a root task (if needed).
- Use `PlanMyProject: Add Root Task`.

4. Pick one task and plan it.
- Run `PlanMyProject: Plan Task (One Level)` (or `Alt+P`).
- If that task already has children, choose:
  - `Refine existing children`, or
  - `Replace existing children`

5. Challenge unclear tasks.
- Use `PlanMyProject: Debate Task`.
- Choose one action: `Accept`, `Rewrite`, `Split`, `Dismiss`, `Defer`.

6. Implement a ready task.
- Run `PlanMyProject: Implement Task` on an **implementation** task.
- It must not be blocked.

7. Finish research/decision tasks properly.
- Run `PlanMyProject: Mark Research Complete`.
- Your conclusion is saved to `.pmp/research-index.json`.

## 4) The plan file, explained fast

PlanMyProject uses one markdown plan file:

- `planmyproject.md` (default)
- `projectplan.md` (legacy name)

Main sections in that file:

- `## Goals`
- `## Plan Tree`
- `## Execution Queue (Auto-Generated, Leaf Tasks Only)`

Important:
- Do not delete `<!-- pmp:... -->` metadata comments unless you know exactly what you are changing.

## 5) Task types and status (no jargon)

Task types:

- `research`: find answers first
- `decision`: pick between options
- `implementation`: write code
- `milestone`: checkpoint/grouping task

Status symbols:

- `[ ]` = todo
- `[/]` = in-progress
- `[x]` = done

## 6) Why tasks get blocked

A task shows blocked when one of these is true:

- It depends on incomplete tasks (`dependsOn`)
- `researchGate` is on, and sibling research/decision tasks are not done
- The implementation task has an unresolved debate thread

If blocked, unblock the reason first. Then rerun implementation.

## 7) What happens when you click Implement

When you run `PlanMyProject: Implement Task`:

1. Extension builds an implementation prompt.
2. AI returns structured JSON changes.
3. Extension runs safety checks.
4. Approved files are written.
5. Plan status + queue are updated.

Safety checks include:

- No writing outside workspace
- No `..` path traversal
- Extra confirmation for sensitive targets (for example `.env*`, `.git/*`, lockfiles, `tsconfig*.json`)
- Warning if AI tries to overwrite files scanner marked as complete

## 8) Commands you will use most

Daily-use commands:

- `PlanMyProject: Open Plan`
- `PlanMyProject: Set Project Goal`
- `PlanMyProject: Add Root Task`
- `PlanMyProject: Add Task`
- `PlanMyProject: Plan Task (One Level)`
- `PlanMyProject: Debate Task`
- `PlanMyProject: Implement Task`
- `PlanMyProject: Mark Research Complete`
- `PlanMyProject: Refresh Scan`
- `PlanMyProject: Rebuild Execution Queue`
- `PlanMyProject: Refresh Tree`

Useful supporting commands:

- `PlanMyProject: Scan Task`
- `PlanMyProject: Drill Down Task`
- `PlanMyProject: Set Task File Send Policy`
- `PlanMyProject: Show Task Rationale`
- `PlanMyProject: View Linked Files`
- `PlanMyProject: View Research Index`
- `PlanMyProject: View Debate Archive`
- `PlanMyProject: Export Plan Summary`
- `PlanMyProject: Delete Task`
- `PlanMyProject: Cancel Active Request`

## 9) Privacy and AI data flow

- AI actions ask for consent unless you choose session-wide `Allow All`.
- By default, `planmyproject.sendFileContentsToAI=false`.
- Per task, you can override file send policy:
  - `global`
  - `always`
  - `never`
  - `ask`

Local artifacts:

- research index: `.pmp/research-index.json`
- debate archive files: `.pmp/debate-archive/`

Prompts are masked for common secret/token patterns before being sent.

## 10) Recommended settings presets

### Safe default

```json
{
  "planmyproject.aiProvider": "copilot",
  "planmyproject.sendFileContentsToAI": false,
  "planmyproject.defaultTaskFileSendPolicy": "global",
  "planmyproject.researchGate": true,
  "planmyproject.autoRescanOnImplement": true,
  "planmyproject.confidenceThreshold": 0.5
}
```

### Large repo (faster scan)

```json
{
  "planmyproject.scanner.extractSignatures": false,
  "planmyproject.scanner.maxFilesScanned": 300,
  "planmyproject.scanner.maxFileSizeKb": 50
}
```

Optional `.pmpignore`:

```gitignore
node_modules/
dist/
.next/
vendor/
```

## 11) Troubleshooting (plain language)

### "No project goal set" does not go away

- Run `PlanMyProject: Set Project Goal`
- Complete all prompts

### Planning/implementation fails with provider errors

- Check `planmyproject.aiProvider`
- If provider is `claude` or `openai`, set API key
- If provider is `copilot`, confirm Copilot chat model is available

### Scan is slow

- Lower scan limits (see presets above)
- Add more ignores in `.pmpignore`

### Task is blocked unexpectedly

Check:

- dependency tasks are done
- sibling research/decision tasks are done (if `researchGate=true`)
- debate thread is resolved

### Merge conflicts in `planmyproject.md`

- Resolve conflicts manually
- Save file
- Run `PlanMyProject: Rebuild Execution Queue`

## 12) Team habit that saves pain

Commit plan artifacts regularly:

```bash
git add planmyproject.md .pmp/research-index.json
git commit -m "chore(plan): update tasks and research conclusions"
```

Optional:

```bash
git add .pmp/debate-archive/
```

---

## Part B — Publicity / Web / Blog Copy

Use this section directly for a README landing section, blog post, or product page.

## 1) Short pitch (one paragraph)

PlanMyProject is a VS Code extension that turns AI coding into a structured workflow: define your goal, generate one-level tasks, debate and refine scope, then implement ready tasks with safety checks. It stores everything in version-controlled markdown so your team can plan, discuss, and execute without context getting lost across tools.

## 2) Problem statement (for article intro)

Most teams using AI assistants face the same planning gap:

- code appears before requirements are clarified
- open questions are skipped
- tasks drift away from project goals
- planning context gets scattered across docs, chats, and tickets

PlanMyProject solves this by keeping planning and execution looped together inside VS Code.

## 3) What makes it different

- Goal-anchored planning in a real markdown plan file
- Research-first flow with queue blocking for unresolved unknowns
- Debate workflow for challenging bad or vague tasks before coding
- Safe implementation writes with path and sensitive-target checks
- Local, git-friendly artifacts for team collaboration

## 4) How it works (3-step public version)

1. **Plan**: Set a goal and generate one-level child tasks.
2. **Validate**: Debate, split, rewrite, or defer tasks before execution.
3. **Execute**: Implement ready tasks with controlled file writes and queue updates.

## 5) Suggested website section copy

### Headline options

- "From AI ideas to executable plans in VS Code"
- "Plan first. Debate scope. Implement safely."
- "A planning layer for AI-assisted development"

### Subheadline option

PlanMyProject gives your team one source of truth for goal-driven planning, research decisions, and implementation flow, all inside your repository.

### Feature bullets (landing page)

- One plan file in source control (`planmyproject.md`)
- One-level AI planning with confidence-aware review
- Debate panel to challenge and refine tasks
- Execution queue auto-generated from leaf tasks
- Research index that carries learned decisions forward
- Implementation with built-in workspace safety checks

## 6) Suggested blog structure

Use this outline for a blog post:

1. The planning gap in AI coding workflows
2. Why markdown as source of truth matters
3. Research-first and debate-first execution
4. Live walkthrough: goal to implemented task
5. Team collaboration and version-control benefits
6. Closing: where this helps most (indie devs, small teams, product squads)

## 7) 30-second elevator version

PlanMyProject is a VS Code extension for teams that use AI to build software but still want disciplined execution. It keeps goals, tasks, debates, and research conclusions in a git-tracked markdown plan, then helps implement ready tasks with safety checks. You get speed from AI without losing planning quality.

---

## Related docs

- `README.md`
- `PlanMyProject_v2_Spec.md`
- `FEATURE_PROGRESS.md`
