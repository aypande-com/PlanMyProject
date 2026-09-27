import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { addTask, createEmptyPlanDocument, createTaskNode, type PlanDocument } from "../../src/model";
import { buildExecutionQueue } from "../../src/queue/QueueBuilder";

// P0-A2: queue build is super-linear (QueueBuilder.ts - queue.shift(), a full
// queue.sort() on every insertion, and getTaskTraversalRank walking the tree
// from all roots per comparison). This fixture is a layered DAG rather than a
// single dependency chain: a chain only ever has one task ready at a time, which
// never stresses the resort, and never exposes the defect. Branching=20 means
// every batch of 20 tasks becomes ready together at each layer transition,
// which is what makes the O(n) traversal-rank walk inside every comparison and
// the repeated O(n log n) resorts show up. Not wired into `npm test` - this is
// a `.bench.ts` file, deliberately excluded from the default `*.test.js` glob,
// because it is currently slow enough (seconds, not milliseconds) that it does
// not belong in the suite that runs on every `npm test`. U5 gives it a proper
// `npm run bench` harness and a CI budget gate with a tolerance band.

const TASK_COUNT = 2000;
const BRANCHING_FACTOR = 20;
const BUDGET_MS = 10;

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

test(`buildExecutionQueue completes within ${BUDGET_MS}ms at ${TASK_COUNT} tasks with edges intact (P0-A2)`, () => {
  const plan = buildFixture();

  // Precondition, re-checked here so this test fails on its own fixture defect
  // rather than silently passing a fast-but-meaningless empty-edge run.
  assert.equal(countDependencyEdges(plan), TASK_COUNT - BRANCHING_FACTOR);

  // A single cold call pays a one-time V8 JIT/inline-cache warm-up cost that
  // has nothing to do with the algorithm's complexity (a trivial O(n) loop
  // over 2,000 plain objects is sub-2ms cold; this function's object/Map
  // shapes just take a few calls to specialize). U5 formalizes proper
  // warm-up + a committed baseline with a tolerance band; this takes the
  // minimum of several post-warm-up runs in the meantime, which is standard
  // microbenchmark practice for filtering scheduler/GC noise out of a
  // CPU-bound measurement.
  for (let i = 0; i < 3; i += 1) {
    buildExecutionQueue(buildFixture());
  }

  let queue: ReturnType<typeof buildExecutionQueue> | undefined;
  let bestMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 5; i += 1) {
    const runPlan = buildFixture();
    const start = performance.now();
    const result = buildExecutionQueue(runPlan);
    const elapsedMs = performance.now() - start;
    if (elapsedMs < bestMs) {
      bestMs = elapsedMs;
      queue = result;
    }
  }

  assert.ok(queue);
  const accountedFor =
    queue.blocked.length + queue.research.length + queue.decision.length + queue.implementationReady.length + queue.milestone.length;
  assert.equal(accountedFor, TASK_COUNT, "every leaf task must land in exactly one queue section");

  assert.ok(
    bestMs < BUDGET_MS,
    `best of 5 post-warm-up runs took ${bestMs.toFixed(1)}ms, budget is ${BUDGET_MS}ms - must fail on baebf65 (P0-A2), must pass after U3`
  );
});
