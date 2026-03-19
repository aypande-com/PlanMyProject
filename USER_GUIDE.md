# PlanMyProject v2 — User Guide

**For developers and project teams using AI-assisted development**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [Workflows](#workflows)
4. [Features & How to Use Them](#features--how-to-use-them)
5. [Tips & Best Practices](#tips--best-practices)
6. [FAQ](#faq)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installation

1. Install the **PlanMyProject** extension from the VS Code Marketplace
2. Open a workspace folder in VS Code
3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Run: `PlanMyProject: Set Project Goal`

### First Time Setup

When you first open PlanMyProject, you'll be guided through a simple setup:

#### Step 1: Define Your Project Goal

A **goal** is a clear, concise statement of what you want to build. For example:

> *"Build a real-time collaborative document editor for technical teams, with version history and permission management."*

The extension will ask you for:
- **Goal Statement** — what you're building
- **Success Criteria** — how you'll know it's done (e.g., "Users can create documents", "Documents auto-save")
- **Constraints** — tech stack, timeline, budget limitations (e.g., "React frontend, Node.js backend")
- **Out of Scope** — what you're explicitly NOT building (e.g., "Payment processing", "Mobile apps")

This goal becomes the north star for all planning and code generation.

---

## Core Concepts

### What Problems Does PlanMyProject Solve?

When using AI tools like Copilot or Claude for development, you face three key challenges:

1. **AI generates tasks without knowing what you've already built** → You end up with redundant tasks
2. **AI skips research tasks, jumping straight to implementation** → You hit unknown blockers mid-coding
3. **Tasks don't connect to your actual project goals** → You build features that don't matter

**PlanMyProject bridges this gap** by acting as a planning layer that:
- 📊 **Scans your workspace** to understand what code already exists
- 🔍 **Surfaces research needs** before implementation tasks (unknowns first)
- 🎯 **Anchors all tasks to your goal** so nothing is built by accident
- 💬 **Enables debate** — you can challenge any task, split it, rewrite it, or dismiss it

### Key Terms

| Term | Meaning |
|------|---------|
| **Plan File** | A markdown file (`planmyproject.md`) that stores your entire plan tree. It's human-readable, editable, and should be committed to git. |
| **Task** | A unit of work in your plan. Each task has a title, type (research, implementation, decision, milestone), status (todo, in-progress, done), and optionally a rationale. |
| **Research Task** 🔍 | A task where you need to investigate or decide before coding (e.g., "Evaluate PDF libraries"). Must be done before related implementation tasks. |
| **Implementation Task** ⚙️ | A concrete coding task (e.g., "Build login endpoint"). Should only appear after research tasks are resolved. |
| **Decision Task** ⚖️ | An architectural or design choice that must be recorded (e.g., "Choose auth strategy"). Unblocks dependent tasks once resolved. |
| **Execution Queue** | Auto-generated list of leaf (actionable) tasks, ordered by: Research → Decision → Ready to Implement → Blocked tasks. |
| **Confidence Score** | AI's confidence (0–100%) that a generated task is correct. High confidence tasks are auto-accepted; low confidence show a review prompt. |
| **Research Index** | A searchable database of past research conclusions (e.g., "We chose pdfkit because..."). Automatically injected into future AI prompts so the AI learns from your decisions. |
| **Debate** | A chat-like interface where you can challenge a task, ask AI to split it, rewrite it, or dismiss it. Debate history is saved in the plan file. |
| **Workspace Snapshot** | A summary of what the scanner found: which modules exist, are partially built, are missing tests, etc. Shown in the Debate Panel. |

---

## Workflows

### Workflow 1: Create a New Plan from Scratch

**Goal:** Start a new project with a structured plan.

#### Steps

1. **Open VS Code**. Create a new workspace folder for your project.

2. **Run:** `PlanMyProject: Set Project Goal`
   - Enter your goal statement, success criteria, constraints, out-of-scope items
   - Click "Save"

3. **Add a root task**. In the PlanMyProject tree (left sidebar under "Plan"), click the "Add Root Task" link (or run `PlanMyProject: Add Root Task` from the command palette).
   - Example: `"Build user authentication system"`
   - Choose task type: **Research** (if you need to investigate), **Implementation** (if it's straightforward), or **Decision** (if it's an architectural choice)

4. **Plan the task**. Select the task in the tree, then run `PlanMyProject: Plan Task (One Level)` (or press `Alt+P`).
   - The extension scans your workspace, analyzes your goal, and generates child tasks
   - A Debate Panel opens showing generated tasks
   - For each task:
     - **Accept** — add it to the plan as-is
     - **Debate** — ask AI questions (e.g., "Is this really needed?", "Should we split this?")
     - **Rewrite** — edit the task title and let AI regenerate the rationale
     - **Split** — ask AI to break it into 2–4 smaller tasks
     - **Dismiss** — skip this task

5. **Review execution queue**. The "Execution Queue" section at the bottom of your plan file shows actionable tasks in priority order:
   - 🔍 **Research Tasks** (do these first to unblock implementation)
   - ⚖️ **Decision Tasks** (resolve these to unblock dependents)
   - ⚙️ **Ready to Implement** (no blockers, ready to start)
   - 🔒 **Blocked Tasks** (waiting on research/decisions)

### Workflow 2: Scan Existing Code & Generate a Plan Around It

**Goal:** You have a partially-built project (e.g., auth module 80% done, API endpoints missing). Create a plan for what's left.

#### Steps

1. **Open your existing project** in VS Code.

2. **Run:** `PlanMyProject: Set Project Goal`
   - Describe what the full project should be (including what's already built and what's missing)

3. **Run:** `PlanMyProject: Open Plan`
   - The extension scans your codebase (respects `.gitignore`)
   - Detects languages, modules, existing functions, and test coverage
   - Shows a **Workspace Snapshot** (e.g., "src/auth/ is 80% complete, tests missing for src/api/")

4. **Add root tasks** for incomplete areas. For example:
   - `"Complete API endpoints"` (for modules that exist but are partial)
   - `"Build email integration"` (for completely missing areas)

5. **Plan each task** as in Workflow 1. The AI will be aware of existing code and generate tasks only for gaps
   - Example: Instead of "Build JWT token generation", it might generate "Add token refresh endpoint" (since JWT generation already exists)

---

### Workflow 3: Research → Record Conclusion → Unlock Implementation

**Goal:** Complete a research task, record your findings, and automatically unblock dependent implementation tasks.

#### Steps

1. **Locate a research task** in your plan (icon 🔍). Example: `"Evaluate PDF generation libraries"`.

2. **Do the research** outside the extension (read docs, write POCs, etc.).

3. **Mark the task done**. Right-click the task in the tree → **Mark as Research Complete** (or run `PlanMyProject: Mark Research Complete`).

4. **Record your conclusion**. A dialog appears asking: *"Record your finding/decision:"*
   - Example: `"Decided on pdfkit v4.0.2 — good font support, 50KB, low bundle impact"`
   - Click "Save"

5. **Magic happens**:
   - The conclusion is automatically tagged and indexed in `.pmp/research-index.json`
   - Any implementation tasks that depend on this research (via `dependsOn`) are now unlocked
   - In future planning, this conclusion is injected into AI prompts as accumulated knowledge
   - Status bar briefly shows: `✓ Research indexed: T0003`

---

### Workflow 4: Implement a Task with AI

**Goal:** Use Copilot (or Claude/OpenAI) to generate code for an implementation task.

#### Steps

1. **Select an implementation task** (icon ⚙️) from the Execution Queue. Example: `"Build login endpoint"`.
   - **Important:** Research dependencies must be marked done first. If blocked, the task will show a 🔒 icon.

2. **Run:** `PlanMyProject: Implement Task` (or click `Implement` in CodeLens on the plan file line).

3. **Review the prompt**. A panel appears showing:
   - Your goal statement
   - Workspace context (e.g., existing Express.js setup, JWT library installed)
   - Past research conclusions (e.g., "We're using JWT with httpOnly cookies")
   - Task details and linked files

4. **Grant consent**. The "Send to AI" button appears. Click it to:
   - Send the prompt to Copilot/Claude/OpenAI (based on your settings)
   - You can choose "Send Once" or "Allow All" for remaining tasks

5. **AI generates code**. A response appears with:
   - **Summary** — what was implemented
   - **Code changes** — files to create/edit with code diffs
   - **Tests** — test code (if applicable)
   - **Risks** — edge cases and considerations

6. **Review and apply**. For each file change:
   - Read the code
   - Click "Apply" to write to disk, or "Skip" to ignore
   - Once a file is written, it's auto-validated (no deletions, no sensitive paths like `.env`)

7. **Auto-rescan**. After implementation, the extension:
   - Re-scans your workspace
   - Detects the new code
   - Checks if this task should be marked complete
   - Updates the Execution Queue

---

### Workflow 5: Debate a Task (Challenge, Split, Rewrite)

**Goal:** You don't like a generated task. Refine it through debate before adding to the plan.

#### Steps

1. **A task appears in the Debate Panel**. This happens when:
   - You run `PlanMyProject: Plan Task` and AI generates new tasks
   - You run `PlanMyProject: Debate Task` on an existing task
   - An AI-generated task has low confidence score (< 50%)

2. **Read the task**:
   - Title, type (research/implementation/decision), confidence score
   - Rationale (why AI thinks this task is needed)
   - Workspace context (what code already exists)

3. **Chat with AI** (bottom section of panel):
   - Type a question: *"Is this really a separate task or part of 'Build login endpoint'?"*
   - AI responds with analysis
   - Repeat until you're ready to decide

4. **Choose an action**:

   | Action | When to Use | Result |
   |--------|-----------|--------|
   | **Accept** | Task is good as-is | Task added to plan immediately |
   | **Rewrite** | Task title should be different | Edit title inline; AI regenerates rationale; click save |
   | **Split** | Task is too big | AI proposes 2-4 sub-tasks; you approve each one |
   | **Dismiss** | Not needed | Task is removed (not added to plan) |
   | **Defer** | Useful but not urgent | Task added with `[deferred]` tag; low queue priority |

5. **Debate gets saved**. All messages in the debate are stored in your plan file under the task:
   ```markdown
   <!-- pmp:debate:T0003
   [2026-03-19T10:05:00Z][alice][user] Is this really necessary?
   [2026-03-19T10:05:03Z][ai] Yes, because...
   [2026-03-19T10:06:00Z][alice][user] OK, split it
   -->
   ```
   - If your teammate pulls the latest plan, they'll see this entire conversation
   - They can continue the debate or see what decision was made

---

## Features & How to Use Them

### Tree View (Left Sidebar)

The **Plan** section in the sidebar shows your task tree.

#### What You See

```
Plan
├─ 🌍 Workspace Snapshot         ← collapsible; shows scan summary
├─ 🔍 T0001 Research: Evaluate auth strategies     ← research task
│  └─ ⚖️ T0002 Decision: Choose JWT vs sessions     ← decision task
├─ ⚙️ T0003 Implement: JWT generation utility       ← implementation task
│  └─ ⚙️ T0004 Implement: Login endpoint
└─ 🏁 T0005 Milestone: Auth complete              ← milestone (grouping only)
```

#### Icons Explained

| Icon | Meaning |
|------|---------|
| 🔍 | Research task — investigate/POC needed |
| ⚖️ | Decision task — architectural choice |
| ⚙️ | Implementation task — code to write |
| 🏁 | Milestone — grouping, no direct code |
| 🟢 (dot) | Green = high confidence AI task |
| 🟡 (dot) | Yellow = medium confidence (review if unsure) |
| 🔴 (dot) | Red = low confidence (review before committing) |
| 🔒 | Locked — waiting on dependencies to complete |
| `[x]` | Done |
| `[/]` | In Progress |
| `[ ]` | To Do |

#### Right-Click Context Menu

Right-click any task to:

- **Plan** — generate child tasks (one level)
- **Debate** — open Debate Panel to refine/challenge the task
- **Implement** — generate code for this task (if implementation type)
- **Scan** — re-scan files linked to this task
- **Mark as Research Complete** — record conclusion and index it
- **Show Rationale** — view AI's reasoning for this task
- **View Linked Files** — open all files associated with this task
- **Delete** — remove task (with confirmation)
- **Refresh Tree** — refresh the sidebar display

### Status Bar (Bottom Right)

Shows:
- **Scan status:** `🔍 Scanned 2m ago` — when the workspace was last analyzed
- **No goal warning:** `⚠️ No project goal set` — if you haven't set goals yet (clickable → opens Goal Setup)
- **Spinner during AI requests:** Shows when Copilot/AI is running

Click any status item to refresh the scan.

### CodeLens (Inline Actions in Plan File)

When viewing `planmyproject.md`, you'll see inline action links:

```markdown
- [ ] [T0001] 🔍 Research: Evaluate auth strategies
       |           |                                 |
       +--Plan-----+--Debate-------+--Implement-----+--Scan--+
```

- **Plan** — expand this task one level (generate children)
- **Debate** — open Debate Panel
- **Implement** — generate code
- **Scan** — refresh workspace analysis for linked files

### Debate Panel (WebView)

Opens when you plan a task or click "Debate". Shows:

**Top Section:**
```
🔍 T0003 — Research: Evaluate PDF libraries
Goal: G0001 | Confidence: 87%
```

**Workspace Context Section:**
Shows what the scanner found relevant to this task:
```
▾ src/invoices/
  ✓ invoice.model.ts (700 lines)
  ✗ invoice.pdf.ts (missing)
Dependencies: jspdf@2.4.0, pdfkit@0.13.0
```

**Rationale Section:**
AI's explanation for why this task exists:
> "PDF generation is a core output of invoicing. Library choice affects bundle size and font support."

**Debate Section:**
A chat-like conversation:
```
[You]: Is pdfkit really necessary if we can use jsPDF?

[AI]: Both are viable, but pdfkit has better font support and 
smaller bundle size for the use case...

[You]: OK, let's go with pdfkit
```

**Action Buttons:**
- `[Accept]` — add task to plan as-is
- `[Rewrite]` — edit task title; AI updates rationale
- `[Split]` — propose 2-4 smaller tasks
- `[Dismiss]` — don't add this task
- `[Defer]` — add with low priority

### Execution Queue (Auto-Generated)

At the bottom of your `planmyproject.md` file:

```markdown
## Execution Queue (Auto-Generated, Leaf Tasks Only)

### ⚠️ Blocked (Research incomplete)
1. [T0005] ⚙️ Implement: Token refresh endpoint — blocked by [T0003]

### 🔍 Research Tasks (act first)
1. [T0003] 🔍 Research: Evaluate JWT vs session auth
2. [T0004] ⚖️ Decision: Choose token storage strategy

### ⚙️ Ready to Implement
1. [T0006] ⚙️ Implement: Login endpoint
2. [T0007] ⚙️ Implement: Session middleware

### 🏁 Milestones
(no pending milestones)
```

**Red flag:** If implementation tasks are blocked, complete the research tasks above them first.

### Goal Setup Panel

Accessed via: `PlanMyProject: Set Project Goal`

A step-by-step form:

1. **Goal Statement** (required)
   ```
   "Build a collaborative document editor with real-time cursors, 
    conflict resolution, and permission management."
   ```

2. **Success Criteria** (required, one per line or comma-separated)
   ```
   Users can create documents
   Users can invite collaborators
   Changes sync in real-time
   Documents have version history
   ```

3. **Constraints** (optional)
   ```
   React frontend
   Node.js backend
   6-week timeline
   PostgreSQL database
   ```

4. **Out of Scope** (optional — what you're NOT building)
   ```
   Mobile apps
   Payment processing
   Advanced AI features
   ```

After filling this out and clicking "Save":
- Your goal is written to the plan file header
- All future task generation references this goal
- Status bar no longer shows "⚠️ No project goal set"

### Research Index Viewer

Run: `PlanMyProject: View Research Index`

Opens a read-only formatted view of `.pmp/research-index.json` showing all recorded research conclusions:

```json
[
  {
    "taskId": "T0003",
    "taskTitle": "Evaluate JWT vs session auth",
    "type": "research",
    "conclusion": "Decided: JWT with httpOnly cookies. Better for REST APIs.",
    "tags": ["auth", "jwt", "session", "security"],
    "completedAt": "2026-03-18T14:30:00Z",
    "usedInPrompts": 5
  },
  ...
]
```

**Why this matters:**
- Conclusions are automatically injected into future AI prompts
- The AI learns from your decisions (e.g., "You chose pdfkit before, so I'll recommend it again")
- Shared across your team via git (everyone sees past decisions)

---

## Tips & Best Practices

### 1. Start with a Strong Goal Statement

The more specific your goal, the better the AI planning. Instead of:
> "Build a social app"

Write:
> "Build a photo-sharing app for photographers with hashtag discovery, portfolio sharing, and monetization via print-on-demand."

### 2. Use Research Tasks Liberally

Before implementing anything complex, add a research task:
- ✅ "Evaluate database options for scaling to 100k users"
- ✅ "Prove that WebRTC works for real-time collab"
- ✅ "Decide on state management library (Redux vs Zustand vs MobX)"

This surfaces unknowns early, before you've written code.

### 3. Debate Low-Confidence Tasks

When AI generates a task with confidence < 70%, take time to debate it:
```
[You]: This seems like two tasks: "design DB schema" and "implement migrations". 
       Should we split?

[AI]: Good catch. Yes, they can be parallelized. Let me split this.
```

### 4. Record Research Conclusions Thoroughly

When marking a research task complete, be specific:
- ❌ Bad: "JWT is better"
- ✅ Good: "Decided JWT with httpOnly cookies. Protects against XSS, easier to revoke. Pdfkit v4.0.2 chosen for font support + 50KB bundle."

This helps future planning context.

### 5. Link Files to Implementation Tasks

When generating code, the AI sends linked files for context. After an `Implement Task`, check the current plan:
- Are the right files linked in the task comment? (`linkedFiles: [...]`)
- Add more if the AI missed any: edit the task's HTML comment, re-list files

### 6. Use Milestones for Major Groupings

Create milestone tasks (type: `milestone`) to group related tasks:
```
🏁 Milestone: MVP Authentication
├─ 🔍 Research: JWT vs sessions
├─ ⚙️ Implement: Login endpoint
├─ ⚙️ Implement: Session middleware
└─ ⚙️ Test: Auth module
```

Milestones don't generate code, but they help organize your plan.

### 7. Commit Your Plan File Regularly

Your plan file (`planmyproject.md`) and research index (`.pmp/research-index.json`) should be committed to git:

```bash
git add planmyproject.md .pmp/research-index.json
git commit -m "chore: plan updates and research findings"
git push
```

This ensures:
- All teammates see the plan and debate history
- You have a history of planning decisions
- If you pull code with an updated plan, the extension auto-loads it

### 8. Adjust Scanner Settings for Large Repos

If your workspace is > 1000 files or takes a long time to scan:

Run: `Preferences: Open Settings (JSON)` and add:

```json
{
  "planmyproject.scanner.extractSignatures": false,  // disable signature extraction
  "planmyproject.scanner.maxFilesScanned": 300       // reduce max files
}
```

Or create a `.pmpignore` file to skip large directories:
```
# .pmpignore (same format as .gitignore)
node_modules/
dist/
.next/
vendor/
```

---

## FAQ

### Q: Should I set a goal before planning?

**A:** Strongly recommended. The goal guides all task generation. Without a goal, AI generates generic tasks. With a clear goal, tasks are specific to your project.

### Q: What if I already have code? Do I need to start a new plan?

**A:** No. Open your project, set a goal, and run `PlanMyProject: Open Plan`. The extension scans your code and generates tasks only for what's missing. It never suggests tasks for completed modules.

### Q: How does file sending to AI work?

**A:** By default, the extension does NOT send file contents to Copilot (privacy-first). When you implement a task:
- Task details and goal are sent
- File paths are sent (so AI knows "this is Express-based")
- File contents are **not** sent unless you explicitly enable it in settings

To enable file sending:
- Run: `Preferences: Open Settings (JSON)`
- Add: `"planmyproject.sendFileContentsToAI": true`
- Or override per-task: right-click task → `Set Task File Send Policy` → `Always`

### Q: Can I edit my plan file manually?

**A:** Yes! The plan file is markdown and human-editable. However:
- Keep the HTML comment metadata aligned with changes (`<!-- pmp:id=... -->`)
- If you delete a task, its ID is still usable for new tasks (IDs are never recycled)
- If you manually edit, run `PlanMyProject: Rebuild Execution Queue` to regenerate the queue

### Q: What happens if two teammates edit the plan file at the same time?

**A:** Git will detect a conflict. The extension shows a warning: *"Debate log conflict detected on T0003. Please resolve in the plan file."*

Resolve the conflict in the file itself, save, and the extension will parse it correctly on next `Open Plan`.

### Q: How is my workspace scanned?

**A:** The extension:
1. Walks your workspace respecting `.gitignore` and `.pmpignore`
2. Detects languages (TypeScript, Python, Go, Java, etc.)
3. Finds package.json / requirements.txt / Cargo.toml
4. Extracts function/class signatures from source files (if enabled)
5. Groups files into modules (e.g., `src/auth/`, `src/api/`)
6. Infers what's implemented (e.g., "login endpoint exists but refresh endpoint missing")

The scan is **local only** — nothing is sent to Copilot except a summary.

### Q: Why are some tasks "blocked"?

**A:** A task is blocked if it has a `dependsOn` relationship to an incomplete task. Example:

```markdown
- [x] [T0001] 🔍 Research: Choose auth strategy    ← DONE
- [ ] [T0002] ⚙️ Implement: Login endpoint          ← BLOCKED until T0001 done
```

To unblock T0002, finish T0001 and mark it complete.

### Q: Can I use the extension with Claude or OpenAI instead of Copilot?

**A:** Yes. Run:
- `Preferences: Open Settings (JSON)`
- Add:
  ```json
  {
    "planmyproject.aiProvider": "claude",  // or "openai"
    "planmyproject.claudeApiKey": "sk-ant-..."  // your API key
  }
  ```

Your API key is stored securely in VS Code's Secret Storage — it's never logged or sent to third parties.

### Q: How are debate entries stored if there's no backend?

**A:** All debate entries are stored in the plan file itself as HTML comments:

```markdown
- [ ] [T0003] 🔍 Research: Evaluate PDF libraries
  <!-- pmp:debate:T0003
  [2026-03-19T10:05:00Z][alice][user] Is pdfkit necessary?
  [2026-03-19T10:05:03Z][ai] Yes, because of font support...
  [2026-03-19T10:06:00Z][alice][user] OK, accept
  -->
```

When you commit this to git, teammates can pull and see the entire debate history. It's decentralized and always in sync.

### Q: What if the extension doesn't detect my code correctly?

**A:** Run:
1. `PlanMyProject: Refresh Scan` — manually re-scan your workspace
2. Open the generated Workspace Snapshot to see what was detected
3. If files are missed, check `.pmpignore` or `.gitignore` — the extension respects these

If a signature extraction is wrong (e.g., detecting a variable as a function), that's a limitation of lightweight parsing. You can disable it:
- `"planmyproject.scanner.extractSignatures": false`

---

## Troubleshooting

### Issue: "No project goal set" warning won't go away

**Solution:**  
Run `PlanMyProject: Set Project Goal` and complete the setup. The warning disappears once a goal is saved.

### Issue: Workspace scan is very slow

**Cause:** Large workspace with many files or large files.

**Solution:**
1. Disable signature extraction: `"planmyproject.scanner.extractSignatures": false`
2. Reduce max files: `"planmyproject.scanner.maxFilesScanned": 300`
3. Create `.pmpignore` to skip large directories

### Issue: AI generates tasks for code that already exists

**Cause:** The workspace scanner didn't detect existing code.

**Solution:**
1. Run `PlanMyProject: Refresh Scan` to re-analyze
2. Check the Workspace Snapshot to confirm detection
3. If files are being skipped, verify they're not in `.gitignore` or `.pmpignore`

### Issue: Plan file has merge conflicts after git pull

**Cause:** Two teammates added tasks or debate entries at the same time.

**Solution:**
1. Open `planmyproject.md` in VS Code
2. Git will show conflict markers (`<<<<`, `====`, `>>>>`)
3. Manually merge the conflicts (both sets of changes are usually compatible)
4. Save the file
5. Run `PlanMyProject: Rebuild Execution Queue` to regenerate the queue
6. `git add` and `git commit`

### Issue: "File send policy" appears in task metadata

**Cause:** This is normal. The extension stores per-task file-send settings in the task's HTML comment:

```markdown
<!-- pmp:id=T0001;...;fileSendPolicy=never -->
```

This ensures that if you override the global setting for one task, it's remembered.

### Issue: Debate Panel shows old messages after restart

**Cause:** The panel is rehydrating from the plan file's debate log.

**Solution:**  
This is expected behavior. All debate history is permanent in the plan file. If you don't want old debates to show, archive them:
- Run `PlanMyProject: View Debate Archive` to see archived entries
- Debate entries older than 90 days (configurable) automatically move to an archive block

### Issue: Workspace keeps re-scanning unnecessarily

**Cause:** There might be file watcher issues or the cache is being invalidated.

**Solution:**
- Run `Preferences: Open Settings (JSON)` and disable auto-rescan:
  ```json
  { "planmyproject.autoRescanOnImplement": false }
  ```
- Or manually trigger scans only when needed: `PlanMyProject: Refresh Scan`

---

## Next Steps

Now that you understand the extension:

1. **Set up a project goal:** `PlanMyProject: Set Project Goal`
2. **Create a root task:** `PlanMyProject: Add Root Task`
3. **Plan it:** `Alt+P` or `PlanMyProject: Plan Task`
4. **Debate a task:** Right-click any task → "Debate Task"
5. **Implement:** Select a ready task and click "Implement"
6. **Record research:** Complete research tasks and record findings
7. **Commit your plan:** `git add planmyproject.md .pmp/research-index.json && git commit`

Happy planning! 🚀

---

## Additional Resources

- **Full Specification:** See `PlanMyProject_v2_Spec.md` for technical details
- **Feature Progress:** See `FEATURE_PROGRESS.md` for what's implemented
- **Settings Reference:** Open VS Code Settings and search `planmyproject` to see all available options
- **Command Palette:** `Ctrl+Shift+P` → type `PlanMyProject` for all available commands

---

*Last Updated: 2026-03-19*  
*Version: PlanMyProject v2.0.0*
