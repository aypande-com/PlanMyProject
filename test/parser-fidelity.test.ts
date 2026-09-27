import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import { parsePlanMarkdown, serializePlanMarkdown } from "../src/parser";

// P0-A1: parseInlineMetadata (PlanParser.ts) slices the metadata comment at the
// first colon it finds anywhere in the string. The task-metadata caller has
// already stripped the "pmp:" prefix, so once a field with a colon in its value
// (createdAt/completedAt are ISO-8601 timestamps) is present, the slice lands
// inside that timestamp instead of at a prefix boundary - and everything
// serialized before that point (type, origin, goalRef, confidence, dependsOn,
// linkedFiles, fileSendPolicy) is silently dropped from the parsed metadata,
// not just the timestamp itself. Every field below is asserted individually,
// per field, rather than via a single deep-equal on the task object, so a
// partial fix that repairs some fields but not others is still caught.

test("task metadata round-trips every field individually through serialize/parse", () => {
  const plan = createEmptyPlanDocument();

  const root = createTaskNode({ id: "T0001", title: "Root", type: "milestone" });
  const dependency = createTaskNode({ id: "T0002", title: "Dependency task", type: "implementation", parentId: "T0001" });

  const task = createTaskNode({
    id: "T0003",
    title: "Evaluate storage approach",
    type: "research",
    parentId: "T0001",
    origin: "ai-generated",
    goalRef: "G0001",
    createdAt: "2026-01-15T10:30:00.000Z",
    fileSendPolicy: "always"
  });
  task.confidence = 0.73;
  task.dependsOn = ["T0002"];
  task.linkedFiles = ["src/scanner/WorkspaceScanner.ts", "src/scanner/SignatureExtractor.ts"];
  task.notes = "Prefer the existing scanner cache over a fresh crawl";
  task.completedAt = "2026-02-01T00:00:00.000Z";
  task.archivedDebatePath = ".pmp/debate-archive/T0003.json";

  addTask(plan, root);
  addTask(plan, dependency);
  addTask(plan, task);

  const markdown = serializePlanMarkdown(plan);
  const parsed = parsePlanMarkdown(markdown).plan.tasks["T0003"];
  assert.ok(parsed, "task T0003 must survive the round trip");

  assert.equal(parsed.id, task.id, "id");
  assert.equal(parsed.parentId, task.parentId, "parentId");
  assert.equal(parsed.type, task.type, "type");
  assert.equal(parsed.origin, task.origin, "origin");
  assert.equal(parsed.goalRef, task.goalRef, "goalRef");
  assert.equal(parsed.confidence, task.confidence, "confidence");
  assert.deepEqual(parsed.dependsOn, task.dependsOn, "dependsOn");
  assert.deepEqual(parsed.linkedFiles, task.linkedFiles, "linkedFiles");
  assert.equal(parsed.fileSendPolicy, task.fileSendPolicy, "fileSendPolicy");
  assert.equal(parsed.createdAt, task.createdAt, "createdAt");
  assert.equal(parsed.completedAt, task.completedAt, "completedAt");
  assert.equal(parsed.notes, task.notes, "notes");
  assert.equal(parsed.archivedDebatePath, task.archivedDebatePath, "archivedDebatePath");
});
