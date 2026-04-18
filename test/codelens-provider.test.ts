import test from "node:test";
import assert from "node:assert/strict";
import { PlanCodeLensProvider } from "../src/ui/CodeLensProvider";

function makeDocument(content: string): { getText(): string; lineCount: number; uri: { toString(): string } } {
  const lines = content.split("\n");
  return {
    getText: () => content,
    lineCount: lines.length,
    uri: { toString: () => "file:///test/planmyproject.md" }
  };
}

const V2_PLAN = [
  "# Project Plan",
  "",
  "<!-- pmp:schema=v2 -->",
  "",
  "## Goals",
  "",
  "- [G0001] Test goal",
  "",
  "## Plan Tree",
  "",
  "- [ ] [T0001] ⚙️ Build feature",
  "  <!-- pmp:id=T0001;parent=ROOT;type=implementation;origin=manual;goalRef=G0001;confidence=null;dependsOn=[];linkedFiles=[];fileSendPolicy=global;createdAt=2026-01-01T00:00:00.000Z;completedAt=null;notes=null;archivedDebatePath=null -->",
  "",
  "## Execution Queue (Auto-Generated, Leaf Tasks Only)",
  "",
  "### ⚠️ Blocked (Dependencies, Research, Debate)",
  "(none)",
  "",
  "### 🔍 Research Tasks (act first)",
  "(none)",
  "",
  "### ⚙️ Ready to Implement",
  "(none)"
].join("\n");

const V1_PLAN = [
  "# Project Plan",
  "",
  "<!-- pmp:schema=v1 -->",
  "",
  "## Plan Tree",
  "",
  "- [ ] [T0001] Build feature",
  "",
  "## Execution Queue (Auto-Generated, Leaf Tasks Only)",
  "1. [T0001] Build feature"
].join("\n");

test("v2 plan: CodeLens provides Plan, Debate, Implement, and Scan lenses per task", () => {
  const provider = new PlanCodeLensProvider();
  const doc = makeDocument(V2_PLAN) as Parameters<typeof provider.provideCodeLenses>[0];
  const lenses = provider.provideCodeLenses(doc);

  const commands = lenses.map((l) => l.command?.command);
  assert.ok(commands.includes("planmyproject.planTask"), "Plan lens missing");
  assert.ok(commands.includes("planmyproject.debateTask"), "Debate lens missing");
  assert.ok(commands.includes("planmyproject.implementTask"), "Implement lens missing");
  assert.ok(commands.includes("planmyproject.scanTask"), "Scan lens missing");
  assert.equal(lenses.length, 4, "Expected exactly 4 lenses for one v2 task");
});

test("v1 plan: CodeLens suppresses Plan, Debate, Implement — only Scan remains", () => {
  const provider = new PlanCodeLensProvider();
  const doc = makeDocument(V1_PLAN) as Parameters<typeof provider.provideCodeLenses>[0];
  const lenses = provider.provideCodeLenses(doc);

  const commands = lenses.map((l) => l.command?.command);
  assert.ok(!commands.includes("planmyproject.planTask"), "Plan lens must be suppressed for v1");
  assert.ok(!commands.includes("planmyproject.debateTask"), "Debate lens must be suppressed for v1");
  assert.ok(!commands.includes("planmyproject.implementTask"), "Implement lens must be suppressed for v1");
  assert.ok(commands.includes("planmyproject.scanTask"), "Scan lens must remain for v1");
  assert.equal(lenses.length, 1, "Expected exactly 1 lens (Scan) for one v1 task");
});
