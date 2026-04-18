import test from "node:test";
import assert from "node:assert/strict";
import { PlanTreeProvider } from "../src/ui/TreeProvider";
import { createEmptyPlanDocument, createTaskNode, addTask } from "../src/model";

function makeV1Plan() {
  const plan = createEmptyPlanDocument();
  plan.schemaVersion = "v1";
  const task = createTaskNode({ id: "T0001", title: "Build feature", type: "implementation" });
  addTask(plan, task);
  return plan;
}

function makeV2Plan() {
  const plan = createEmptyPlanDocument();
  plan.schemaVersion = "v2";
  const task = createTaskNode({ id: "T0001", title: "Build feature", type: "implementation" });
  addTask(plan, task);
  return plan;
}

test("v1 plan: tree root includes V1ReadOnlyBannerItem", async () => {
  const provider = new PlanTreeProvider();
  provider.setPlan(makeV1Plan());

  const children = await provider.getChildren(undefined);
  assert.ok(children, "Expected children array");
  const contextValues = children.map((item) => (item as { contextValue?: string }).contextValue ?? "");
  assert.ok(contextValues.includes("v1ReadOnlyBanner"), "Expected v1ReadOnlyBanner item in root children");
});

test("v2 plan: tree root does not include V1ReadOnlyBannerItem", async () => {
  const provider = new PlanTreeProvider();
  provider.setPlan(makeV2Plan());

  const children = await provider.getChildren(undefined);
  assert.ok(children, "Expected children array");
  const contextValues = children.map((item) => (item as { contextValue?: string }).contextValue ?? "");
  assert.ok(!contextValues.includes("v1ReadOnlyBanner"), "v1ReadOnlyBanner must not appear for v2 plans");
});
