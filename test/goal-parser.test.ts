import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalMarkdown } from "../src/util/GoalParser";

test("parseGoalMarkdown extracts statement from first h1 heading", () => {
  const md = `# Build a multi-tenant invoicing system\n\nSome description.`;
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.statement, "Build a multi-tenant invoicing system");
});

test("parseGoalMarkdown extracts statement from h2 heading when no h1", () => {
  const md = `## Refactor the auth layer\n\n- Do something`;
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.statement, "Refactor the auth layer");
});

test("parseGoalMarkdown falls back to first non-empty line when no heading", () => {
  const md = `\n\nImprove database performance\n\n- Use indexes`;
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.statement, "Improve database performance");
});

test("parseGoalMarkdown collects all bullets as successCriteria when no labelled sections", () => {
  const md = `# Goal\n\n- Users can log in\n- Users can export invoices\n- Admins can manage tenants`;
  const result = parseGoalMarkdown(md, []);
  assert.deepEqual(result.successCriteria, ["Users can log in", "Users can export invoices", "Admins can manage tenants"]);
  assert.deepEqual(result.constraints, []);
  assert.deepEqual(result.outOfScope, []);
});

test("parseGoalMarkdown parses ## Success Criteria section", () => {
  const md = [
    "# Build invoicing",
    "",
    "## Success Criteria",
    "",
    "- Users can create invoices",
    "- PDF export works",
    "",
    "## Constraints",
    "",
    "- Must use Node.js",
    "",
    "## Out of Scope",
    "",
    "- Payment processing"
  ].join("\n");

  const result = parseGoalMarkdown(md, []);
  assert.deepEqual(result.successCriteria, ["Users can create invoices", "PDF export works"]);
  assert.deepEqual(result.constraints, ["Must use Node.js"]);
  assert.deepEqual(result.outOfScope, ["Payment processing"]);
});

test("parseGoalMarkdown recognises Acceptance Criteria as alias for successCriteria", () => {
  const md = `# Goal\n\n## Acceptance Criteria\n\n- Feature works end-to-end`;
  const result = parseGoalMarkdown(md, []);
  assert.deepEqual(result.successCriteria, ["Feature works end-to-end"]);
});

test("parseGoalMarkdown recognises Out of Scope with hyphen variant", () => {
  const md = `# Goal\n\n## Out-of-Scope\n\n- Payments`;
  const result = parseGoalMarkdown(md, []);
  assert.deepEqual(result.outOfScope, ["Payments"]);
});

test("parseGoalMarkdown does not put success criteria bullets in constraints when sections present", () => {
  const md = [
    "# Goal",
    "",
    "## Success Criteria",
    "- Works",
    "",
    "## Constraints",
    "- No PHP"
  ].join("\n");
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.successCriteria.length, 1);
  assert.equal(result.constraints.length, 1);
  assert.equal(result.constraints[0], "No PHP");
});

test("parseGoalMarkdown assigns a unique id using existingGoals", () => {
  const existing = [{ id: "G0001" }, { id: "G0002" }];
  const result = parseGoalMarkdown("# My goal", existing);
  assert.equal(result.id, "G0003");
});

test("parseGoalMarkdown limits successCriteria to 6 bullets when no sections", () => {
  const bullets = Array.from({ length: 10 }, (_, i) => `- Item ${i + 1}`).join("\n");
  const md = `# Goal\n\n${bullets}`;
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.successCriteria.length, 6);
});

test("parseGoalMarkdown limits section bullets to 10 each", () => {
  const bullets = Array.from({ length: 12 }, (_, i) => `- Item ${i + 1}`).join("\n");
  const md = `# Goal\n\n## Success Criteria\n\n${bullets}`;
  const result = parseGoalMarkdown(md, []);
  assert.equal(result.successCriteria.length, 10);
});

test("parseGoalMarkdown handles empty content gracefully", () => {
  const result = parseGoalMarkdown("", []);
  assert.equal(result.statement, "Imported project goal");
  assert.deepEqual(result.successCriteria, []);
  assert.deepEqual(result.constraints, []);
  assert.deepEqual(result.outOfScope, []);
});
