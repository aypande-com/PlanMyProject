import test from "node:test";
import assert from "node:assert/strict";
import {
  describeTaskBlockMessage,
  TaskCommandService,
  type TaskCommandContext,
  type TaskCommandServices
} from "../src/controller/TaskCommandService";
import { addTask, createEmptyPlanDocument, createTaskNode, type PlanDocument } from "../src/model";
import { parsePlanMarkdown, serializePlanMarkdown } from "../src/parser";

// collectAncestorChain and collectResearchConclusions are private - they take
// only (plan, taskId/task) and never touch `this.ctx`/`this.svc`, so an
// instance built from empty stand-ins is enough to call them directly. P0-B3:
// re-validating these against round-tripped data specifically, since (per
// R10) they have never run against a plan that survived a save before.
function createServiceForPrivateMethodAccess(): TaskCommandService {
  return new TaskCommandService({} as unknown as TaskCommandContext, {} as unknown as TaskCommandServices);
}

function collectAncestorChain(service: TaskCommandService, plan: PlanDocument, taskId: string) {
  return (service as unknown as { collectAncestorChain: (plan: PlanDocument, taskId: string) => unknown[] }).collectAncestorChain(
    plan,
    taskId
  );
}

function collectResearchConclusions(service: TaskCommandService, plan: PlanDocument, task: unknown) {
  return (
    service as unknown as { collectResearchConclusions: (plan: PlanDocument, task: unknown) => string[] }
  ).collectResearchConclusions(plan, task);
}

test("describeTaskBlockMessage dependency reason", () => {
  assert.equal(
    describeTaskBlockMessage("T0001", "dependency"),
    "Task T0001 is blocked by unresolved dependencies."
  );
});

test("describeTaskBlockMessage research-gate reason", () => {
  assert.equal(
    describeTaskBlockMessage("T0002", "research-gate"),
    "Task T0002 is blocked by unresolved sibling research or decision tasks."
  );
});

test("describeTaskBlockMessage debate-thread reason", () => {
  assert.equal(
    describeTaskBlockMessage("T0003", "debate-thread"),
    "Task T0003 is blocked until the debate thread is resolved."
  );
});

test("collectAncestorChain returns the full parent chain in root-to-leaf order after a round trip", () => {
  const plan = createEmptyPlanDocument();
  const grandparent = createTaskNode({ id: "T0001", title: "Epic", type: "milestone" });
  const parent = createTaskNode({ id: "T0002", title: "Feature", type: "milestone", parentId: "T0001" });
  const leaf = createTaskNode({ id: "T0003", title: "Implement handler", type: "implementation", parentId: "T0002" });

  addTask(plan, grandparent);
  addTask(plan, parent);
  addTask(plan, leaf);

  const roundTripped = parsePlanMarkdown(serializePlanMarkdown(plan)).plan;

  const service = createServiceForPrivateMethodAccess();
  const chain = collectAncestorChain(service, roundTripped, "T0003") as Array<{ id: string }>;

  assert.deepEqual(chain.map((task) => task.id), ["T0001", "T0002", "T0003"], "chain must be root-to-leaf, parentId intact after round trip");
});

test("collectResearchConclusions picks up dependency and sibling notes after a round trip", () => {
  const plan = createEmptyPlanDocument();
  const root = createTaskNode({ id: "T0001", title: "Auth", type: "milestone" });

  const dependency = createTaskNode({ id: "T0002", title: "Evaluate token strategy", type: "research", parentId: "T0001" });
  dependency.status = "done";
  dependency.notes = "Use short-lived JWTs with rotation";

  const sibling = createTaskNode({ id: "T0004", title: "Evaluate storage", type: "decision", parentId: "T0001" });
  sibling.status = "done";
  sibling.notes = "Use Postgres, not Mongo";

  const unfinishedSibling = createTaskNode({ id: "T0005", title: "Evaluate rate limiting", type: "research", parentId: "T0001" });
  unfinishedSibling.notes = "Should not appear - not done yet";

  const implementation = createTaskNode({ id: "T0003", title: "Implement middleware", type: "implementation", parentId: "T0001" });
  implementation.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, dependency);
  addTask(plan, sibling);
  addTask(plan, unfinishedSibling);
  addTask(plan, implementation);

  const roundTripped = parsePlanMarkdown(serializePlanMarkdown(plan)).plan;

  const service = createServiceForPrivateMethodAccess();
  const conclusions = collectResearchConclusions(service, roundTripped, roundTripped.tasks["T0003"]);

  assert.deepEqual(
    new Set(conclusions),
    new Set(["T0002: Use short-lived JWTs with rotation", "T0004: Use Postgres, not Mongo"]),
    "must include the done dependency's notes and the done sibling's notes, and exclude the unfinished sibling"
  );
});
