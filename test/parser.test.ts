import test from "node:test";
import assert from "node:assert/strict";
import { addTask, createEmptyPlanDocument, createTaskNode } from "../src/model";
import { parsePlanMarkdown, serializePlanMarkdown } from "../src/parser";

test("serializePlanMarkdown emits schema v2 and queue sections", () => {
  const plan = createEmptyPlanDocument();
  plan.goals.push({
    id: "G0001",
    statement: "Build multi-tenant invoicing",
    successCriteria: ["Users can create invoices"],
    constraints: ["Node backend"],
    outOfScope: ["Payments"]
  });

  const root = createTaskNode({ id: "T0001", title: "Build auth", type: "milestone", goalRef: "G0001" });
  const research = createTaskNode({ id: "T0002", title: "Evaluate storage approach", type: "research", parentId: "T0001", goalRef: "G0001" });
  const implement = createTaskNode({ id: "T0003", title: "Implement auth middleware", type: "implementation", parentId: "T0001", goalRef: "G0001" });
  implement.dependsOn = ["T0002"];

  addTask(plan, root);
  addTask(plan, research);
  addTask(plan, implement);

  const markdown = serializePlanMarkdown(plan, { researchGate: true, showRationaleInline: true });
  assert.match(markdown, /<!-- pmp:schema=v2 -->/);
  assert.match(markdown, /## Goals/);
  assert.match(markdown, /### ⚠️ Blocked/);
  assert.match(markdown, /### 🔍 Research Tasks/);
  assert.match(markdown, /### ⚙️ Ready to Implement/);

  const parsed = parsePlanMarkdown(markdown);
  assert.equal(parsed.schemaVersion, "v2");
  assert.equal(parsed.plan.goals.length, 1);
  assert.equal(parsed.plan.rootTaskIds.length, 1);
  assert.ok(parsed.plan.tasks["T0002"]);
  assert.ok(parsed.plan.tasks["T0003"]);
});

test("parsePlanMarkdown detects v1 schema marker", () => {
  const v1 = [
    "# Project Plan",
    "",
    "<!-- pmp:schema=v1 -->",
    "",
    "## Plan Tree",
    "- [ ] [T0001] Build auth",
    "",
    "## Execution Queue (Auto-Generated, Leaf Tasks Only)",
    "1. [T0001] Build auth"
  ].join("\n");

  const parsed = parsePlanMarkdown(v1);
  assert.equal(parsed.schemaVersion, "v1");
  assert.ok(parsed.plan.tasks["T0001"]);
});

test("serializePlanMarkdown keeps empty plan tree without synthetic root tasks", () => {
  const plan = createEmptyPlanDocument();
  plan.goals.push({
    id: "G0001",
    statement: "Ship MVP",
    successCriteria: [],
    constraints: [],
    outOfScope: []
  });

  const markdown = serializePlanMarkdown(plan, { researchGate: true, showRationaleInline: true });
  assert.match(markdown, /\(no tasks yet - set a project goal to get starter suggestions, or add a root task\)/);
  assert.doesNotMatch(markdown, /\[T0001\].+Add your first objective/i);

  const parsed = parsePlanMarkdown(markdown);
  assert.equal(parsed.plan.rootTaskIds.length, 0);
  assert.equal(Object.keys(parsed.plan.tasks).length, 0);
});

test("parsePlanMarkdown normalizes repeated leading marker icons in task titles", () => {
  const markdown = [
    "# Project Plan",
    "",
    "<!-- pmp:schema=v2 -->",
    "",
    "## Goals",
    "",
    "- [G0001] Track stocks offline",
    "",
    "## Plan Tree",
    "",
    "- [ ] [T0008] ⚙️ ⚙️ ⚙️ ⚙️ ⚙️ 🔍 Research local-first persistence options for selected stocks and cached quotes",
    "  <!-- pmp:id=T0008;parent=ROOT;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global -->",
    "",
    "## Execution Queue (Auto-Generated, Leaf Tasks Only)",
    "",
    "### ⚠️ Blocked (Research incomplete)",
    "(none)",
    "",
    "### 🔍 Research Tasks (act first)",
    "(none)",
    "",
    "### ⚙️ Ready to Implement",
    "1. [T0008] ⚙️ Placeholder"
  ].join("\n");

  const parsed = parsePlanMarkdown(markdown);
  const task = parsed.plan.tasks["T0008"];
  assert.ok(task);
  assert.equal(task.title, "Research local-first persistence options for selected stocks and cached quotes");

  const serialized = serializePlanMarkdown(parsed.plan, { researchGate: true, showRationaleInline: true });
  assert.match(serialized, /- \[ \] \[T0008\] ⚙️ Research local-first persistence options for selected stocks and cached quotes/);
  assert.doesNotMatch(serialized, /⚙️\s+⚙️/);
});
