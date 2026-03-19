import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import { upgradeSchemaV1ToV2 } from "../src/parser";

test("upgradeSchemaV1ToV2 sets v2 defaults", () => {
  const v1 = createEmptyPlanDocument();
  v1.schemaVersion = "v1";

  const root = createTaskNode({ id: "T0001", title: "Legacy task" });
  addTask(v1, root);

  const result = upgradeSchemaV1ToV2(v1);
  assert.equal(result.changed, true);
  assert.equal(result.upgraded.schemaVersion, "v2");
  assert.equal(result.upgraded.tasks["T0001"].type, "implementation");
  assert.deepEqual(result.upgraded.tasks["T0001"].dependsOn, []);
  assert.equal(result.upgraded.tasks["T0001"].confidence, null);
});
