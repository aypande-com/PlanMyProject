# Project Plan

<!-- pmp:schema=v2 -->

<!-- pmp:goal:id=G0001;statement=<One-sentence statement of what you are building and why>;scanned=2026-01-01T00:00:00Z -->

<!--
  ╔══════════════════════════════════════════════════════════════════╗
  ║              PLANMYPROJECT — PLAN FILE CONSTITUTION              ║
  ║                  Template & Field Reference v2                   ║
  ╚══════════════════════════════════════════════════════════════════╝

  HOW TO USE THIS FILE
  ─────────────────────
  1. Copy this file to your project root and rename it planmyproject.md
  2. Open the project in VS Code with the PlanMyProject extension installed
  3. Run "PlanMyProject: Set Project Goal" from the command palette (or edit
     the goal section below directly)
  4. Use CodeLens actions (Plan | Debate | Implement | Scan) above each task,
     or right-click tasks in the tree view sidebar
  5. The ## Execution Queue section is auto-generated — do not edit it manually

  TASK TYPES
  ───────────
  🔍 research    — Investigate, evaluate options, gather information
                   Blocks sibling implementation tasks until complete
                   (when planmyproject.researchGate = true)
  ⚖️  decision    — Choose between alternatives, make a commitment
                   Blocks sibling implementation tasks until complete
  ⚙️  implementation — Write code, configure services, create artifacts
  🏁 milestone   — A checkpoint or release gate (not a leaf work item)

  TASK STATUS SYMBOLS
  ────────────────────
  [ ]  todo       — not started
  [/]  in-progress — actively being worked on
  [x]  done        — complete
  [X]  done        — alternate done notation

  METADATA FIELDS (<!-- pmp:id=... --> comment below each task)
  ──────────────────────────────────────────────────────────────
  id            — Unique task identifier (T0001, T0002, ...)  [required]
  parent        — Parent task ID, or ROOT for top-level tasks [required]
  type          — research | implementation | decision | milestone
  origin        — manual | ai-generated | code-inferred
  goalRef       — Goal ID this task is aligned to (G0001)
  confidence    — AI confidence score 0.0–1.0 (null if manually created)
  dependsOn     — JSON array of task IDs that must complete first
  linkedFiles   — JSON array of workspace-relative file paths
  fileSendPolicy — global | always | never | ask
                   Controls whether file contents are sent to AI for this task
  createdAt     — ISO 8601 timestamp
  completedAt   — ISO 8601 timestamp, or null
  notes         — Free-form text note (semicolons escaped as \;)

  DEBATE LOG FORMAT (<!-- pmp:debate:TASKID ... --> block)
  ─────────────────────────────────────────────────────────
  Each line: [ISO-timestamp][AuthorName][role][action:ACTION] message text
    role   — user | ai | system
    action — split | rewrite | dismiss | accept | defer  (optional)

  EXECUTION QUEUE SECTIONS (auto-generated, do not edit)
  ────────────────────────────────────────────────────────
  ⚠️  Blocked         — has unresolved dependency, open research, or debate
  🔍 Research Tasks  — ready to investigate (act on these first)
  ⚙️  Ready to Implement — leaf tasks with all blockers resolved
  🏁 Milestones       — milestone checkpoints (shown when present)
-->

## Goals

- [G0001] <One-sentence statement of what you are building and why>
  <!-- pmp:goal-meta:id=G0001;criteria=["<Success criterion 1>","<Success criterion 2>"];constraints=["<Technical or resource constraint>"];out-of-scope=["<Explicitly excluded scope item>"] -->

<!--
  GOAL FIELDS
  ────────────
  criteria    — JSON array of measurable success criteria
  constraints — JSON array of known limitations (tech stack, time, team size)
  out-of-scope — JSON array of things explicitly NOT being built

  You can have multiple goals (G0001, G0002, …) but most projects use one.
  Use "PlanMyProject: Set Project Goal" to populate this via a guided UI.
  Use "PlanMyProject: Import Goal Statement" to populate from an existing .md.
