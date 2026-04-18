/**
 * P4-G1 — Integration test harness
 *
 * Tests cross-module interaction chains that unit tests (which mock at service
 * boundaries) cannot catch. All four scenarios from the spec are covered:
 *
 *  1. v1 → v2 migration round-trip
 *  2. research gate → queue derivation (scan → generate → queue)
 *  3. research complete → index entry → prompt inclusion
 *  4. debate lifecycle → plan serialization round-trip
 */

import test from "node:test";
import assert from "node:assert/strict";

import { addTask, createEmptyPlanDocument, createTaskNode, type ProjectGoal, type ResearchIndexEntry } from "../../src/model";
import { parsePlanMarkdown, serializePlanMarkdown, upgradeSchemaV1ToV2 } from "../../src/parser";
import { buildExecutionQueue } from "../../src/queue";
import { buildTaskGenerationPrompt } from "../../src/ai/PromptBuilder";
import { DebateService } from "../../src/debate/DebateService";
import type { AIService } from "../../src/ai/AIService";

// ---------------------------------------------------------------------------
// Scenario 1 — v1 → v2 migration round-trip
// ---------------------------------------------------------------------------

test("v1 to v2 migration round-trip preserves all tasks and schema version", () => {
  const v1Markdown = [
    "# Project Plan",
    "",
    "<!-- pmp:schema=v1 -->",
    "",
    "## Goals",
    "",
    "- [G0001] Build auth system",
    "  <!-- pmp:goal-meta:id=G0001;criteria=[\"Users can log in\"];constraints=[\"Node.js\"];out-of-scope=[\"OAuth\"] -->",
    "",
    "## Plan Tree",
    "",
    "- [ ] [T0001] Build auth system",
    "  <!-- pmp:id=T0001;parent=ROOT;type=implementation;origin=manual;confidence=null -->",
    "  - [ ] [T0002] Write login endpoint",
    "    <!-- pmp:id=T0002;parent=T0001;type=implementation;origin=manual;confidence=null -->",
    "",
    "## Execution Queue (Auto-Generated, Leaf Tasks Only)",
    "",
    "### ⚙️ Ready to Implement",
    "1. [T0002] Write login endpoint"
  ].join("\n");

  // Step 1 — parse: schema version detected correctly
  // Parent relationship is determined by indentation depth (2 spaces per level)
  const parseResult = parsePlanMarkdown(v1Markdown);
  assert.equal(parseResult.schemaVersion, "v1", "initial parse should detect v1");
  assert.ok(parseResult.plan.tasks["T0001"], "T0001 should be present");
  assert.ok(parseResult.plan.tasks["T0002"], "T0002 should be present");
  assert.equal(parseResult.plan.tasks["T0002"].parentId, "T0001", "child task parent ref set by indentation");

  // Step 2 — upgrade: schema bumped, tasks receive v2 defaults
  const { changed, upgraded } = upgradeSchemaV1ToV2(parseResult.plan);
  assert.equal(changed, true, "upgrade should report a change");
  assert.equal(upgraded.schemaVersion, "v2", "schema version should be v2 after upgrade");
  assert.equal(upgraded.tasks["T0001"].type, "implementation", "v1 tasks default to implementation");
  assert.equal(upgraded.tasks["T0002"].type, "implementation");
  assert.deepEqual(upgraded.tasks["T0001"].dependsOn, [], "dependsOn defaults to empty");

  // Step 3 — serialize: v2 markers present, task IDs in output
  const serialized = serializePlanMarkdown(upgraded);
  assert.match(serialized, /<!-- pmp:schema=v2 -->/, "serialized output should carry v2 marker");
  assert.match(serialized, /\[T0001\]/, "T0001 should appear in serialized markdown");
  assert.match(serialized, /\[T0002\]/, "T0002 should appear in serialized markdown");

  // Step 4 — re-parse: round-trip fidelity
  const reparsed = parsePlanMarkdown(serialized);
  assert.equal(reparsed.schemaVersion, "v2", "reparsed plan should still be v2");
  assert.ok(reparsed.plan.tasks["T0001"], "T0001 must survive round-trip");
  assert.ok(reparsed.plan.tasks["T0002"], "T0002 must survive round-trip");
  assert.equal(reparsed.plan.tasks["T0002"].parentId, "T0001", "parent relationship preserved through round-trip");
  assert.equal(reparsed.plan.goals.length, 1, "goal should survive round-trip");
});

