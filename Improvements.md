Phase 1 — Performance Fixes (Safe, No Behavior Change)
P1-A1: Eliminate double-triggered refresh on save
File: PlanController.ts:148-172

Approach: Add a private isSelfWriting = false flag. Set it to true before writeTextFile in persistAndRefresh, reset in finally. In the onDidSaveTextDocument and onDidChange handlers, skip refreshPlanState() when the flag is set.

Risk: Low

P1-A2: Remove the read-back in persistAndRefresh()
File: PlanController.ts:919-936

Approach: After repository.savePlan(), instead of reading the file back and parsing it, call parsePlanMarkdown(serialized) on the string that was just serialized — it's already in memory. Pass the serialized string through from serializePlanMarkdown or re-parse directly without the disk read.

Risk: Low — the parse result of a freshly serialized plan is deterministic

P1-A3: Cache resolved plan URI
File: PlanController.ts:155-172, storage/WorkspaceFiles.ts

Approach: Store planUri on PlanController (it already exists as this.planUri). In the onDidSaveTextDocument handler, compare document.uri against the cached this.planUri directly rather than calling findPlanUris(). Invalidate the cache only in the onDidCreate/onDidDelete watcher callbacks.

Risk: Low

P1-A4: Throttle tree refresh during AI streaming
File: ui/TreeProvider.ts:102-109, PlanController.ts:343-348

Approach: Add a private refreshThrottleTimer: NodeJS.Timeout | undefined to PlanTreeProvider. In setRequestStatus(), only call this.emitter.fire(undefined) if no timer is pending; otherwise schedule it for 500ms later and clear any prior timer. This limits tree rebuilds to max 2/sec during streaming.

Risk: Low — status display slightly delayed but functionally unchanged

P1-A5: Parallelize signature extraction in scanner
File: scanner/WorkspaceScanner.ts:54-68

Approach: Replace the sequential for...of loop with a batched Promise.all. Group sourceFiles into chunks of 10, Promise.all each chunk, then flatten results into signaturesByFile. This keeps memory bounded while parallelizing I/O.

Risk: Low

P1-A6: Fix discoverFiles() O(n²) queue
File: scanner/WorkspaceScanner.ts:93-129

Approach: Replace queue.shift() with an integer index let head = 0 and access queue[head++]. Array stays allocated; no shifting.

Risk: Low

P1-A7: Cache AI provider instances in AIService
File: ai/AIService.ts:68-88

Approach: Add private claudeProvider: ClaudeProvider | undefined and private openAiProvider: OpenAIProvider | undefined plus a private lastKey: Map<string, string>. In resolveProvider(), return the cached instance if the key hasn't changed; create a new one only when the key changes or is new.

Risk: Low

P1-A8: Fix maybeArchiveDebateEntries() race condition
File: PlanController.ts:938-953

Approach: Make maybeArchiveDebateEntries() async and await it inside persistAndRefresh() before calling this.render(). Remove the fire-and-forget void pattern. This ensures archive mutations complete before the next render.

Risk: Low — slightly slower persist but correct behavior

P1-A9: Batch recomputeDerivedStatuses during task materialization
File: generation/TaskGenerator.ts:73-105, PlanController.ts:383-388

Approach: In planTask, move the recomputeDerivedStatuses call to after the entire for (const created of materialized) loop — it's already there at line 388, but addTask itself doesn't call it. Verify no intermediate recomputeDerivedStatuses calls exist in the loop. This is already almost correct; just confirm the loop itself doesn't re-trigger it.

Risk: Low

P1-A10: Remove onDidChangeActiveTextEditor refresh trigger
File: PlanController.ts:162-172

Approach: Delete this watcher entirely. The plan is kept current via the file-save watcher and file system watcher. Switching editor tabs should not trigger re-parsing. If the concern is CodeLens freshness, that is handled by VS Code's own CodeLens invalidation.

Risk: Low

Phase 2 — Usability Improvements
P2-B1: Fix "Allow All" consent scope
File: PlanController.ts:1231-1257

Approach: Remove workspaceState.update(CONSENT_STATE_KEY, true) — consent should not persist across sessions. Keep it in-memory only via this.sessionAllowAllConsent. Add a planmyproject.requireAiConsent setting with values "always" | "first-per-session" | "never" so power users can skip the prompt entirely. Rename the button to "Allow for this session" to clarify scope.

Risk: Low — only changes persistence behavior

P2-B2: Defer AI split suggestions until after user confirms
File: PlanController.ts:679-715

Approach: Replace the immediate suggestSplitTitles() call with a QuickPick that first asks: ["Get AI suggestions", "Enter manually"]. Only call suggestSplitTitles() if the user picks "Get AI suggestions". This avoids an AI call when the user ultimately enters titles manually.

Risk: Low

P2-B3: Add scan freshness check before planTask
File: PlanController.ts:326

