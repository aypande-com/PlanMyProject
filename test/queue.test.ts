import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import { buildExecutionQueue } from "../src/queue";
import { parsePlanMarkdown, serializePlanMarkdown } from "../src/parser";

test("buildExecutionQueue prioritizes research and blocks dependent implementation", () => {
  const plan = createEmptyPlanDocument();

  const root = createTaskNode({ id: "T0001", title: "Auth", type: "milestone" });
  const research = createTaskNode({ id: "T0002", title: "Evaluate token strategy", type: "research", parentId: "T0001" });
  const implementation = createTaskNode({ id: "T0003", title: "Implement middleware", type: "implementation", parentId: "T0001" });
  implementation.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, research);
  addTask(plan, implementation);

  const queue = buildExecutionQueue(plan, { researchGate: true });

  assert.equal(queue.research.length, 1);
  assert.equal(queue.research[0].id, "T0002");
  assert.equal(queue.blocked.length, 1);
  assert.equal(queue.blocked[0].id, "T0003");
  assert.equal(queue.implementationReady.length, 0);
});

test("buildExecutionQueue allows implementation when dependencies are done", () => {
  const plan = createEmptyPlanDocument();

  const root = createTaskNode({ id: "T0001", title: "Auth", type: "milestone" });
  const research = createTaskNode({ id: "T0002", title: "Evaluate token strategy", type: "research", parentId: "T0001" });
  research.status = "done";
  const implementation = createTaskNode({ id: "T0003", title: "Implement middleware", type: "implementation", parentId: "T0001" });
  implementation.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, research);
  addTask(plan, implementation);

  const queue = buildExecutionQueue(plan, { researchGate: true });

  assert.equal(queue.blocked.length, 0);
  assert.equal(queue.implementationReady.length, 1);
  assert.equal(queue.implementationReady[0].id, "T0003");
});

test("buildExecutionQueue blocks implementation while debate thread is unresolved", () => {
  const plan = createEmptyPlanDocument();

  const root = createTaskNode({ id: "T0001", title: "Auth", type: "milestone" });
  const implementation = createTaskNode({ id: "T0003", title: "Implement middleware", type: "implementation", parentId: "T0001" });
  implementation.debateLog.push({
    timestamp: "2026-03-24T10:00:00.000Z",
    role: "user",
    content: "We should move this behind a feature flag first."
  });

  addTask(plan, root);
  addTask(plan, implementation);

  const blockedQueue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(blockedQueue.blocked.length, 1);
  assert.equal(blockedQueue.blocked[0].id, "T0003");
  assert.equal(blockedQueue.implementationReady.length, 0);

  implementation.debateLog.push({
    timestamp: "2026-03-24T10:01:00.000Z",
    role: "system",
    action: "accept",
    content: "Task accepted"
  });

  const resolvedQueue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(resolvedQueue.blocked.length, 0);
  assert.equal(resolvedQueue.implementationReady.length, 1);
  assert.equal(resolvedQueue.implementationReady[0].id, "T0003");
});

// P0-B2: this is the specific failure the gates exist to prevent - a
// dependency that is correctly enforced on an in-memory plan but silently
// stops being enforced once the plan has been through a save/reload cycle
// (P0-A1's colon-truncation bug dropped dependsOn on parse; a queue bug could
// separately fail to honor it even when parsed correctly).
test("an unresolved dependency stays blocked across a full serialize/parse round trip", () => {
  const plan = createEmptyPlanDocument();

  const root = createTaskNode({ id: "T0001", title: "Auth", type: "milestone" });
  const dependency = createTaskNode({ id: "T0002", title: "Evaluate token strategy", type: "research", parentId: "T0001" });
  const dependent = createTaskNode({ id: "T0003", title: "Implement middleware", type: "implementation", parentId: "T0001" });
  dependent.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, dependency);
  addTask(plan, dependent);

  const beforeQueue = buildExecutionQueue(plan, { researchGate: true });
  assert.equal(beforeQueue.blocked.map((t) => t.id).includes("T0003"), true, "blocked before round trip");

  const markdown = serializePlanMarkdown(plan);
  const roundTripped = parsePlanMarkdown(markdown).plan;

  assert.deepEqual(roundTripped.tasks["T0003"].dependsOn, ["T0002"], "dependsOn must survive the round trip");

  const afterQueue = buildExecutionQueue(roundTripped, { researchGate: true });
  assert.equal(afterQueue.blocked.map((t) => t.id).includes("T0003"), true, "T0003 must still be blocked after the round trip");
  assert.equal(afterQueue.implementationReady.map((t) => t.id).includes("T0003"), false, "T0003 must not be ready to implement");

  // Completing the dependency and round-tripping again must unblock it -
  // the gate should track real state, not just "always blocked".
  roundTripped.tasks["T0002"].status = "done";
  const unblockedMarkdown = serializePlanMarkdown(roundTripped);
  const unblockedPlan = parsePlanMarkdown(unblockedMarkdown).plan;
  const finalQueue = buildExecutionQueue(unblockedPlan, { researchGate: true });
  assert.equal(finalQueue.implementationReady.map((t) => t.id).includes("T0003"), true, "T0003 must be ready once its dependency is done");
});
