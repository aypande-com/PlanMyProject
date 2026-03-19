import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import { buildExecutionQueue } from "../src/queue";

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
