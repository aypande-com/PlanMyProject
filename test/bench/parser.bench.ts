import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode, type PlanDocument } from "../../src/model";
import { parsePlanMarkdown, serializePlanMarkdown } from "../../src/parser";
import { measure, assertWithinBaseline } from "./benchHarness";

// Parse/serialize were listed as baseline numbers in the v3 plan (§16) but the
// bench suite only covered queue build. Profiling showed parse time growing
// faster than linearly (500/1000/2000 tasks: 33/70/184ms): addTask guarded
// against duplicates with parent.children.includes(), O(siblings) per add, so
// a plan with many siblings or many root tasks was quadratic. The fixture is
// deliberately the worst case for that - every task is a sibling under one
// parent, with a dependency chain so metadata parsing is exercised too.

const GATED_TASK_COUNT = 2000;
const SMALL_COUNT = 1000;
const LARGE_COUNT = 4000;

function buildFlatPlan(taskCount: number): PlanDocument {
  const plan = createEmptyPlanDocument();
  addTask(plan, createTaskNode({ id: "T0000", title: "Root", type: "milestone" }));
  for (let i = 1; i <= taskCount; i += 1) {
    const id = `T${String(i).padStart(4, "0")}`;
    const task = createTaskNode({ id, title: `Leaf task ${i}`, type: "implementation", parentId: "T0000" });
    if (i > 1) {
      task.dependsOn = [`T${String(i - 1).padStart(4, "0")}`];
    }
    addTask(plan, task);
  }
  return plan;
}

function buildManyRootsPlan(taskCount: number): PlanDocument {
  const plan = createEmptyPlanDocument();
  for (let i = 1; i <= taskCount; i += 1) {
    addTask(plan, createTaskNode({ id: `T${String(i).padStart(4, "0")}`, title: `Root task ${i}`, type: "implementation" }));
  }
  return plan;
}

function countDependencyEdges(plan: PlanDocument): number {
  return Object.values(plan.tasks).reduce((sum, task) => sum + task.dependsOn.length, 0);
}

test("parser benchmark fixture round-trips with its dependency edges intact", () => {
  const plan = buildFlatPlan(GATED_TASK_COUNT);
  assert.equal(countDependencyEdges(plan), GATED_TASK_COUNT - 1);

  const reparsed = parsePlanMarkdown(serializePlanMarkdown(plan)).plan;
  assert.equal(Object.keys(reparsed.tasks).length, GATED_TASK_COUNT + 1);
  assert.equal(countDependencyEdges(reparsed), GATED_TASK_COUNT - 1, "a fixture that loses edges on the round trip measures nothing");
});

test(`parse-${GATED_TASK_COUNT}-tasks: parsePlanMarkdown stays within the committed baseline`, () => {
  const markdown = serializePlanMarkdown(buildFlatPlan(GATED_TASK_COUNT));
  assertWithinBaseline(measure(`parse-${GATED_TASK_COUNT}-tasks`, () => parsePlanMarkdown(markdown)));
});

test(`serialize-${GATED_TASK_COUNT}-tasks: serializePlanMarkdown stays within the committed baseline`, () => {
  const plan = buildFlatPlan(GATED_TASK_COUNT);
  assertWithinBaseline(measure(`serialize-${GATED_TASK_COUNT}-tasks`, () => serializePlanMarkdown(plan)));
});

// Machine-independent guard against the shape of the curve rather than one
// machine's absolute numbers: 4x the tasks should cost about 4x for linear
// work and about 16x for quadratic. Pre-fix this measured roughly 8x.
test("parse time scales close to linearly from 1,000 to 4,000 tasks", () => {
  const small = serializePlanMarkdown(buildFlatPlan(SMALL_COUNT));
  const large = serializePlanMarkdown(buildFlatPlan(LARGE_COUNT));

  const smallMs = measure("parse-scaling-small", () => parsePlanMarkdown(small)).minMs;
  const largeMs = measure("parse-scaling-large", () => parsePlanMarkdown(large)).minMs;
  const ratio = largeMs / smallMs;

  console.log(`[bench] parse scaling 1000->4000 tasks: ${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms (x${ratio.toFixed(1)}, linear=4, quadratic=16)`);
  assert.ok(ratio < 6, `parse grew x${ratio.toFixed(1)} for 4x the tasks; linear is ~4, quadratic ~16`);
});

test("parse time scales close to linearly with many root tasks", () => {
  const small = serializePlanMarkdown(buildManyRootsPlan(SMALL_COUNT));
  const large = serializePlanMarkdown(buildManyRootsPlan(LARGE_COUNT));

  const smallMs = measure("parse-roots-small", () => parsePlanMarkdown(small)).minMs;
  const largeMs = measure("parse-roots-large", () => parsePlanMarkdown(large)).minMs;
  const ratio = largeMs / smallMs;

  console.log(`[bench] parse scaling, root tasks 1000->4000: ${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms (x${ratio.toFixed(1)})`);
  assert.ok(ratio < 6, `parse grew x${ratio.toFixed(1)} for 4x the root tasks; linear is ~4, quadratic ~16`);
});