// ---------------------------------------------------------------------------
// Scenario 2 — research gate → queue derivation (scan → generate → queue)
// ---------------------------------------------------------------------------

test("research gate blocks implementation until research task is done", () => {
  const plan = createEmptyPlanDocument();
  const root = createTaskNode({ id: "T0001", title: "API layer", type: "milestone" });
  const research = createTaskNode({ id: "T0002", title: "Evaluate auth strategy", type: "research", parentId: "T0001" });
  const impl = createTaskNode({ id: "T0003", title: "Implement JWT middleware", type: "implementation", parentId: "T0001" });
  impl.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, research);
  addTask(plan, impl);

  // Research incomplete — impl must be blocked
  const blockedQueue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(blockedQueue.research.length, 1, "research task must appear in research queue");
  assert.equal(blockedQueue.research[0].id, "T0002");
  assert.equal(blockedQueue.blocked.length, 1, "impl task must be blocked by research dependency");
  assert.equal(blockedQueue.blocked[0].id, "T0003");
  assert.equal(blockedQueue.implementationReady.length, 0, "no impl tasks ready while research is open");

  // Complete research — impl should unblock
  research.status = "done";
  const readyQueue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(readyQueue.research.length, 0, "done research should not appear in research queue");
  assert.equal(readyQueue.blocked.length, 0, "impl should be unblocked once research is done");
  assert.equal(readyQueue.implementationReady.length, 1, "impl must be ready after research completes");
  assert.equal(readyQueue.implementationReady[0].id, "T0003");
});

test("milestone tasks are separated into their own queue section", () => {
  const plan = createEmptyPlanDocument();
  const milestone = createTaskNode({ id: "T0001", title: "MVP shipped", type: "milestone" });
  const impl = createTaskNode({ id: "T0002", title: "Build dashboard", type: "implementation" });

  addTask(plan, milestone);
  addTask(plan, impl);

  const queue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(queue.milestone.length, 1, "milestone tasks go into the milestone section");
  assert.equal(queue.milestone[0].id, "T0001");
  assert.equal(queue.implementationReady.length, 1, "unblocked impl task is ready");
  assert.equal(queue.implementationReady[0].id, "T0002");
});

// ---------------------------------------------------------------------------
// Scenario 3 — research complete → index entry → prompt inclusion
// ---------------------------------------------------------------------------

test("completed research conclusions appear in task generation prompt", () => {
  const knowledge: ResearchIndexEntry[] = [
    {
      taskId: "T0002",
      taskTitle: "Evaluate JWT vs session tokens",
      type: "research",
      conclusion: "JWT chosen for stateless auth across microservices",
      tags: ["jwt", "auth", "session", "token", "microservices"],
      goalRef: "G0001",
      completedAt: "2026-04-01T10:00:00.000Z",
      usedInPrompts: 0
    }
  ];

  const parentTask = createTaskNode({ id: "T0003", title: "Implement authentication module", type: "implementation" });
  const goal: ProjectGoal = {
    id: "G0001",
    statement: "Build a secure multi-service auth system",
    successCriteria: ["Users can authenticate across all services"],
    constraints: ["Node.js", "Stateless tokens"],
    outOfScope: ["OAuth provider"]
  };

  const prompt = buildTaskGenerationPrompt({
    goal,
    scan: undefined,
    knowledge,
    parentTask,
    existingChildren: [],
    alreadyExistingAreas: [],
    includeSignatures: false
  });

  // Knowledge layer must appear with the research conclusion
  assert.match(prompt, /\[KNOWLEDGE LAYER\]/, "prompt must include a knowledge layer header");
  assert.match(prompt, /JWT chosen for stateless auth/, "research conclusion must appear in prompt");
  assert.match(prompt, /T0002/, "task ID from research index must appear in prompt");

  // Goal layer must be present
  assert.match(prompt, /Build a secure multi-service auth system/, "goal statement must appear");
  assert.match(prompt, /\[GOAL LAYER\]/, "prompt must include a goal layer header");
});

