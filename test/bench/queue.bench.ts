import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode, type PlanDocument } from "../../src/model";
import { buildExecutionQueue } from "../../src/queue/QueueBuilder";
import { measure, assertWithinBaseline } from "./benchHarness";

// P0-A2: queue build is super-linear (QueueBuilder.ts - queue.shift(), a full
// queue.sort() on every insertion, and getTaskTraversalRank walking the tree
// from all roots per comparison). This fixture is a layered DAG rather than a
// single dependency chain: a chain only ever has one task ready at a time, which
// never stresses the resort, and never exposes the defect. Branching=20 means
// every batch of 20 tasks becomes ready together at each layer transition,
// which is what makes the O(n) traversal-rank walk inside every comparison and
// the repeated O(n log n) resorts show up. Not wired into `npm test` - this is
// a `.bench.ts` file, deliberately excluded from the default `*.test.js` glob,
// and run separately via `npm run bench` (U5).

const TASK_COUNT = 2000;
const BRANCHING_FACTOR = 20;
const BENCH_NAME = "queue-build-2000-tasks";

function buildFixture(): PlanDocument {
  const plan = createEmptyPlanDocument();
  const root = createTaskNode({ id: "T0000", title: "Root", type: "milestone" });
  addTask(plan, root);

  for (let i = 1; i <= TASK_COUNT; i += 1) {
    const id = `T${String(i).padStart(4, "0")}`;
    const task = createTaskNode({ id, title: `Leaf task ${i}`, type: "implementation", parentId: root.id });
    if (i > BRANCHING_FACTOR) {
      task.dependsOn = [`T${String(i - BRANCHING_FACTOR).padStart(4, "0")}`];
    }
    addTask(plan, task);
  }

  return plan;
}

function countDependencyEdges(plan: PlanDocument): number {
  return Object.values(plan.tasks).reduce((sum, task) => sum + task.dependsOn.length, 0);
}

test("queue benchmark fixture carries the expected dependency-edge count", () => {
  const plan = buildFixture();
  const edgeCount = countDependencyEdges(plan);
  assert.equal(
    edgeCount,
    TASK_COUNT - BRANCHING_FACTOR,
    "a fixture whose edges are dropped measures nothing - this must hold before any timing assertion is meaningful"
  );
});

test(`${BENCH_NAME}: buildExecutionQueue stays within the committed baseline at ${TASK_COUNT} tasks with edges intact (P0-A2)`, () => {
  const plan = buildFixture();

  // Precondition, re-checked here so this test fails on its own fixture defect
  // rather than silently passing a fast-but-meaningless empty-edge run.
  assert.equal(countDependencyEdges(plan), TASK_COUNT - BRANCHING_FACTOR);

  // buildExecutionQueue does not mutate `plan`, so the same fixture is reused
  // across every warm-up and timed run - only the operation being measured is
  // timed, not fixture construction.
  let queue: ReturnType<typeof buildExecutionQueue> | undefined;
  const sample = measure(BENCH_NAME, () => {
    queue = buildExecutionQueue(plan);
  });

  assert.ok(queue);
  const accountedFor =
    queue.blocked.length + queue.research.length + queue.decision.length + queue.implementationReady.length + queue.milestone.length;
  assert.equal(accountedFor, TASK_COUNT, "every leaf task must land in exactly one queue section");

  assertWithinBaseline(sample);
});
