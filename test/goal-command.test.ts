import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskTitleKey, toTaskPhrase, buildStarterRootTaskSuggestions } from "../src/controller/GoalCommandService";
import type { ProjectGoal } from "../src/model/index";

test("normalizeTaskTitleKey lowercases and collapses whitespace", () => {
  assert.equal(normalizeTaskTitleKey("  Hello  World  "), "hello world");
  assert.equal(normalizeTaskTitleKey("UPPER"), "upper");
  assert.equal(normalizeTaskTitleKey("already normal"), "already normal");
});

test("normalizeTaskTitleKey returns empty string for blank input", () => {
  assert.equal(normalizeTaskTitleKey("   "), "");
});

test("toTaskPhrase returns short strings unchanged", () => {
  assert.equal(toTaskPhrase("Build auth", 72), "Build auth");
});

test("toTaskPhrase strips trailing punctuation", () => {
  assert.equal(toTaskPhrase("Build auth.", 72), "Build auth");
  assert.equal(toTaskPhrase("Done?!", 72), "Done");
});

test("toTaskPhrase truncates long strings with ellipsis", () => {
  const long = "a".repeat(80);
  const result = toTaskPhrase(long, 20);
  assert.ok(result.endsWith("..."));
  assert.ok(result.length <= 20);
});

test("toTaskPhrase collapses internal whitespace", () => {
  assert.equal(toTaskPhrase("foo   bar", 72), "foo bar");
});

test("buildStarterRootTaskSuggestions returns at most 6 items", () => {
  const goal: ProjectGoal = {
    id: "G0001",
    statement: "Build a multi-tenant invoicing platform",
    successCriteria: ["Users can create invoices", "Payments are processed", "Reports are exportable"],
    constraints: ["Node backend"],
    outOfScope: ["Mobile app"]
  };
  const suggestions = buildStarterRootTaskSuggestions(goal);
  assert.ok(suggestions.length <= 6);
  assert.ok(suggestions.length > 0);
});

test("buildStarterRootTaskSuggestions produces no duplicate titles", () => {
  const goal: ProjectGoal = {
    id: "G0001",
    statement: "Build invoicing",
    successCriteria: ["Same criterion", "Same criterion", "Same criterion"],
    constraints: [],
    outOfScope: []
  };
  const suggestions = buildStarterRootTaskSuggestions(goal);
  const titles = suggestions.map((s) => s.title);
  const unique = new Set(titles);
  assert.equal(unique.size, titles.length);
});

test("buildStarterRootTaskSuggestions always includes research, decision, implementation, and milestone types", () => {
  const goal: ProjectGoal = {
    id: "G0001",
    statement: "Ship the MVP",
    successCriteria: [],
    constraints: [],
    outOfScope: []
  };
  const suggestions = buildStarterRootTaskSuggestions(goal);
  const types = new Set(suggestions.map((s) => s.type));
  assert.ok(types.has("research"));
  assert.ok(types.has("decision"));
  assert.ok(types.has("implementation"));
  assert.ok(types.has("milestone"));
});