test("prompt marks no research when knowledge index is empty", () => {
  const parentTask = createTaskNode({ id: "T0001", title: "Build dashboard", type: "implementation" });

  const prompt = buildTaskGenerationPrompt({
    goal: undefined,
    scan: undefined,
    knowledge: [],
    parentTask,
    existingChildren: [],
    alreadyExistingAreas: [],
    includeSignatures: false
  });

  assert.match(prompt, /\(no indexed research yet\)/, "empty knowledge should produce fallback text");
});

// ---------------------------------------------------------------------------
// Scenario 4 — debate lifecycle → plan serialization round-trip
// ---------------------------------------------------------------------------

test("debate accept action persists through plan serialization round-trip", async () => {
  const plan = createEmptyPlanDocument();
  const task = createTaskNode({ id: "T0001", title: "Build authentication layer", type: "implementation" });
  addTask(plan, task);

  // DebateService.applyAction and appendEntry do not call aiService — safe to pass null
  const debateService = new DebateService(
    null as unknown as AIService,
    async () => "integration-test-user"
  );

  // Simulate a debate opening user message
  await debateService.appendEntry(task, {
    role: "user",
    content: "Should this use sessions instead of JWT for better revocation support?"
  });

  assert.equal(task.debateLog.length, 1, "user message should be appended");
  assert.equal(task.debateLog[0].author, "integration-test-user");

  // Apply accept resolution action
  const result = await debateService.applyAction(plan, task, "accept");
  assert.equal(result.changed, true, "accept action should mark plan as changed");
  assert.ok(
    task.debateLog.some((entry) => entry.action === "accept"),
    "accept action entry must be in the debate log"
  );

  // Serialize and verify debate log is embedded in markdown
  const serialized = serializePlanMarkdown(plan);
  assert.match(serialized, /Should this use sessions instead of JWT/, "user message must appear in serialized plan");

  // Parse back and verify round-trip fidelity
  const reparsed = parsePlanMarkdown(serialized);
  const reparsedTask = reparsed.plan.tasks["T0001"];
  assert.ok(reparsedTask, "task must survive serialization round-trip");
  assert.ok(reparsedTask.debateLog.length > 0, "debate log must be preserved");
  assert.ok(
    reparsedTask.debateLog.some((entry) => entry.action === "accept"),
    "accept action must survive serialization round-trip"
  );
});

test("debate split action replaces task with child tasks in plan", async () => {
  const plan = createEmptyPlanDocument();
  const task = createTaskNode({ id: "T0001", title: "Build monolithic auth", type: "implementation" });
  addTask(plan, task);

  const debateService = new DebateService(
    null as unknown as AIService,
    async () => undefined
  );

  const result = await debateService.applyAction(plan, task, "split", {
    splitTitles: ["Implement login endpoint", "Implement token refresh", "Implement logout"],
    splitType: "implementation"
  });

  assert.equal(result.changed, true, "split action should report change");
  assert.equal(plan.tasks["T0001"], undefined, "original task should be removed after split");
  const allTitles = Object.values(plan.tasks).map((t) => t.title);
  assert.ok(allTitles.includes("Implement login endpoint"), "first split task must exist");
  assert.ok(allTitles.includes("Implement token refresh"), "second split task must exist");
  assert.ok(allTitles.includes("Implement logout"), "third split task must exist");
});

test("debate rewrite action updates task title and persists through serialization", async () => {
  const plan = createEmptyPlanDocument();
  const task = createTaskNode({ id: "T0001", title: "Do auth stuff", type: "implementation" });
  addTask(plan, task);

  const debateService = new DebateService(
    null as unknown as AIService,
    async () => undefined
  );

  const result = await debateService.applyAction(plan, task, "rewrite", {
    rewriteTitle: "Implement OAuth2 authorization code flow",
    rewrittenRationale: "OAuth2 is the industry standard for delegated authorization."
  });

  assert.equal(result.changed, true);
  assert.equal(task.title, "Implement OAuth2 authorization code flow");
  assert.equal(task.rationale, "OAuth2 is the industry standard for delegated authorization.");

  // Verify the rewrite persists through serialization
  const serialized = serializePlanMarkdown(plan);
  const reparsed = parsePlanMarkdown(serialized);
  assert.equal(
    reparsed.plan.tasks["T0001"]?.title,
    "Implement OAuth2 authorization code flow",
    "rewritten title must survive serialization"
  );
});