Approach: Add a planmyproject.scanner.cacheTtlMinutes setting (default: 5). In planTask, before calling refreshScan(), check this.scan?.scannedAt — if it's within TTL, skip the rescan. Use the same check in debateTask.

Risk: Low

P2-B4: Show rationale in Output Channel instead of toast
File: PlanController.ts:754-760

Approach: Create a single vscode.OutputChannel (e.g., "PlanMyProject") on PlanController construction. In showTaskRationale, write the full rationale text to the channel and call channel.show(true) (preserve focus). This removes the character limit.

Risk: Low

P2-B5: Add file picker to viewLinkedFiles
File: PlanController.ts:762-782

Approach: Show a showQuickPick with canPickMany: true listing the linked file paths. Open only the selected files. If there's only one linked file, skip the picker and open directly.

Risk: Low

P2-B6: Restrict CodeLens to plan file only
File: PlanController.ts:86

Approach: Change the document selector pattern from "**/*.md" to the configured plan filename (e.g., "**/planmyproject.md"). Read it from config: config.get<string>("planFileName", "planmyproject.md").

Risk: Low — only reduces unnecessary CodeLens computation

P2-B7: Batch debate conflict warnings
File: PlanController.ts:1116-1122

Approach: Collect all new (unwarned) conflict IDs, then show a single showWarningMessage listing them all: "Debate log conflicts on: T0003, T0007. Resolve in the plan file." Remove the per-task loop of individual toasts.

Risk: Low

P2-B8: Build file watcher glob from configured plan filename
File: PlanController.ts:149

Approach: Replace the hard-coded string "{planmyproject.md,projectplan.md}" with a dynamic pattern built from config.get<string>("planFileName", "planmyproject.md"). Pass it as the glob to createFileSystemWatcher.

Risk: Low

P2-B9: Make scanTask task-scoped
File: PlanController.ts:598-617

Approach: When a task is selected and it has linkedFiles, use vscode.workspace.fs.readFile to re-read only those files and update their entries in this.scan.modules. Only fall back to a full refreshScan() when no task is selected or linkedFiles is empty.

Risk: Medium — requires extracting partial-scan logic from WorkspaceScanner

P2-B10: Improve importGoalStatement parsing
File: PlanController.ts:1288-1308

Approach: Scan the imported markdown for labeled sections using heading patterns like ## Constraints, ## Out of Scope, ## Success Criteria. Extract their bullet lists into the corresponding ProjectGoal fields. Fall back to current behavior when sections aren't found.

Risk: Low

Phase 3 — Architecture Refactor
P3-C1: Extract ScanService
New file: src/scanner/ScanService.ts

Approach: Move refreshScan(), scanTask(), scan cache load/save, maybeSuggestGitignoreEntry(), and the TTL freshness check (from P2-B3) into a ScanService class. It holds this.scan, this.scanner, this.scanCacheStore. PlanController delegates to it. ScanService exposes: getScan(), refresh(options), refreshForTask(task), isStale(ttlMinutes).

Risk: Medium — mechanical extraction, no logic change

P3-C2: Extract ConsentService
New file: src/ai/ConsentService.ts

Approach: Move ensureAiConsent() and the session-consent state into ConsentService. It holds in-memory allowAllThisSession and reads the requireAiConsent setting from P2-B1. Expose requestConsent(operation, summaryLines): Promise<boolean>.

Risk: Low

P3-C3: Extract TaskCommandService
New file: src/controller/TaskCommandService.ts

Approach: Move planTask(), implementTask(), addTask(), deleteTask(), debateTask(), handleDebateAction(), markResearchComplete() into TaskCommandService. It takes PlanController's collaborators as constructor args (repository, aiService, scanner, etc.). PlanController.registerCommands() delegates to it.

Risk: Medium — large mechanical move, test carefully

P3-C4: Extract GoalCommandService
New file: src/controller/GoalCommandService.ts

Approach: Move setProjectGoal(), importGoalStatement(), maybeSuggestStarterRootTasks(), parseGoalFromMarkdown() into GoalCommandService. Depends on PlanRepository, AIService, GoalSetupPanel.

Risk: Low

P3-C5: Add lightweight undo stack
File: PlanController.ts

Approach: Add private undoStack: string[] = [] (capped at 10 entries). In persistAndRefresh(), before writing, push the current serialized plan string onto the stack. Register command planmyproject.undoLastChange that pops the stack, writes the previous markdown back to disk, and calls refreshPlanState(). Show a status bar notification on undo.

Risk: Low — purely additive

Suggested Execution Order
Phase	Items	Approach
1	P1-A1 through P1-A10	Start here — zero behavior change, immediate gains
2	P2-B1 through P2-B8 first, then B9/B10	B9 has medium risk, do last in phase
3	C2, C4, C1, C3 in that order	Smallest → largest extraction; C3 last (biggest move)
Phase 1 can be done incrementally per-item with no coordination. Phase 3 items should be done one service at a time with a test run between each extraction.