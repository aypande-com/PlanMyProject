import test from "node:test";
import assert from "node:assert/strict";
import { describeTaskBlockMessage } from "../src/controller/TaskCommandService";

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
