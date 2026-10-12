import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskTitleKey, toTaskPhrase, buildStarterRootTaskSuggestions, GoalCommandService } from "../src/controller/GoalCommandService";
import { addTask, createEmptyPlanDocument, createTaskNode, type PlanDocument, type ProjectGoal } from "../src/model/index";
import type { GoalSetupPanel } from "../src/ui/GoalSetupPanel";
import type * as vscode from "vscode";

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

// Reproduces a real bug: a freshly-created plan file's onDidCreate watcher
// event used to be unguarded, so a concurrent refreshPlanState() could
// replace the live plan object while GoalSetupPanel's multi-step form was
// still open. The goal got pushed onto the orphaned pre-prompt plan, while
// starter tasks (added afterward, referencing goal.id as a plain string)
// landed on whatever plan was actually live by then - so the saved file
// showed tasks with a goalRef but an empty Goals section.
test("setProjectGoal keeps the goal attached even if the live plan object is replaced while the form is open", async () => {
  const planBeforePrompt = createEmptyPlanDocument();
  // Give the "reloaded" plan an existing root task so maybeSuggestStarterRootTasks
  // short-circuits before it needs vscode.window.showQuickPick, which this
  // minimal test harness does not mock.
  const reloadedPlan = createEmptyPlanDocument();
  addTask(reloadedPlan, createTaskNode({ id: "T0001", title: "Pre-existing root", type: "milestone", parentId: null }));

  let currentPlan: PlanDocument = planBeforePrompt;
  let persistedPlan: PlanDocument | undefined;

  const fakePanel: Pick<GoalSetupPanel, "promptForGoal"> = {
    promptForGoal: async () => {
      // Simulate a concurrent reload landing while the form is still open.
      currentPlan = reloadedPlan;
      return {
        id: "G0001",
        statement: "Ship the thing",
        successCriteria: [],
        constraints: [],
        outOfScope: []
      };
    }
  };

  const service = new GoalCommandService(
    {
      getPlan: () => currentPlan,
      ensureMutablePlan: async () => {},
      persistAndRefresh: async () => {
        persistedPlan = currentPlan;
      },
      getConfiguration: () => ({ get: () => "global" }) as unknown as vscode.WorkspaceConfiguration
    },
    {
      // Deny consent so the wording-review step (a separate concern, see
      // wording-review.test.ts) short-circuits immediately without needing
      // a real AI provider or vscode.window.showQuickPick in this harness.
      aiService: { getSelectedProvider: () => "copilot" } as unknown as import("../src/ai/AIService").AIService,
      consentService: { requestConsent: async () => false } as unknown as import("../src/ai/ConsentService").ConsentService
    },
    fakePanel as GoalSetupPanel
  );

  await service.setProjectGoal();

  assert.ok(persistedPlan, "persistAndRefresh must have been called");
  assert.equal(persistedPlan, reloadedPlan, "the plan that actually gets persisted is the one live after the prompt resolved");
  assert.equal(persistedPlan!.goals.length, 1, "the goal must survive onto whatever plan object actually gets persisted");
  assert.equal(persistedPlan!.goals[0]?.id, "G0001");
});