-->

## Plan Tree

<!--
  TREE RULES
  ───────────
  • Indentation = 2 spaces per depth level
  • Each task line: - [STATUS] [ID] ICON Title
  • Metadata comment must immediately follow the task line (no blank line between)
  • Rationale line (optional): > Rationale: ...  — written by AI after planning
  • Debate block (optional): <!-- pmp:debate:ID ... -->
  • Children are indented 2 spaces under their parent
  • The tree is the source of truth; the Execution Queue is derived from it
-->

- [ ] [T0001] 🔍 Research: <Investigate a key technical question or unknown>
  <!-- pmp:id=T0001;parent=ROOT;type=research;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->
  > Rationale: <AI will populate this after you run "Plan" on the task — explains why this task was generated>

  - [ ] [T0002] ⚙️ <Implementation subtask — blocked until T0001 is done>
    <!-- pmp:id=T0002;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0001"];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

  - [ ] [T0003] ⚙️ <Another implementation subtask under T0001>
    <!-- pmp:id=T0003;parent=T0001;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0001"];linkedFiles=["src/example.ts"];fileSendPolicy=always;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

- [ ] [T0004] ⚖️ Decision: <Choose between alternatives>
  <!-- pmp:id=T0004;parent=ROOT;type=decision;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

- [ ] [T0005] ⚙️ <Top-level implementation task>
  <!-- pmp:id=T0005;parent=ROOT;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0004"];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

  - [ ] [T0006] ⚙️ <Child implementation task>
    <!-- pmp:id=T0006;parent=T0005;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

- [ ] [T0007] 🏁 Milestone: <Project checkpoint or release gate>
  <!-- pmp:id=T0007;parent=ROOT;type=milestone;origin=manual;goalRef=G0001;confidence=null;dependsOn=["T0005"];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->

<!--
  DEBATE LOG EXAMPLE (attached to a task after running "Debate")
  ─────────────────────────────────────────────────────────────
  When you run the Debate action on a task, PlanBot challenges your assumptions
  and you can refine the task through a conversation. The log is stored inline.

  Example debate block (do not add manually — use the Debate CodeLens action):

  - [ ] [T0099] ⚙️ Example task with debate history
    <!-- pmp:id=T0099;parent=ROOT;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00Z;completedAt=null;notes=null -->
    <!-- pmp:debate:T0099
    [2026-01-01T10:00:00Z][PlanBot][ai] Why does this task need to exist? What happens if you skip it?
    [2026-01-01T10:01:00Z][You][user] It's needed because the downstream task depends on the schema being defined first.
    [2026-01-01T10:02:00Z][PlanBot][ai][action:accept] Confirmed. Proceed with this task as scoped.
    -->

  DEBATE ACTIONS
  ──────────────
  accept  — Task is approved as-is; debate thread is resolved
  rewrite — Task title/scope should be revised
  split   — Task should be broken into smaller tasks
  dismiss — Task is not needed; can be deleted
  defer   — Task is valid but not needed in this iteration
-->

## Execution Queue (Auto-Generated, Leaf Tasks Only)

<!--
  THIS SECTION IS AUTO-GENERATED.
  Do not edit it manually — changes will be overwritten on the next save.
  It is rebuilt from the Plan Tree every time the plan file is saved.

  A task appears here only if it is a LEAF (no children).
  Parent/container tasks are not shown in the queue.

  BLOCKED REASONS
  ────────────────
  "blocked by [T000X]"                — dependsOn a task that is not done
  "blocked by unresolved dependency"  — dependsOn is set but target not found
  "blocked by unresolved sibling research/decision" — researchGate is active
  "blocked until debate thread is resolved"         — open debate with no accept/dismiss
-->

### ⚠️ Blocked (Dependencies, Research, Debate)
(none)

### 🔍 Research Tasks (act first)
(none)

### ⚙️ Ready to Implement
(none yet — complete research tasks and resolve open debate threads)
