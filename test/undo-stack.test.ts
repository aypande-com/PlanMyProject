import test from "node:test";
import assert from "node:assert/strict";
import { pushUndoEntry } from "../src/controller/PlanController";

test("pushUndoEntry adds entry to stack", () => {
  const stack: string[] = [];
  pushUndoEntry(stack, "v1", 10);
  assert.equal(stack.length, 1);
  assert.equal(stack[0], "v1");
});

test("pushUndoEntry preserves order (oldest first)", () => {
  const stack: string[] = [];
  pushUndoEntry(stack, "v1", 10);
  pushUndoEntry(stack, "v2", 10);
  pushUndoEntry(stack, "v3", 10);
  assert.deepEqual(stack, ["v1", "v2", "v3"]);
});

test("pushUndoEntry caps stack at maxSize", () => {
  const stack: string[] = [];
  for (let i = 1; i <= 12; i++) {
    pushUndoEntry(stack, `v${i}`, 10);
  }
  assert.equal(stack.length, 10);
  assert.equal(stack[0], "v3");
  assert.equal(stack[9], "v12");
});

test("pushUndoEntry with maxSize=1 keeps only latest", () => {
  const stack: string[] = [];
  pushUndoEntry(stack, "old", 1);
  pushUndoEntry(stack, "new", 1);
  assert.equal(stack.length, 1);
  assert.equal(stack[0], "new");
});

test("pushUndoEntry returns the same array reference", () => {
  const stack: string[] = [];
  const result = pushUndoEntry(stack, "v1", 10);
  assert.strictEqual(result, stack);
});
