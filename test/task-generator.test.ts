import test from "node:test";
import assert from "node:assert/strict";
import { TaskGenerator } from "../src/generation";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import type { AIService } from "../src/ai/AIService";
import type { GeneratedTaskDraft } from "../src/ai/types";

function draft(overrides: Partial<GeneratedTaskDraft> = {}): GeneratedTaskDraft {
  return {
    title: "Do something",
    type: "implementation",
    rationale: "because",
    goalCriterionIndex: 0,
    confidence: 0.8,
    dependsOnTitles: [],
    linkedFiles: [],
    ...overrides
  };
}

// P4-B2: materializeDrafts hardcoded origin: "ai-generated" regardless of
// caller. TaskNode.origin has supported "code-inferred" from the start, but
// nothing ever produced one.

test("materializeDrafts defaults to ai-generated origin when none is passed", () => {
  const plan = createEmptyPlanDocument();
  const parent = createTaskNode({ id: "T0001", title: "Parent", type: "milestone" });
  addTask(plan, parent);

  const generator = new TaskGenerator(null as unknown as AIService);
  const [created] = generator.materializeDrafts(plan, parent, [draft()]);

  assert.equal(created.origin, "ai-generated");
});

test("materializeDrafts tags tasks as code-inferred when the caller passes that origin", () => {
  const plan = createEmptyPlanDocument();
  const parent = createTaskNode({ id: "T0001", title: "Parent", type: "milestone" });
  addTask(plan, parent);

  const generator = new TaskGenerator(null as unknown as AIService);
  const created = generator.materializeDrafts(plan, parent, [draft({ title: "A" }), draft({ title: "B" })], "code-inferred");

  assert.equal(created.length, 2);
  assert.ok(created.every((task) => task.origin === "code-inferred"));
});
